const documentService = require('../services/documentService');
const folderPermissionService = require('../services/folderPermissionService');
const auditLogService = require('../services/auditLogService');
const epcRegistryService = require('../services/epcRegistryService');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const { ConflictError, ForbiddenError, BadRequestError } = require('../utils/errors');
const path = require('path');
const fs = require('fs');
const config = require('../config/app');
const prisma = require('../config/database');
const documentAssignmentService = require('../services/documentAssignmentService');

const resolveExistingFilePath = (storedPath) => {
  const raw = String(storedPath || '').trim()
  if (!raw) return null

  const forward = raw.replace(/\\/g, '/')
  const normalized = path.normalize(forward)

  const candidates = []

  if (path.isAbsolute(normalized)) {
    candidates.push(normalized)
  } else {
    candidates.push(path.resolve(process.cwd(), normalized))

    const srcDir = path.resolve(__dirname, '..')
    const backendDir = path.resolve(__dirname, '..', '..')
    candidates.push(path.resolve(srcDir, normalized))
    candidates.push(path.resolve(backendDir, normalized))

    if (String(config?.uploadDir || '').trim()) {
      candidates.push(path.resolve(config.uploadDir, normalized))
    }
  }

  const uploadMarker = '/uploads/'
  const uploadIdx = forward.lastIndexOf(uploadMarker)
  if (uploadIdx >= 0 && String(config?.uploadDir || '').trim()) {
    const suffix = forward.slice(uploadIdx + uploadMarker.length).replace(/^\/+/, '')
    candidates.push(path.join(config.uploadDir, suffix))
  }

  const leadingUploads = forward.replace(/^\.\//, '')
  if ((leadingUploads.startsWith('uploads/') || leadingUploads.startsWith('uploads\\')) && String(config?.uploadDir || '').trim()) {
    const suffix = leadingUploads.replace(/^uploads[\\/]/, '').replace(/^\/+/, '')
    candidates.push(path.join(config.uploadDir, suffix))
  }

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p
    } catch {}
  }

  return null
}

class DocumentController {
  /**
   * Create new document
   * POST /api/documents
   */
  createDocument = asyncHandler(async (req, res) => {
    const { title, description, documentTypeId, projectCategoryId, folderId } = req.body;

    // Validation
    const errors = [];
    if (!title) errors.push({ field: 'title', message: 'Title is required' });
    if (!documentTypeId) errors.push({ field: 'documentTypeId', message: 'Document type is required' });

    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    const document = await documentService.createDocument({
      title,
      description,
      documentTypeId: parseInt(documentTypeId),
      projectCategoryId: projectCategoryId ? parseInt(projectCategoryId) : null,
      folderId: folderId ? parseInt(folderId) : null
    }, req.user.id);

    return ResponseFormatter.success(
      res,
      { document },
      'Document created successfully',
      201
    );
  });

  /**
   * Upload document file
   * POST /api/documents/:id/upload
   */
  uploadDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);

    if (!req.file) {
      return ResponseFormatter.validationError(res, [
        { field: 'file', message: 'File is required' }
      ]);
    }

    const version = await documentService.uploadDocumentVersion(
      documentId,
      req.file,
      req.user.id
    );

    await epcRegistryService.generateForUploadedDraft(documentId, version.id, req)

    // Log file upload
    await auditLogService.logDocument(req.user.id, 'UPLOAD', { id: documentId, fileCode: version.document?.fileCode || documentId }, req, {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      versionId: version.id
    });

    return ResponseFormatter.success(
      res,
      { version },
      'Document file uploaded successfully'
    );
  });

  bulkImportPublished = asyncHandler(async (req, res) => {
    const { folderId, description, title, filesMeta, allowReassign } = req.body;

    const errors = [];
    if (!folderId) errors.push({ field: 'folderId', message: 'Folder is required' });
    if (!req.files || req.files.length === 0) errors.push({ field: 'files', message: 'At least one file is required' });

    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    const folderIdInt = parseInt(folderId);
    if (Number.isNaN(folderIdInt)) {
      return ResponseFormatter.validationError(res, [
        { field: 'folderId', message: 'Invalid folderId' }
      ]);
    }
    const desc = description || '';
    const singleTitle = typeof title === 'string' ? title.trim() : '';
    const allowReassignFlag = String(allowReassign || '').toLowerCase() === 'true'
    let parsedMeta = null
    if (typeof filesMeta === 'string' && filesMeta.trim()) {
      try {
        const v = JSON.parse(filesMeta)
        if (Array.isArray(v)) parsedMeta = v
      } catch (_) {
        parsedMeta = null
      }
    }

    const baseFolder = await prisma.folder.findUnique({
      where: { id: folderIdInt },
      select: { id: true, accessMode: true }
    })
    if (!baseFolder) {
      return ResponseFormatter.validationError(res, [
        { field: 'folderId', message: 'Folder not found' }
      ])
    }

    const folderConfigById = new Map([[baseFolder.id, { accessMode: baseFolder.accessMode }]])
    const folderByParentAndName = new Map()

    const sanitizeFolderName = (s) => {
      const v = String(s || '').replace(/\0/g, '').trim()
      if (!v) return ''
      if (v === '.' || v === '..') return ''
      return v.length > 255 ? v.slice(0, 255) : v
    }

    const extractFolderSegments = (relativePath) => {
      const rp = String(relativePath || '').trim()
      if (!rp) return []
      const normalized = rp.replace(/\\/g, '/').replace(/^\/+/, '')
      const parts = normalized.split('/').filter(Boolean)
      if (parts.length <= 1) return []
      return parts.slice(0, -1).map(sanitizeFolderName).filter(Boolean)
    }

    const getBaseName = (relativePath, fallback) => {
      const src = String(relativePath || '').trim()
      if (src) {
        const normalized = src.replace(/\\/g, '/')
        const last = normalized.split('/').filter(Boolean).pop()
        if (last) return last
      }
      return String(fallback || '')
    }

    const ensureFolderPath = async (rootId, segments) => {
      let currentId = rootId
      for (const segRaw of segments || []) {
        const seg = sanitizeFolderName(segRaw)
        if (!seg) continue
        const cacheKey = `${currentId}:${seg}`
        const cachedId = folderByParentAndName.get(cacheKey)
        if (cachedId) {
          currentId = cachedId
          continue
        }
        const existing = await prisma.folder.findFirst({
          where: { parentId: currentId, name: seg },
          select: { id: true }
        })
        if (existing) {
          folderByParentAndName.set(cacheKey, existing.id)
          currentId = existing.id
          if (!folderConfigById.has(existing.id)) {
            const cfg = await prisma.folder.findUnique({ where: { id: existing.id }, select: { accessMode: true } })
            if (cfg) folderConfigById.set(existing.id, { accessMode: cfg.accessMode })
          }
          continue
        }

        let parentCfg = folderConfigById.get(currentId)
        if (!parentCfg) {
          const cfg = await prisma.folder.findUnique({ where: { id: currentId }, select: { accessMode: true } })
          parentCfg = cfg ? { accessMode: cfg.accessMode } : { accessMode: 'PUBLIC' }
          folderConfigById.set(currentId, parentCfg)
        }

        const created = await prisma.folder.create({
          data: {
            name: seg,
            parentId: currentId,
            createdById: req.user.id,
            accessMode: parentCfg.accessMode,
            inheritPermissions: true
          },
          select: { id: true, accessMode: true }
        })
        folderByParentAndName.set(cacheKey, created.id)
        folderConfigById.set(created.id, { accessMode: created.accessMode })
        currentId = created.id
      }
      return currentId
    }

    const documentTypes = await prisma.documentType.findMany({
      select: { id: true, name: true, prefix: true, isActive: true }
    })
    const typeByPrefix = new Map(documentTypes.map((dt) => [dt.prefix, dt]))
    const typeByPrefixLower = new Map(documentTypes.map((dt) => [String(dt.prefix || '').toLowerCase(), dt]))
    const typeById = new Map(documentTypes.map((dt) => [dt.id, dt]))
    const othersTypeId = (() => {
      const byName = documentTypes.find((dt) => dt?.isActive && String(dt?.name || '').toLowerCase() === 'others')
      if (byName) return byName.id
      const byPrefix = documentTypes.find((dt) => dt?.isActive && String(dt?.prefix || '').toLowerCase() === 'oth')
      if (byPrefix) return byPrefix.id
      return null
    })()

    const reserved = { fileCodes: new Set(), runningByCodeKey: new Map() }
    const reserveAllocation = (allocation) => {
      const codeKey = allocation?.codeKey
      const rn = allocation?.suggestedRunningNumber
      const fc = allocation?.suggestedFileCode
      if (codeKey && Number.isFinite(Number(rn))) {
        const set = reserved.runningByCodeKey.get(codeKey) || new Set()
        set.add(parseInt(rn, 10))
        reserved.runningByCodeKey.set(codeKey, set)
      }
      if (fc) reserved.fileCodes.add(fc)
    }

    const allocationsByIndex = new Map()
    const conflicts = []
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i]
      const meta = parsedMeta?.[i] && typeof parsedMeta[i] === 'object' ? parsedMeta[i] : null
      const relPath = meta && typeof meta.relativePath === 'string' ? meta.relativePath : ''
      const baseName = getBaseName(relPath, file.originalname)
      const derivedTitle = path.basename(baseName, path.extname(baseName)).trim() || baseName
      const metaTitle = meta && typeof meta.title === 'string' ? meta.title.trim() : ''
      const docTitle = req.files.length === 1 && singleTitle ? singleTitle : (metaTitle || derivedTitle)
      const isClientDocument = Boolean(meta?.isClientDocument)

      const derivedFileCode = (() => {
        const base = derivedTitle
        const sepIdx = base.indexOf('_')
        if (sepIdx > 0) return base.slice(0, sepIdx).trim()
        return base.trim()
      })()
      const metaFileCode = meta && typeof meta.fileCode === 'string' ? meta.fileCode.trim() : ''
      const fileCodeToUse = isClientDocument ? '' : (metaFileCode || derivedFileCode)
      if (!isClientDocument && !fileCodeToUse) continue

      const metaDocTypeIdRaw = meta?.documentTypeId
      const metaDocTypeId = Number.isFinite(Number(metaDocTypeIdRaw)) ? parseInt(metaDocTypeIdRaw) : null
      const metaProjectCategoryIdRaw = meta?.projectCategoryId
      const metaProjectCategoryId = Number.isFinite(Number(metaProjectCategoryIdRaw)) ? parseInt(metaProjectCategoryIdRaw) : null

      let documentTypeIdToUse = null
      if (metaDocTypeId) {
        const dt = typeById.get(metaDocTypeId)
        if (!dt || !dt.isActive) continue
        documentTypeIdToUse = dt.id
      } else {
        if (isClientDocument) continue
        const prefixMatch = String(fileCodeToUse).match(/^[A-Za-z]+/)
        const prefix = prefixMatch?.[0] || ''
        if (!prefix) continue
        const dt = typeByPrefix.get(prefix) || typeByPrefixLower.get(prefix.toLowerCase())
        if (!dt || !dt.isActive) continue
        documentTypeIdToUse = dt.id
      }

      if (isClientDocument) continue
      if (!metaProjectCategoryId) continue

      const allocation = await documentService.resolveImportedPublishedFileCode({
        fileCode: fileCodeToUse,
        documentTypeId: documentTypeIdToUse,
        projectCategoryId: metaProjectCategoryId
      }, reserved)

      reserveAllocation(allocation)
      allocationsByIndex.set(i, allocation)
      if (allocation.suggestedFileCode !== allocation.normalizedRequested) {
        conflicts.push({
          lineNumber: i + 1,
          fileName: baseName,
          requestedFileCode: allocation.normalizedRequested,
          suggestedFileCode: allocation.suggestedFileCode,
          documentTitle: docTitle,
          reasonCode: 'RUNNING_NUMBER_TAKEN'
        })
      }
    }

    if (conflicts.length > 0 && !allowReassignFlag) {
      const err = new ConflictError('File code redundant. Confirmation required.')
      err.code = 'FILE_CODE_REASSIGN_REQUIRED'
      err.errors = conflicts
      throw err
    }

    const imported = [];
    const failed = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i]
      try {
        const meta = parsedMeta?.[i] && typeof parsedMeta[i] === 'object' ? parsedMeta[i] : null
        const relPath = meta && typeof meta.relativePath === 'string' ? meta.relativePath : ''
        const baseName = getBaseName(relPath, file.originalname)
        const derivedTitle = path.basename(baseName, path.extname(baseName)).trim() || baseName
        const metaTitle = meta && typeof meta.title === 'string' ? meta.title.trim() : ''
        const docTitle = req.files.length === 1 && singleTitle ? singleTitle : (metaTitle || derivedTitle)
        const isClientDocument = Boolean(meta?.isClientDocument)

        const derivedFileCode = (() => {
          const base = derivedTitle
          const sepIdx = base.indexOf('_')
          if (sepIdx > 0) return base.slice(0, sepIdx).trim()
          return base.trim()
        })()
        const metaFileCode = meta && typeof meta.fileCode === 'string' ? meta.fileCode.trim() : ''
        const fileCodeToUse = isClientDocument ? '' : (metaFileCode || derivedFileCode)
        if (!isClientDocument && !fileCodeToUse) {
          throw new Error('File code is required')
        }

        const metaDocTypeIdRaw = meta?.documentTypeId
        const metaDocTypeId = Number.isFinite(Number(metaDocTypeIdRaw)) ? parseInt(metaDocTypeIdRaw) : null
        const metaProjectCategoryIdRaw = meta?.projectCategoryId
        const metaProjectCategoryId = Number.isFinite(Number(metaProjectCategoryIdRaw)) ? parseInt(metaProjectCategoryIdRaw) : null

        let documentTypeIdToUse = null
        if (isClientDocument) {
          if (!othersTypeId) {
            throw new Error('Document type "Others" not found. Please create it in System Configuration.')
          }
          documentTypeIdToUse = othersTypeId
        } else if (metaDocTypeId) {
          const dt = typeById.get(metaDocTypeId)
          if (!dt || !dt.isActive) {
            throw new Error('Document type not found')
          }
          documentTypeIdToUse = dt.id
        } else {
          const prefixMatch = String(fileCodeToUse).match(/^[A-Za-z]+/)
          const prefix = prefixMatch?.[0] || ''
          if (!prefix) {
            throw new Error(`Unable to determine document type for "${fileCodeToUse}"`)
          }
          const dt = typeByPrefix.get(prefix) || typeByPrefixLower.get(prefix.toLowerCase())
          if (!dt || !dt.isActive) {
            throw new Error(`Document type not found for prefix "${prefix}"`)
          }
          documentTypeIdToUse = dt.id
        }

        const planned = allocationsByIndex.get(i)
        const finalFileCodeToUse = (!isClientDocument && planned)
          ? (allowReassignFlag ? planned.suggestedFileCode : planned.normalizedRequested)
          : fileCodeToUse
        const wasReassigned = Boolean(!isClientDocument && planned && planned.suggestedFileCode !== planned.normalizedRequested && allowReassignFlag)

        const created = await documentService.createImportedPublishedDocument({
          fileCode: finalFileCodeToUse,
          isClientDocument,
          title: docTitle,
          description: desc,
          documentTypeId: documentTypeIdToUse,
          projectCategoryId: metaProjectCategoryId,
          folderId: await (async () => {
            const segments = extractFolderSegments(relPath)
            if (segments.length === 0) return folderIdInt
            return ensureFolderPath(folderIdInt, segments)
          })()
        }, req.user.id);

        const document = created?.document || created
        if (wasReassigned) {
          const ext = path.extname(baseName) || path.extname(file.originalname) || ''
          const codeNoSep = String(finalFileCodeToUse || document.fileCode || '')
            .replace(/[^A-Za-z0-9]/g, '')
          const safeTitle = String(docTitle || '')
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .trim()
          const name = `${codeNoSep}_${safeTitle || codeNoSep}${ext}`
          file.displayName = name.length > 255 ? name.slice(0, 255) : name
        }

        await documentService.uploadDocumentVersion(document.id, file, req.user.id);

        await prisma.document.update({
          where: { id: document.id },
          data: { status: 'READY_TO_PUBLISH', stage: 'READY_TO_PUBLISH' }
        });

        const workflowService = require('../services/workflowService');
        await workflowService.publishDocument(document.id, req.user.id, document.folderId || folderIdInt, 'Bulk import');

        imported.push({
          id: document.id,
          fileCode: document.isClientDocument ? '-' : document.fileCode,
          title: document.title,
          fileName: file.displayName || baseName
        });
      } catch (error) {
        const reasonCode = String(error?.code || error?.name || 'IMPORT_FAILED')
        failed.push({
          lineNumber: i + 1,
          fileName: file?.originalname || 'unknown',
          reasonCode,
          message: error?.message || 'Failed to import file'
        });
      }
    }

    return ResponseFormatter.success(
      res,
      {
        imported,
        failed,
        counts: { imported: imported.length, failed: failed.length }
      },
      'Bulk import completed'
    );
  });

  /**
   * Get document by ID
   * GET /api/documents/:id
   */
  getDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const document = await documentService.getDocumentById(documentId, req.user);

    return ResponseFormatter.success(
      res,
      { document },
      'Document retrieved successfully'
    );
  });

  getDocumentRemarks = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    if (!Number.isFinite(documentId)) {
      throw new BadRequestError('Invalid document id');
    }

    const actionRaw = String(req.query?.action || 'RETURNED')
      .split(',')
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean);

    const allowedActions = new Set([
      'SUBMITTED',
      'REVIEWED',
      'FIRST_APPROVED',
      'SECOND_APPROVED',
      'READY_FOR_PUBLISH',
      'PUBLISHED',
      'REJECTED',
      'ACKNOWLEDGED',
      'RETURNED',
      'SUPERSEDED',
      'OBSOLETED',
      'ARCHIVED',
      'APPROVED'
    ]);

    const actions = actionRaw.filter((a) => allowedActions.has(a));
    if (actions.length === 0) {
      throw new BadRequestError('Invalid action filter');
    }

    const canAccess = await documentAssignmentService.canAccessDocument(documentId, req.user);
    if (!canAccess) {
      throw new ForbiddenError('You do not have permission to view remarks for this document');
    }

    const remarks = await prisma.approvalHistory.findMany({
      where: {
        documentId,
        action: { in: actions }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const data = (remarks || []).map((r) => ({
      id: r.id,
      action: r.action,
      stage: r.stage,
      comments: r.comments || '',
      createdAt: r.createdAt,
      user: r.user
        ? {
            id: r.user.id,
            name: `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim() || r.user.email || '',
            email: r.user.email || ''
          }
        : null
    }));

    return ResponseFormatter.success(res, { remarks: data }, 'Remarks retrieved successfully');
  });

  /**
   * Get document by file code
   * GET /api/documents/code/:fileCode
   */
  getDocumentByCode = asyncHandler(async (req, res) => {
    const { fileCode } = req.params;
    const { projectCategoryId } = req.query;
    const document = await documentService.getDocumentByFileCode(fileCode, projectCategoryId || null);

    return ResponseFormatter.success(
      res,
      { document },
      'Document retrieved successfully'
    );
  });

  /**
   * Search documents
   * GET /api/documents/search
   */
  searchDocuments = asyncHandler(async (req, res) => {
    const { query, status } = req.query;

    if (!query || query.trim().length < 2) {
      return ResponseFormatter.success(res, { documents: [] }, 'Search query too short');
    }

    const filters = {
      search: query.trim(),
      status: status || undefined
    };

    const pagination = {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    };

    const result = await documentService.listDocuments(filters, pagination, req.user);

    // Format for frontend
    const documents = result.documents.map(doc => ({
      id: doc.id,
      fileCode: doc.fileCode,
      title: doc.title,
      documentType: doc.documentType?.name || '',
      projectCategory: doc.projectCategory?.name || '',
      version: doc.version,
      status: doc.status
    }));

    return ResponseFormatter.success(
      res,
      { documents },
      'Search completed successfully'
    );
  });

  /**
   * List documents with filters
   * GET /api/documents
   */
  listDocuments = asyncHandler(async (req, res) => {
    const {
      status,
      stage,
      documentTypeId,
      createdById,
      ownerId,
      search,
      startDate,
      endDate,
      page,
      limit,
      sortBy,
      sortOrder
    } = req.query;

    const filters = {
      status,
      stage,
      documentTypeId: documentTypeId ? parseInt(documentTypeId) : undefined,
      createdById: createdById ? parseInt(createdById) : undefined,
      ownerId: ownerId ? parseInt(ownerId) : undefined,
      search,
      startDate,
      endDate
    };

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 15,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc'
    };

    const result = await documentService.listDocuments(filters, pagination, req.user);

    return ResponseFormatter.paginated(
      res,
      result.documents,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Documents retrieved successfully'
    );
  });

  /**
   * Get user's draft documents
   * GET /api/documents/drafts
   */
  getUserDrafts = asyncHandler(async (req, res) => {
    const { page, limit } = req.query;

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 15
    };

    const result = await documentService.getUserDrafts(req.user.id, pagination);
    
    // Format documents to show proper status display
    const documents = result.documents.map(doc => {
      const latestVersion = doc.versions && doc.versions.length > 0 ? doc.versions[0] : null;
      const latestReturn = doc.approvalHistory && doc.approvalHistory.length > 0 ? doc.approvalHistory[0] : null;
      const latestReturnUser = latestReturn?.user || null;
      
      return {
        id: doc.id,
        fileCode: doc.fileCode,
        title: doc.title,
        documentType: doc.documentType?.name || null,
        projectCategory: doc.projectCategory ? {
          id: doc.projectCategory.id,
          name: doc.projectCategory.name,
          code: doc.projectCategory.code
        } : null,
        version: doc.version,
        status: this.formatDocumentStatus(doc.status, doc.stage),
        rawStatus: doc.status,
        stage: doc.stage,
        hasFile: !!latestVersion,
        latestReturnRemark: latestReturn?.comments || null,
        latestReturnRemarkAt: latestReturn?.createdAt || null,
        latestReturnRemarkBy: latestReturnUser
          ? `${latestReturnUser.firstName || ''} ${latestReturnUser.lastName || ''}`.trim() || latestReturnUser.email || ''
          : null,
        createdBy: doc.createdBy ? `${doc.createdBy.firstName || ''} ${doc.createdBy.lastName || ''}`.trim() || doc.createdBy.email : '',
        owner: doc.owner ? `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email : '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      };
    });

    return ResponseFormatter.paginated(
      res,
      documents,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Draft documents retrieved successfully'
    );
  });

  /**
   * Get documents pending review/approval
   * GET /api/documents/review-approval
   */
  getReviewApprovalDocuments = asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const userId = req.user.id;
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
    const canViewAllReadyToPublish = roles.includes('admin') || roles.includes('document_controller');

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 100
    };

    // Get documents in workflow stages where user is ASSIGNED (not owned):
    // 1. Documents where user is assigned as reviewer (via ApprovalHistory with SUBMITTED action)
    // 2. Documents where user is assigned as first approver (firstApproverId)
    // 3. Documents where user is assigned as second approver (secondApproverId)
    // NOTE: Document owners should NOT see their own documents here - only assigned reviewers/approvers
    const stages = ['REVIEW', 'APPROVAL', 'FIRST_APPROVAL', 'SECOND_APPROVAL', 'READY_TO_PUBLISH'];
    const assignmentFilters = [
      { reviewerId: userId },
      { firstApproverId: userId },
      { secondApproverId: userId },
      {
        assignments: {
          some: {
            userId: userId
          }
        }
      }
    ];

    if (canViewAllReadyToPublish) {
      assignmentFilters.push({ stage: 'READY_TO_PUBLISH' });
    }
    
    const documents = await prisma.document.findMany({
      where: {
        stage: { in: stages },
        OR: assignmentFilters
      },
      include: {
        documentType: true,
        projectCategory: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        firstApprover: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        secondApprover: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        assignments: {
          select: {
            userId: true,
            assignmentType: true
          }
        },
        versions: {
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: pagination.limit
    });
    
    const formattedDocuments = documents.map(doc => {
      // Determine display stage based on actual stage
      let displayStage = doc.stage;
      if (doc.stage === 'REVIEW') displayStage = 'Review';
      else if (doc.stage === 'APPROVAL') displayStage = 'Approval';
      else if (doc.stage === 'FIRST_APPROVAL') displayStage = 'FIRST_APPROVAL';
      else if (doc.stage === 'SECOND_APPROVAL') displayStage = 'SECOND_APPROVAL';
      else if (doc.stage === 'READY_TO_PUBLISH') displayStage = 'READY_TO_PUBLISH';
      else if (doc.stage === 'ACKNOWLEDGMENT') displayStage = 'Acknowledge';
      
      // Get latest version for filename
      const latestVersion = doc.versions && doc.versions.length > 0 ? doc.versions[0] : null;
      
      return {
        id: doc.id,
        fileCode: doc.fileCode,
        title: doc.title,
        documentType: doc.documentType?.name || '',
        version: doc.version,
        fileName: latestVersion?.fileName || null,
        submittedDate: doc.submittedAt ? new Date(doc.submittedAt).toLocaleDateString('en-GB') : '',
        submittedBy: doc.owner ? `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email : '',
        ownerId: doc.owner?.id || null,
        reviewerId: doc.reviewer?.id || null,
        reviewerName: doc.reviewer ? `${doc.reviewer.firstName || ''} ${doc.reviewer.lastName || ''}`.trim() || doc.reviewer.email : null,
        firstApproverId: doc.firstApprover?.id || null,
        firstApproverName: doc.firstApprover ? `${doc.firstApprover.firstName || ''} ${doc.firstApprover.lastName || ''}`.trim() || doc.firstApprover.email : null,
        secondApproverId: doc.secondApprover?.id || null,
        secondApproverName: doc.secondApprover ? `${doc.secondApprover.firstName || ''} ${doc.secondApprover.lastName || ''}`.trim() || doc.secondApprover.email : null,
        lastUpdated: doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString('en-GB') : '',
        stage: displayStage,
        currentStage: displayStage,
        status: doc.status,
        type: 'document',
        assignments: doc.assignments || []
      };
    });

    // Also get supersede/obsolete requests in review or approval stages where user is involved
    const supersedeRequests = await prisma.supersedeObsoleteRequest.findMany({
      where: {
        stage: {
          in: ['REVIEW', 'APPROVAL']
        },
        status: {
          in: ['PENDING_REVIEW', 'IN_REVIEW', 'PENDING_APPROVAL', 'IN_APPROVAL']
        },
        OR: [
          { requestedById: userId },
          { reviewedById: userId },
          { approvedById: userId },
          {
            document: {
              ownerId: userId
            }
          }
        ]
      },
      include: {
        document: {
          include: {
            documentType: true,
            owner: true,
            versions: {
              orderBy: { uploadedAt: 'desc' },
              take: 1
            }
          }
        },
        supersedingDoc: true,
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Format supersede requests to match document structure
    const formattedSupersedeRequests = supersedeRequests.map(req => {
      const doc = req.document;
      const latestVersion = doc.versions && doc.versions.length > 0 ? doc.versions[0] : null;
      
      // Determine display stage
      let displayStage = req.stage === 'REVIEW' ? 'Review' : 'Approval';
      
      return {
        id: req.id,
        documentId: doc.id,
        fileCode: doc.fileCode,
        title: `${doc.title} (${req.actionType === 'OBSOLETE' ? 'Obsolete' : 'Supersede'} Request)`,
        documentType: doc.documentType?.name || '',
        version: doc.version,
        fileName: latestVersion?.fileName || null,
        submittedDate: req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-GB') : '',
        submittedBy: req.requestedBy ? `${req.requestedBy.firstName || ''} ${req.requestedBy.lastName || ''}`.trim() || req.requestedBy.email : '',
        lastUpdated: req.updatedAt ? new Date(req.updatedAt).toLocaleDateString('en-GB') : '',
        stage: displayStage,
        currentStage: displayStage,
        status: req.status,
        type: 'supersede-request',
        actionType: req.actionType,
        reason: req.reason,
        assignments: []
      };
    });

    // Combine documents and supersede requests
    const allItems = [...formattedDocuments, ...formattedSupersedeRequests];

    // Add no-cache headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return ResponseFormatter.success(
      res,
      { documents: allItems },
      'Review and approval documents retrieved successfully'
    );
  });

  /**
   * Get superseded/obsolete documents
   * GET /api/documents/superseded-obsolete
   */
  getSupersededObsoleteDocuments = asyncHandler(async (req, res) => {
    const { page, limit } = req.query;

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 100
    };

    // Get both superseded and obsolete documents
    const [obsoleteResult, supersededResult] = await Promise.all([
      documentService.listDocuments({ status: 'OBSOLETE' }, pagination, req.user),
      documentService.listDocuments({ status: 'SUPERSEDED' }, pagination, req.user)
    ]);

    // Combine all documents
    const allDocs = [...obsoleteResult.documents, ...supersededResult.documents];
    
    console.log(`Found ${allDocs.length} superseded/obsolete documents`);
    
    // Format documents for frontend
    const documents = allDocs.map(doc => {
      // Get superseding document info if available
      let supersededByInfo = '-';
      if (doc.supersededById) {
        // In a real implementation, you'd fetch this document
        supersededByInfo = `Document ID: ${doc.supersededById}`;
      }
      
      return {
        id: doc.id,
        fileCode: doc.fileCode,
        title: doc.title,
        documentType: doc.documentType?.name || '',
        version: doc.version,
        obsoleteDate: doc.obsoleteDate ? new Date(doc.obsoleteDate).toLocaleDateString('en-GB') : '',
        reason: doc.obsoleteReason || 'No reason provided',
        supersededBy: supersededByInfo,
        status: doc.status === 'OBSOLETE' ? 'Obsolete' : 'Superseded',
        owner: doc.owner ? `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email : ''
      };
    });

    return ResponseFormatter.success(
      res,
      { documents },
      'Superseded/Obsolete documents retrieved successfully'
    );
  });

  /**
   * Get all documents for current user with comprehensive status tracking
   * GET /api/documents/my-status
   */
  getMyDocuments = asyncHandler(async (req, res) => {
    const { page, limit, status, stage } = req.query;

    const filters = {
      ownerId: req.user.id
    };

    // Apply additional filters if provided
    if (status) filters.status = status.toUpperCase();
    if (stage) filters.stage = stage.toUpperCase();

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 100
    };

    const result = await documentService.listDocuments(filters, pagination, req.user);
    
    // Format for frontend with comprehensive tracking information
    const documents = result.documents.map(doc => {
      // Get the latest version info
      const latestVersion = doc.versions && doc.versions.length > 0 ? doc.versions[0] : null;
      
      // Debug log for documentType
      if (!doc.documentType) {
        console.warn(`Document ${doc.id} (${doc.fileCode}) is missing documentType relation`);
      }
      
      return {
        id: doc.id,
        fileCode: (doc.status === 'PENDING_ACKNOWLEDGMENT' ? '-' : doc.fileCode),
        title: doc.title,
        documentType: doc.documentType?.name || null,
        documentTypePrefix: doc.documentType?.prefix || null,
        projectCategory: doc.projectCategory?.name || null,
        version: doc.version,
        lastUpdated: doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString('en-GB') : '',
        updatedAt: doc.updatedAt,
        status: this.formatDocumentStatus(doc.status, doc.stage),
        rawStatus: doc.status,
        stage: doc.stage,
        // Workflow tracking dates
        createdAt: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB') : '',
        submittedAt: doc.submittedAt ? new Date(doc.submittedAt).toLocaleDateString('en-GB') : null,
        reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toLocaleDateString('en-GB') : null,
        approvedAt: doc.approvedAt ? new Date(doc.approvedAt).toLocaleDateString('en-GB') : null,
        firstApprovedAt: doc.firstApprovedAt ? new Date(doc.firstApprovedAt).toLocaleDateString('en-GB') : null,
        secondApprovedAt: doc.secondApprovedAt ? new Date(doc.secondApprovedAt).toLocaleDateString('en-GB') : null,
        acknowledgedAt: doc.acknowledgedAt ? new Date(doc.acknowledgedAt).toLocaleDateString('en-GB') : null,
        publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toLocaleDateString('en-GB') : null,
        obsoleteDate: doc.obsoleteDate ? new Date(doc.obsoleteDate).toLocaleDateString('en-GB') : null,
        // User information
        owner: doc.owner ? `${doc.owner.firstName || ''} ${doc.owner.lastName || ''}`.trim() || doc.owner.email : '',
        createdBy: doc.createdBy ? `${doc.createdBy.firstName || ''} ${doc.createdBy.lastName || ''}`.trim() || doc.createdBy.email : '',
        // File information
        hasFile: !!latestVersion,
        fileName: latestVersion?.fileName || null,
        // Additional metadata
        description: doc.description || '',
        obsoleteReason: doc.obsoleteReason || null,
        supersededById: doc.supersededById || null
      };
    });

    return ResponseFormatter.success(
      res,
      { documents },
      'My documents retrieved successfully'
    );
  });

  /**
   * Get documents by status for current user
   * GET /api/documents/my-status/:status
   */
  getMyDocumentsByStatus = asyncHandler(async (req, res) => {
    const { status } = req.params;
    const { page, limit } = req.query;

    const filters = {
      ownerId: req.user.id,
      status: status.toUpperCase()
    };

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 15
    };

    const result = await documentService.listDocuments(filters, pagination, req.user);

    return ResponseFormatter.paginated(
      res,
      result.documents,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      `${status} documents retrieved successfully`
    );
  });

  /**
   * Helper to format document status for frontend
   * Covers all workflow stages from NDR to Archive
   */
  formatDocumentStatus(status, stage) {
    // Map all possible statuses
    const statusMap = {
      'PENDING_ACKNOWLEDGMENT': 'Pending Acknowledgment',
      'ACKNOWLEDGED': stage === 'DRAFT' ? 'Drafting' : 'Acknowledged',
      'DRAFT': 'Draft',
      'PENDING_REVIEW': 'Waiting for Review',
      'IN_REVIEW': 'In Review',
      'RETURNED': 'Return for Amendments',
      'PENDING_APPROVAL': 'Waiting for Approval',
      'IN_APPROVAL': 'In Approval',
      'PENDING_FIRST_APPROVAL': 'Pending First Approval',
      'IN_FIRST_APPROVAL': 'In First Approval',
      'PENDING_SECOND_APPROVAL': 'Pending Second Approval',
      'IN_SECOND_APPROVAL': 'In Second Approval',
      'READY_TO_PUBLISH': 'Ready to Publish',
      'APPROVED': 'Approved',
      'REJECTED': 'Rejected',
      'PUBLISHED': 'Published',
      'SUPERSEDED': 'Superseded',
      'OBSOLETE': 'Obsolete',
      'ARCHIVED': 'Archived'
    };

    // If status is explicitly mapped, use it
    if (statusMap[status]) {
      return statusMap[status];
    }

    // Otherwise, derive from stage
    const stageMap = {
      'DRAFT': 'Draft',
      'REVIEW': 'Waiting for Review',
      'APPROVAL': 'In Approval', // Legacy approval stage
      'Approval': 'In Approval', // Legacy approval stage (capitalized)
      'FIRST_APPROVAL': 'In First Approval',
      'SECOND_APPROVAL': 'In Second Approval',
      'READY_TO_PUBLISH': 'Ready to Publish',
      'ACKNOWLEDGMENT': 'Pending Acknowledgment',
      'PUBLISHED': 'Published',
      'SUPERSEDED': 'Superseded',
      'OBSOLETE': 'Obsolete'
    };

    return stageMap[stage] || 'In Process';
  }

  /**
   * Update document
   * PUT /api/documents/:id
   */
  updateDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const { title, description, projectCategoryId, status, stage } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (projectCategoryId !== undefined) updateData.projectCategoryId = projectCategoryId ? parseInt(projectCategoryId) : null;
    if (status !== undefined) updateData.status = status;
    if (stage !== undefined) updateData.stage = stage;

    const document = await documentService.updateDocument(
      documentId,
      updateData,
      req.user.id
    );

    // Log document update
    await auditLogService.logDocument(req.user.id, 'UPDATE', document, req, {
      updatedFields: Object.keys(updateData)
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document updated successfully'
    );
  });

  renameDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const rawName = req.body?.fileName ?? req.body?.name ?? req.body?.title
    const inputName = String(rawName || '').trim()

    if (!inputName) {
      return ResponseFormatter.validationError(res, [{ field: 'fileName', message: 'File name is required' }])
    }

    if (/[\\\/]/.test(inputName)) {
      return ResponseFormatter.validationError(res, [{ field: 'fileName', message: 'Invalid file name' }])
    }

    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, fileCode: true, folderId: true }
    })
    if (!existing) {
      return ResponseFormatter.notFound(res, 'Document')
    }

    const isAdmin = req.user?.roles?.some((roleName) =>
      ['Admin', 'Administrator', 'ADMIN', 'admin'].includes(roleName)
    ) || false

    if (existing.folderId) {
      await folderPermissionService.assertCan(existing.folderId, req.user, 'edit')
    } else if (!isAdmin) {
      return ResponseFormatter.error(res, 'Permission denied', 403)
    }

    const versions = await documentService.getDocumentVersions(documentId)
    const latest = versions[0]
    if (!latest) {
      return ResponseFormatter.notFound(res, 'Document version')
    }

    const currentFileName = String(latest.fileName || '')
    const currentExt = currentFileName.includes('.') ? currentFileName.split('.').pop() : ''
    const inputHasExt = inputName.includes('.') && !inputName.endsWith('.')
    const finalFileName = inputHasExt
      ? inputName
      : (currentExt ? `${inputName}.${currentExt}` : inputName)

    const nextTitle = inputHasExt
      ? inputName.replace(/\.[^.]+$/, '')
      : inputName

    const updated = await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: documentId },
        data: { title: nextTitle }
      })
      await tx.documentVersion.update({
        where: { id: latest.id },
        data: { fileName: finalFileName }
      })
      return tx.document.findUnique({
        where: { id: documentId },
        include: {
          documentType: true,
          projectCategory: true,
          versions: { orderBy: { uploadedAt: 'desc' }, take: 1 }
        }
      })
    })

    await auditLogService.logDocument(req.user.id, 'RENAME', updated, req, {
      oldFileName: currentFileName,
      newFileName: finalFileName
    });

    return ResponseFormatter.success(res, { document: updated }, 'Document renamed successfully')
  });

  /**
   * Delete document
   * DELETE /api/documents/:id
   */
  deleteDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    
    // Get document info before deletion for logging
    const document = await documentService.getDocumentById(documentId);
    
    // Check if user is admin (roles is an array of role name strings)
    const isAdmin = req.user.roles?.some(roleName => 
      ['Admin', 'Administrator', 'ADMIN', 'admin'].includes(roleName)
    ) || false;

    // Log deletion before actually deleting
    await auditLogService.logDocument(req.user.id, 'DELETE', document, req, {
      fileCode: document?.fileCode,
      title: document?.title
    });

    await documentService.deleteDocument(documentId, req.user.id, isAdmin);

    return ResponseFormatter.success(
      res,
      null,
      'Document deleted successfully'
    );
  });

  purgeDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);

    const document = await documentService.getDocumentById(documentId);

    await auditLogService.logDocument(req.user.id, 'PURGE', document, req, {
      fileCode: document?.fileCode,
      title: document?.title
    });

    const result = await documentService.purgeDocument(documentId);

    return ResponseFormatter.success(
      res,
      result,
      'Document permanently deleted successfully'
    );
  });

  purgeDocumentByCode = asyncHandler(async (req, res) => {
    const fileCode = String(req.params.fileCode || '').trim();

    await auditLogService.log({
      userId: req.user.id,
      action: 'PURGE',
      entity: 'Document',
      entityId: null,
      description: `Purged all records by file code: ${fileCode}`,
      metadata: { fileCode },
      ipAddress: auditLogService.getClientIP(req),
      userAgent: req?.headers?.['user-agent']
    });

    const result = await documentService.purgeByFileCode(fileCode);

    return ResponseFormatter.success(
      res,
      result,
      'Document records permanently deleted successfully'
    );
  });

  /**
   * Get document versions
   * GET /api/documents/:id/versions
   */
  getDocumentVersions = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const versions = await documentService.getDocumentVersions(documentId);

    return ResponseFormatter.success(
      res,
      { versions },
      'Document versions retrieved successfully'
    );
  });

  /**
   * Download document file
   * GET /api/documents/:id/download
   */
  downloadDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const { versionId } = req.query;

    const document = await documentService.getDocumentById(documentId, req.user);
    if (document?.folderId) {
      await folderPermissionService.assertCan(document.folderId, req.user, 'download')
    }

    let version;
    if (versionId) {
      // Get specific version
      const versions = await documentService.getDocumentVersions(documentId);
      version = versions.find(v => v.id === parseInt(versionId));
    } else {
      // Get latest version
      const versions = await documentService.getDocumentVersions(documentId);
      version = versions[0];
    }

    if (!version) {
      return ResponseFormatter.notFound(res, 'Document version');
    }

    const absolutePath = resolveExistingFilePath(version.filePath)

    if (!absolutePath) {
      return ResponseFormatter.notFound(res, 'File');
    }

    // Log download
    await auditLogService.logDocument(req.user.id, 'DOWNLOAD', document, req, {
      fileName: version.fileName,
      versionId: version.id
    });

    // Set headers for download
    res.setHeader('Content-Type', version.mimeType);
    const rawFileName = String(version.fileName || 'document')
    const asciiFileName = rawFileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'document'
    const encodedFileName = encodeURIComponent(rawFileName)
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`);

    // Check if file is encrypted and decrypt it
    if (version.isEncrypted) {
      try {
        const encryptionService = require('../services/encryptionService');
        const decryptedBuffer = await encryptionService.getDecryptedBuffer(absolutePath);
        return res.send(decryptedBuffer);
      } catch (error) {
        console.error('Failed to decrypt file:', error);
        return ResponseFormatter.error(res, 'Failed to decrypt file', 500);
      }
    }

    // Send unencrypted file
    return res.sendFile(absolutePath);
  });

  previewDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const { versionId } = req.query;

    const document = await documentService.getDocumentById(documentId, req.user);
    if (document?.folderId) {
      await folderPermissionService.assertCan(document.folderId, req.user, 'view')
    }

    let version;
    if (versionId) {
      const versions = await documentService.getDocumentVersions(documentId);
      version = versions.find(v => v.id === parseInt(versionId));
    } else {
      const versions = await documentService.getDocumentVersions(documentId);
      version = versions[0];
    }

    if (!version) {
      return ResponseFormatter.notFound(res, 'Document version');
    }

    const absolutePath = resolveExistingFilePath(version.filePath)

    if (!absolutePath) {
      return ResponseFormatter.notFound(res, 'File');
    }

    res.setHeader('Content-Type', version.mimeType);
    const rawFileName = String(version.fileName || 'document')
    const asciiFileName = rawFileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'document'
    const encodedFileName = encodeURIComponent(rawFileName)
    res.setHeader('Content-Disposition', `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`);

    if (version.isEncrypted) {
      try {
        const encryptionService = require('../services/encryptionService');
        const decryptedBuffer = await encryptionService.getDecryptedBuffer(absolutePath);
        return res.send(decryptedBuffer);
      } catch (error) {
        console.error('Failed to decrypt file:', error);
        return ResponseFormatter.error(res, 'Failed to decrypt file', 500);
      }
    }

    return res.sendFile(absolutePath);
  });

  /**
   * Add comment to document
   * POST /api/documents/:id/comments
   */
  addComment = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const { comment, commentType } = req.body;

    if (!comment) {
      return ResponseFormatter.validationError(res, [
        { field: 'comment', message: 'Comment is required' }
      ]);
    }

    const newComment = await documentService.addComment(
      documentId,
      req.user.id,
      comment,
      commentType || 'GENERAL'
    );

    return ResponseFormatter.success(
      res,
      { comment: newComment },
      'Comment added successfully',
      201
    );
  });

  /**
   * Get document comments
   * GET /api/documents/:id/comments
   */
  getComments = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const comments = await documentService.getDocumentComments(documentId);

    return ResponseFormatter.success(
      res,
      { comments },
      'Comments retrieved successfully'
    );
  });

  /**
   * Get document statistics
   * GET /api/documents/stats
   */
  getStats = asyncHandler(async (req, res) => {
    const { ownerId, documentTypeId } = req.query;

    const filters = {};
    if (ownerId) filters.ownerId = parseInt(ownerId);
    if (documentTypeId) filters.documentTypeId = parseInt(documentTypeId);

    const stats = await documentService.getDocumentStats(filters);

    return ResponseFormatter.success(
      res,
      { stats },
      'Document statistics retrieved successfully'
    );
  });

  /**
   * Get my document statistics
   * GET /api/documents/my-stats
   */
  getMyStats = asyncHandler(async (req, res) => {
    const stats = await documentService.getDocumentStats({
      ownerId: req.user.id
    });

    return ResponseFormatter.success(
      res,
      { stats },
      'My document statistics retrieved successfully'
    );
  });

  /**
   * Get published documents
   * GET /api/documents/published
   */
  getPublishedDocuments = asyncHandler(async (req, res) => {
    const { folderId, page, limit, search } = req.query;

    const filters = {};

    if (folderId) {
      await folderPermissionService.assertCan(parseInt(folderId), req.user, 'view')
      // If folder is specified, show published, superseded, and obsolete documents
      // but exclude draft/in-process documents
      filters.folderId = parseInt(folderId);
      filters.statusIn = ['PUBLISHED', 'SUPERSEDED', 'OBSOLETE', 'ARCHIVED'];
    } else {
      // If no folder specified, only show published documents
      filters.status = 'PUBLISHED';
    }

    if (search) {
      filters.search = search;
    }

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 15
    };

    const result = await documentService.listDocuments(filters, pagination, req.user);

    const folderDownloadMap = new Map()
    const folderIds = Array.from(new Set(result.documents.map((d) => d.folderId).filter((id) => id !== null && id !== undefined)))
    for (const fid of folderIds) {
      folderDownloadMap.set(fid, await folderPermissionService.canUser(fid, req.user, 'download'))
    }

      // Format documents with file information from latest version
    const formattedDocs = result.documents.map(doc => {
      const latestVersion = doc.versions && doc.versions[0];
      
      // Get file extension from filename
      const fileExt = latestVersion?.fileName?.split('.').pop()?.toUpperCase() || 'FILE';
      
      // Format file size
      const formatFileSize = (bytes) => {
        if (!bytes) return '0 KB';
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(1)} MB`;
      };

        return {
        id: doc.id,
        folderId: doc.folderId,
        canDownload: doc.folderId ? Boolean(folderDownloadMap.get(doc.folderId)) : true,
        fileCode: doc.isClientDocument ? '-' : doc.fileCode,
        title: doc.title,
        documentType: doc.documentType?.name || '',
        version: doc.version,
        fileName: latestVersion?.fileName || doc.title,
        type: fileExt,
        size: formatFileSize(latestVersion?.fileSize),
        lastModified: latestVersion?.uploadedAt 
          ? new Date(latestVersion.uploadedAt).toLocaleDateString('en-GB')
          : new Date(doc.updatedAt).toLocaleDateString('en-GB'),
        status: doc.status
      };
    });

    return ResponseFormatter.paginated(
      res,
      formattedDocs,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Published documents retrieved successfully'
    );
  });

  /**
   * Get document requests (NDR - New Document Request)
   * GET /api/documents/requests
   */
  getDocumentRequests = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    
    // Get both pending and acknowledged document requests
    // Show ALL requests to all users (not filtered by createdById)
    const filters = {};

    // If specific status requested
    if (status) {
      filters.status = status.toUpperCase();
    }

    const pagination = {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50
    };

    // Don't pass userId to show ALL document requests to everyone
    // Permissions will control who can acknowledge
    const result = await documentService.listDocuments(filters, pagination, null);
    
    // Filter only NDR-related statuses and format for frontend
    const requests = result.documents
      .filter(doc => 
        doc.status === 'PENDING_ACKNOWLEDGMENT' || 
        doc.status === 'ACKNOWLEDGED' ||
        doc.status === 'REJECTED' ||
        (doc.stage === 'ACKNOWLEDGMENT')
      )
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        documentType: doc.documentType?.name || '',
        projectCategory: doc.projectCategory?.name || '',
        dateOfDocument: doc.dateOfDocument ? new Date(doc.dateOfDocument).toLocaleDateString('en-GB') : '',
        requestDate: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB') : '',
        requestedBy: doc.createdBy ? `${doc.createdBy.firstName} ${doc.createdBy.lastName}` : 'Unknown',
        requestedById: doc.createdById, // Include user ID for self-acknowledgment check
        remarks: doc.status === 'REJECTED' ? doc.obsoleteReason || doc.description : doc.description || '',
        fileCode: doc.fileCode && !doc.fileCode.startsWith('PENDING-') ? doc.fileCode : '-',
        status: doc.status === 'ACKNOWLEDGED' ? 'Acknowledged' : doc.status === 'REJECTED' ? 'Rejected' : 'Pending Acknowledgment'
      }));

    return ResponseFormatter.success(
      res,
      { requests },
      'Document requests retrieved successfully'
    );
  });

  /**
   * Create document request (NDR - New Document Request)
   * POST /api/documents/requests
   */
  createDocumentRequest = asyncHandler(async (req, res) => {
    const { title, documentType, projectCategory, dateOfDocument, remarks } = req.body;

    // Validation
    const errors = [];
    if (!title) errors.push({ field: 'title', message: 'Title is required' });
    if (!documentType) errors.push({ field: 'documentType', message: 'Document type is required' });
    if (!projectCategory) errors.push({ field: 'projectCategory', message: 'Project category is required' });

    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    // Find document type by name
    const docType = await documentService.getDocumentTypeByName(documentType);
    
    if (!docType) {
      return ResponseFormatter.validationError(res, [
        { field: 'documentType', message: 'Invalid document type' }
      ]);
    }

    // Find project category by name
    const projCategory = await documentService.getProjectCategoryByName(projectCategory);
    
    if (!projCategory) {
      return ResponseFormatter.validationError(res, [
        { field: 'projectCategory', message: 'Invalid project category' }
      ]);
    }

    // Create document request (NDR) - no file code assigned yet
    const document = await documentService.createDocumentRequest({
      title,
      description: remarks,
      documentTypeId: docType.id,
      projectCategoryId: projCategory.id,
      dateOfDocument: dateOfDocument ? new Date(dateOfDocument) : null
    }, req.user.id);

    // Log document request creation
    await auditLogService.logDocument(req.user.id, 'CREATE', document, req, {
      documentType,
      projectCategory
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document request submitted successfully',
      201
    );
  });

  /**
   * Acknowledge document request (Document Controller only)
   * POST /api/documents/requests/:id/acknowledge
   */
  acknowledgeDocumentRequest = asyncHandler(async (req, res) => {
    const requestId = parseInt(req.params.id);
    const { remarks } = req.body;

    // Acknowledge request and assign file code
    const document = await documentService.acknowledgeDocumentRequest(
      requestId,
      req.user.id,
      remarks
    );

    // Log acknowledgment
    await auditLogService.logDocument(req.user.id, 'ACKNOWLEDGE', document, req, {
      remarks
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document request acknowledged and file code assigned successfully'
    );
  });

  /**
   * Reject document request (Document Controller only)
   * POST /api/documents/requests/:id/reject
   */
  rejectDocumentRequest = asyncHandler(async (req, res) => {
    const requestId = parseInt(req.params.id);
    const { reason } = req.body;

    // Validation
    if (!reason || reason.trim() === '') {
      return ResponseFormatter.validationError(res, [
        { field: 'reason', message: 'Rejection reason is required' }
      ]);
    }

    // Reject the document request
    const document = await documentService.rejectDocumentRequest(
      requestId,
      req.user.id,
      reason
    );

    // Log rejection
    await auditLogService.logDocument(req.user.id, 'REJECT', document, req, {
      reason
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document request rejected successfully'
    );
  });

  deleteDocumentRequest = asyncHandler(async (req, res) => {
    const requestId = parseInt(req.params.id);
    const document = await documentService.getDocumentById(requestId);

    await auditLogService.logDocument(req.user.id, 'DELETE', document, req, {
      fileCode: document?.fileCode,
      title: document?.title,
      requestStatus: document?.status,
      requestDeleteType: 'REJECTED_REQUESTER_DELETE'
    });

    const result = await documentService.deleteRejectedDocumentRequest(requestId, req.user.id);

    return ResponseFormatter.success(
      res,
      result,
      'Document request deleted successfully'
    );
  });

  /**
   * Submit draft document for review
   * POST /api/documents/:id/submit-for-review
   */
  submitDraftForReview = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.id);
    const { reviewerIds } = req.body;

    // Validation
    if (!reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
      return ResponseFormatter.validationError(res, [
        { field: 'reviewerIds', message: 'At least one reviewer must be assigned' }
      ]);
    }

    const document = await documentService.submitDraftForReview(
      documentId,
      reviewerIds,
      req.user.id
    );

    // Log submission for review
    await auditLogService.logWorkflow(req.user.id, 'SUBMIT_FOR_REVIEW', document, req, {
      reviewerIds
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document submitted for review successfully'
    );
  });

  /**
   * Create new draft and submit for review
   * POST /api/documents/drafts/submit-for-review
   */
  createDraftAndSubmitForReview = asyncHandler(async (req, res) => {
    const { fileCode, title, versionNo, documentType, comments, reviewers } = req.body;

    // Validation
    const errors = [];
    if (!fileCode) errors.push({ field: 'fileCode', message: 'File code is required' });
    if (!title) errors.push({ field: 'title', message: 'Title is required' });
    if (!documentType) errors.push({ field: 'documentType', message: 'Document type is required' });
    if (!req.file) errors.push({ field: 'file', message: 'File is required' });
    
    // Parse reviewers
    let reviewerIds = [];
    if (reviewers) {
      try {
        const parsed = typeof reviewers === 'string' ? JSON.parse(reviewers) : reviewers;
        reviewerIds = Array.isArray(parsed) ? parsed.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];
      } catch (e) {
        errors.push({ field: 'reviewers', message: 'Invalid reviewers format' });
      }
    }
    
    if (!reviewerIds || reviewerIds.length === 0) {
      errors.push({ field: 'reviewers', message: 'At least one reviewer must be assigned' });
    }

    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    const trimmedFileCode = String(fileCode || '').trim();
    const normalizedFileCode = await documentService.normalizeFileCodeFromSystemSettings(trimmedFileCode);
    const candidateFileCodes = Array.from(new Set([trimmedFileCode, normalizedFileCode].filter(Boolean)));

    // Check if document with this file code already exists
    const existingDocument = await prisma.document.findFirst({
      where: {
        fileCode: { in: candidateFileCodes },
        ownerId: req.user.id
      }
    });

    let documentId;
    let savedFileCode = trimmedFileCode;

    if (existingDocument) {
      // Update existing document
      documentId = existingDocument.id;
      savedFileCode = existingDocument.fileCode;
      
      // Update document details
      await prisma.document.update({
        where: { id: documentId },
        data: {
          title,
          description: comments,
          version: versionNo || existingDocument.version
        }
      });
    } else {
      // This shouldn't happen in normal flow since we're selecting from existing file codes
      // But handle it just in case
      const docType = await documentService.getDocumentTypeByName(documentType);
      if (!docType) {
        return ResponseFormatter.validationError(res, [
          { field: 'documentType', message: 'Invalid document type' }
        ]);
      }

      const newDocument = await documentService.createDocumentWithFileCode({
        fileCode: normalizedFileCode || trimmedFileCode,
        title,
        description: comments,
        documentTypeId: docType.id,
        projectCategoryId: null,
        folderId: null
      }, req.user.id, {
        version: versionNo || '1.0',
        status: 'ACKNOWLEDGED',
        stage: 'DRAFT'
      });

      documentId = newDocument.id;
      savedFileCode = newDocument.fileCode;
    }

    // Upload file
    const uploadedVersion = await documentService.uploadDocumentVersion(
      documentId,
      req.file,
      req.user.id
    );

    await epcRegistryService.generateForUploadedDraft(documentId, uploadedVersion.id, req)

    // Log draft upload
    await auditLogService.logDocument(req.user.id, 'DRAFT_UPLOAD', { id: documentId, fileCode: savedFileCode }, req, {
      fileName: req.file.originalname,
      title,
      versionNo
    });

    // Submit for review
    const finalDocument = await documentService.submitDraftForReview(
      documentId,
      reviewerIds,
      req.user.id
    );

    // Log submission for review
    await auditLogService.logWorkflow(req.user.id, 'SUBMIT_FOR_REVIEW', finalDocument, req, {
      reviewerIds
    });

    return ResponseFormatter.success(
      res,
      { document: finalDocument },
      'Document submitted for review successfully',
      201
    );
  });
}

module.exports = new DocumentController();
