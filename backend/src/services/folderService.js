const prisma = require('../config/database');
const fileStorageService = require('./fileStorageService');
const path = require('path');

class FolderService {
  /**
   * List all folders with hierarchy
   */
  async listFolders() {
    const folders = await prisma.folder.findMany({
      orderBy: [
        { parentId: 'asc' },
        { name: 'asc' }
      ],
      include: {
        _count: {
          select: { documents: true, children: true }
        }
      }
    });

    // Build hierarchy
    return this.buildFolderTree(folders);
  }

  /**
   * Build folder tree structure
   */
  buildFolderTree(folders, parentId = null) {
    const tree = [];
    
    folders
      .filter(folder => folder.parentId === parentId)
      .forEach(folder => {
        const node = {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          createdById: folder.createdById,
          accessMode: folder.accessMode,
          inheritPermissions: folder.inheritPermissions,
          documentsCount: folder._count.documents,
          childrenCount: folder._count.children,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
          children: this.buildFolderTree(folders, folder.id)
        };
        tree.push(node);
      });

    return tree;
  }

  /**
   * Create new folder
   */
  async createFolder(data, userId) {
    const { name, parentId } = data;

    // Validate parent folder exists if provided
    if (parentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: parentId }
      });

      if (!parentFolder) {
        throw new Error('Parent folder not found');
      }
    }

    // Check for duplicate folder name at the same level
    const existingFolder = await prisma.folder.findFirst({
      where: {
        name,
        parentId: parentId || null
      }
    });

    if (existingFolder) {
      throw new Error('A folder with this name already exists at this level');
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentId,
        createdById: userId
      },
      include: {
        _count: {
          select: { documents: true, children: true }
        }
      }
    });

    return folder;
  }

  /**
   * Update folder
   */
  async updateFolder(folderId, data, userId) {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId }
    });

    if (!folder) {
      throw new Error('Folder not found');
    }

    // Prevent moving folder into itself or its children
    if (data.parentId === folderId) {
      throw new Error('Cannot move folder into itself');
    }

    if (data.parentId) {
      const isDescendant = await this.isDescendant(folderId, data.parentId);
      if (isDescendant) {
        throw new Error('Cannot move folder into its own descendant');
      }
    }

    const nextName = data.name !== undefined ? data.name : folder.name
    const nextParentId = data.parentId !== undefined ? data.parentId : folder.parentId
    const nameChanged = nextName !== folder.name
    const parentChanged = nextParentId !== folder.parentId

    // Check for duplicate folder name when renaming or moving to another parent
    if (nameChanged || parentChanged) {
      const existingFolder = await prisma.folder.findFirst({
        where: {
          name: nextName,
          parentId: nextParentId,
          id: { not: folderId }
        }
      });

      if (existingFolder) {
        throw new Error('A folder with this name already exists at this level');
      }
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.parentId !== undefined) updateData.parentId = data.parentId;

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: updateData,
      include: {
        _count: {
          select: { documents: true, children: true }
        }
      }
    });

    return updatedFolder;
  }

  async bulkMoveFolders(folderIds, destinationParentId, userId) {
    const normalizedIds = Array.isArray(folderIds)
      ? Array.from(new Set(folderIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id))))
      : []

    if (normalizedIds.length === 0) {
      throw new Error('At least one folder is required')
    }

    const selectedFolders = await prisma.folder.findMany({
      where: { id: { in: normalizedIds } },
      select: { id: true, parentId: true }
    })

    if (selectedFolders.length !== normalizedIds.length) {
      throw new Error('One or more folders were not found')
    }

    const topLevelFolderIds = []
    for (const folder of selectedFolders) {
      let nestedInSelection = false
      let currentParentId = folder.parentId
      while (currentParentId) {
        if (normalizedIds.includes(currentParentId)) {
          nestedInSelection = true
          break
        }
        const parent = await prisma.folder.findUnique({
          where: { id: currentParentId },
          select: { parentId: true }
        })
        currentParentId = parent?.parentId || null
      }
      if (!nestedInSelection) {
        topLevelFolderIds.push(folder.id)
      }
    }

    const moved = []
    for (const folderId of topLevelFolderIds) {
      const updated = await this.updateFolder(
        folderId,
        { parentId: destinationParentId },
        userId
      )
      moved.push(updated)
    }

    return {
      moved,
      movedIds: moved.map((folder) => folder.id),
      skippedNestedIds: normalizedIds.filter((id) => !topLevelFolderIds.includes(id))
    }
  }

  /**
   * Check if targetId is a descendant of folderId
   */
  async isDescendant(folderId, targetId) {
    let currentId = targetId;
    
    while (currentId) {
      if (currentId === folderId) {
        return true;
      }

      const folder = await prisma.folder.findUnique({
        where: { id: currentId },
        select: { parentId: true }
      });

      if (!folder) break;
      currentId = folder.parentId;
    }

    return false;
  }

  async getDescendantFolderIds(folderId, { includeSelf = true } = {}) {
    const rootId = parseInt(folderId, 10)
    if (!Number.isFinite(rootId)) {
      return []
    }

    const ids = includeSelf ? [rootId] : []
    let frontier = [rootId]

    while (frontier.length > 0) {
      const children = await prisma.folder.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true }
      })

      frontier = children
        .map((child) => child.id)
        .filter((id) => Number.isFinite(id))

      ids.push(...frontier)
    }

    return Array.from(new Set(ids))
  }

  /**
   * Delete folder
   */
  async deleteFolder(folderId, userId) {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        _count: {
          select: { documents: true, children: true }
        }
      }
    });

    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check if folder has documents or subfolders
    if (folder._count.documents > 0) {
      throw new Error('Cannot delete folder with documents. Please move or delete documents first.');
    }

    if (folder._count.children > 0) {
      throw new Error('Cannot delete folder with subfolders. Please delete subfolders first.');
    }

    await prisma.folder.delete({
      where: { id: folderId }
    });

    return true;
  }

  async purgeFolder(folderId) {
    const root = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true, parentId: true, name: true }
    });

    if (!root) {
      throw new Error('Folder not found');
    }

    const folderDepth = new Map();
    folderDepth.set(root.id, 0);
    const folders = [{ id: root.id, parentId: root.parentId, depth: 0 }];
    let frontier = [root.id];

    while (frontier.length > 0) {
      const children = await prisma.folder.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true, parentId: true }
      });

      frontier = [];
      for (const child of children) {
        const depth = (folderDepth.get(child.parentId) ?? 0) + 1;
        folderDepth.set(child.id, depth);
        folders.push({ id: child.id, parentId: child.parentId, depth });
        frontier.push(child.id);
      }
    }

    const folderIds = folders.map(f => f.id);

    const documents = await prisma.document.findMany({
      where: { folderId: { in: folderIds } },
      select: {
        id: true,
        fileCode: true,
        projectCategoryId: true,
        versions: { select: { filePath: true } }
      }
    });

    const filePaths = [];
    for (const d of documents) {
      for (const v of d.versions || []) {
        if (v.filePath) filePaths.push(v.filePath);
      }
    }

    await prisma.$transaction(async (tx) => {
      const documentIds = documents.map(d => d.id)
      const uniquePairsMap = new Map()
      for (const d of documents) {
        const fc = String(d.fileCode || '').trim()
        if (!fc) continue
        const pc = d.projectCategoryId ?? null
        const key = `${fc}||${pc === null ? 'null' : String(pc)}`
        if (!uniquePairsMap.has(key)) {
          uniquePairsMap.set(key, { fileCode: fc, projectCategoryId: pc })
        }
      }

      const uniquePairs = Array.from(uniquePairsMap.values())

      if (documentIds.length > 0) {
        const pairOr = uniquePairs.map(p => ({
          fileCode: p.fileCode,
          projectCategoryId: p.projectCategoryId
        }))

        const remaining = pairOr.length
          ? await tx.document.findMany({
            where: {
              id: { notIn: documentIds },
              OR: pairOr
            },
            select: { fileCode: true, projectCategoryId: true }
          })
          : []

        const remainingPairs = new Set(
          (remaining || []).map(r => `${String(r.fileCode || '').trim()}||${(r.projectCategoryId ?? null) === null ? 'null' : String(r.projectCategoryId)}`)
        )

        const pairsToDelete = uniquePairs.filter(p => {
          const key = `${p.fileCode}||${p.projectCategoryId === null ? 'null' : String(p.projectCategoryId)}`
          return !remainingPairs.has(key)
        })

        const fileCodesToDelete = Array.from(new Set(pairsToDelete.map(p => p.fileCode).filter(Boolean)))

        if (fileCodesToDelete.length > 0) {
          await tx.archiveRegister.deleteMany({ where: { fileCode: { in: fileCodesToDelete } } })
          await tx.obsoleteRegister.deleteMany({ where: { fileCode: { in: fileCodesToDelete } } })
          await tx.versionRegister.deleteMany({ where: { fileCode: { in: fileCodesToDelete } } })
        }

        if (pairsToDelete.length > 0) {
          await tx.documentRegister.deleteMany({
            where: {
              OR: pairsToDelete.map(p => ({
                fileCode: p.fileCode,
                projectCategoryId: p.projectCategoryId
              }))
            }
          })
        }

        const codeRegistryPairs = pairsToDelete.filter(p => p.projectCategoryId !== null)
        if (codeRegistryPairs.length > 0) {
          await tx.codeRegistry.deleteMany({
            where: {
              OR: codeRegistryPairs.map(p => ({
                fileCode: p.fileCode,
                projectCategoryId: p.projectCategoryId
              }))
            }
          })
        }

        await tx.documentAssignment.deleteMany({ where: { documentId: { in: documentIds } } })
        await tx.documentComment.deleteMany({ where: { documentId: { in: documentIds } } })
        await tx.documentMetadata.deleteMany({ where: { documentId: { in: documentIds } } })
        await tx.approvalHistory.deleteMany({ where: { documentId: { in: documentIds } } })
        await tx.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
        await tx.supersedeObsoleteRequest.deleteMany({ where: { documentId: { in: documentIds } } })
        await tx.versionRequest.deleteMany({ where: { documentId: { in: documentIds } } })
        await tx.auditLog.deleteMany({ where: { entityId: { in: documentIds } } })

        await tx.document.deleteMany({ where: { id: { in: documentIds } } })
      }

      const folderIdsByDepthDesc = folders
        .slice()
        .sort((a, b) => b.depth - a.depth)
        .map(f => f.id);

      for (const id of folderIdsByDepthDesc) {
        await tx.folder.delete({ where: { id } });
      }
    });

    const dirPaths = new Set();
    let deletedFiles = 0;
    for (const fp of filePaths) {
      const ok = await fileStorageService.deleteFile(fp);
      if (ok) deletedFiles += 1;
      dirPaths.add(path.dirname(fp));
    }

    let deletedDirectories = 0;
    for (const dir of dirPaths) {
      const ok = await fileStorageService.deleteDirectory(dir);
      if (ok) deletedDirectories += 1;
    }

    return {
      deletedDocuments: documents.length,
      deletedFolders: folders.length,
      deletedFiles,
      deletedDirectories
    };
  }

  /**
   * Get documents in a folder
   */
  async getFolderDocuments(folderId, options = {}) {
    const { search, page = 1, limit = 15 } = options;

    // Verify folder exists
    const folder = await prisma.folder.findUnique({
      where: { id: folderId }
    });

    if (!folder) {
      throw new Error('Folder not found');
    }

    const where = {
      folderId,
      status: { in: ['PUBLISHED', 'OBSOLETE', 'SUPERSEDED'] } // Show published and archived documents
    };

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { fileCode: { contains: search } }
      ];
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          documentType: true,
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          versions: {
            where: { isPublished: true },
            orderBy: { uploadedAt: 'desc' },
            take: 1
          }
        }
      }),
      prisma.document.count({ where })
    ]);

    // Format documents for frontend
    const formattedDocuments = documents.map(doc => {
      const latestVersion = doc.versions[0];
      
      return {
        id: doc.id,
        fileName: latestVersion ? latestVersion.fileName : doc.title,
        fileCode: doc.fileCode,
        title: doc.title,
        isConfidential: doc.isConfidential,
        statusCode: doc.status,
        stage: doc.stage,
        type: latestVersion ? this.getFileExtension(latestVersion.fileName) : 'UNKNOWN',
        size: latestVersion ? this.formatFileSize(latestVersion.fileSize) : '0 KB',
        lastModified: doc.updatedAt.toLocaleString('en-GB', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }),
        status: this.formatDocumentStatus(doc.status, doc.stage),
        version: doc.version,
        owner: doc.owner ? `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email : '',
        documentType: doc.documentType?.name || '',
        filePath: latestVersion?.filePath
      };
    });

    return {
      documents: formattedDocuments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(fileName) {
    const ext = fileName.split('.').pop().toUpperCase();
    return ext;
  }

  /**
   * Format file size to human readable
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format document status
   */
  formatDocumentStatus(status, stage) {
    if (status === 'DRAFT') return 'Draft';
    if (stage === 'REVIEW') return 'In Review';
    if (stage === 'APPROVAL') return 'Pending Approval';
    if (status === 'PUBLISHED') return 'Approved';
    if (status === 'OBSOLETE') return 'Obsolete';
    return 'In Process';
  }

  async getFolderDownloadItems(folderId) {
    const root = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true, parentId: true, name: true }
    })

    if (!root) {
      throw new Error('Folder not found')
    }

    const folders = [root]
    let frontier = [root.id]

    while (frontier.length > 0) {
      const children = await prisma.folder.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true, parentId: true, name: true }
      })
      folders.push(...children)
      frontier = children.map((c) => c.id)
    }

    const folderIds = folders.map((f) => f.id)

    const documents = await prisma.document.findMany({
      where: {
        folderId: { in: folderIds },
        status: { in: ['PUBLISHED', 'OBSOLETE', 'SUPERSEDED'] }
      },
      select: {
        id: true,
        folderId: true,
        fileCode: true,
        title: true,
        versions: {
          where: { isPublished: true },
          orderBy: { uploadedAt: 'desc' },
          take: 1,
          select: {
            fileName: true,
            filePath: true,
            isEncrypted: true
          }
        }
      }
    })

    return { root, folders, documents }
  }
}

module.exports = new FolderService();
