const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/errors');
const path = require('path');
const fs = require('fs').promises;
const configService = require('./configService');

class VersionRequestService {
  /**
   * Create a new version request
   */
  async createRequest(documentId, title, documentType, projectCategory, dateOfDocument, remarks, changeType, file, userId) {
    // Validate document exists and is published
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        projectCategory: true,
        owner: true
      }
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    if (document.status !== 'PUBLISHED') {
      throw new BadRequestError('Can only request new versions for published documents');
    }

    // Check if there's already a pending request for this document
    const existingRequest = await prisma.versionRequest.findFirst({
      where: {
        documentId,
        status: {
          in: ['PENDING_REVIEW', 'IN_REVIEW', 'PENDING_APPROVAL', 'IN_APPROVAL']
        }
      }
    });

    if (existingRequest) {
      throw new BadRequestError('There is already a pending version request for this document');
    }

    // Handle file upload if provided
    let filePath = null;
    let fileName = null;

    if (file) {
      // File is already saved by multer to temp directory
      // Move it to version-requests directory
      const uploadDir = path.join(__dirname, '../../uploads/version-requests');
      await fs.mkdir(uploadDir, { recursive: true });

      fileName = file.filename || file.originalname;
      const newFilePath = path.join(uploadDir, fileName);

      // Move file from temp to version-requests directory
      await fs.rename(file.path, newFilePath);
      filePath = newFilePath;
    }

    // Store the NDR-like data (title, docType, projCategory, dateOfDocument)
    // These will be used when creating the new document upon acknowledgment
    const requestData = {
      title,
      documentType,
      projectCategory,
      dateOfDocument
    };

    // Create the request (similar to NDR - pending acknowledgment)
    const request = await prisma.versionRequest.create({
      data: {
        documentId,
        reasonForRevision: String(changeType || '').toLowerCase() === 'minor' ? 'MINOR' : 'MAJOR',
        proposedChanges: requestData.title, // Store title here temporarily
        targetDate: new Date(dateOfDocument),
        priority: 'Normal',
        remarks,
        filePath,
        fileName,
        requestedById: userId,
        status: 'PENDING_REVIEW', // Status for Document Controller to acknowledge
        stage: 'REVIEW' // Stage for acknowledgment
      },
      include: {
        document: {
          include: {
            documentType: true,
            projectCategory: true
          }
        },
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

    return request;
  }

  /**
   * List version requests with filters
   */
  async listRequests(filters = {}, pagination = {}) {
    const {
      status,
      requestedById,
      documentId,
      search
    } = filters;

    const {
      page = 1,
      limit = 15,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = pagination;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (status) where.status = status;
    if (requestedById) where.requestedById = requestedById;
    if (documentId) where.documentId = documentId;

    if (search) {
      where.OR = [
        { reasonForRevision: { contains: search } },
        { proposedChanges: { contains: search } },
        { remarks: { contains: search } }
      ];
    }

    // Get total count
    const total = await prisma.versionRequest.count({ where });

    // Validate sortBy field
    const validSortFields = ['createdAt', 'updatedAt', 'status', 'priority'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    // Get requests
    const requests = await prisma.versionRequest.findMany({
      where,
      include: {
        document: {
          include: {
            documentType: true,
            projectCategory: true,
            owner: true
          }
        },
        newDocument: {
          include: {
            documentType: true,
            projectCategory: true
          }
        },
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        approvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        rejectedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { [safeSortBy]: sortOrder }
    });

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single request by ID
   */
  async getRequest(requestId) {
    const request = await prisma.versionRequest.findUnique({
      where: { id: requestId },
      include: {
        document: {
          include: {
            documentType: true,
            projectCategory: true,
            owner: true,
            versions: {
              orderBy: { uploadedAt: 'desc' },
              take: 1
            }
          }
        },
        newDocument: {
          include: {
            documentType: true
          }
        },
        requestedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        approvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        rejectedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!request) {
      throw new NotFoundError('Version request not found');
    }

    return request;
  }

  /**
   * Acknowledge version request and create new document (like NDR)
   * This is the main action - Document Controller acknowledges and document is created
   */
  async acknowledgeRequest(requestId, acknowledgerId, remarks) {
    const request = await this.getRequest(requestId);

    if (request.status !== 'PENDING_REVIEW') {
      throw new BadRequestError('Request has already been processed');
    }

    // Prevent self-acknowledgment - user cannot acknowledge their own request
    if (request.requestedById === acknowledgerId) {
      throw new ForbiddenError('You cannot acknowledge your own version request. Another acknowledger must process this request.');
    }

    // Generate new file code with incremented version
    const originalDocument = request.document;
    const bump = String(request.reasonForRevision || '').toLowerCase() === 'minor' ? 'minor' : 'major'
    const newFileCode = await this.incrementFileCodeVersion(originalDocument.fileCode, bump);
    const newVersion = this.incrementDocumentVersion(originalDocument.version, bump);

    // Check if new file code already exists
    const existingDoc = await prisma.document.findFirst({
      where: { fileCode: newFileCode, projectCategoryId: originalDocument.projectCategoryId }
    });

    if (existingDoc) {
      throw new BadRequestError(`Document with file code ${newFileCode} already exists`);
    }

    // Create new document with incremented version
    const newDocument = await prisma.document.create({
      data: {
        fileCode: newFileCode,
        title: originalDocument.title,
        description: originalDocument.description,
        documentTypeId: originalDocument.documentTypeId,
        projectCategoryId: originalDocument.projectCategoryId,
        folderId: originalDocument.folderId,
        status: 'ACKNOWLEDGED', // Same as NDR - ready for drafting
        stage: 'DRAFT',
        version: newVersion,
        createdById: request.requestedById,
        ownerId: request.requestedById,
        acknowledgedById: acknowledgerId,
        acknowledgedAt: new Date(),
        dateOfDocument: new Date()
      }
    });

    // Copy the file if it was uploaded with the request
    if (request.filePath && request.fileName) {
      try {
        const uploadDir = path.join(__dirname, '../../uploads/documents');
        await fs.mkdir(uploadDir, { recursive: true });

        const timestamp = Date.now();
        const newFileName = `${timestamp}_${request.fileName}`;
        const newFilePath = path.join(uploadDir, newFileName);

        // Copy the file from version request to document uploads
        await fs.copyFile(request.filePath, newFilePath);

        // Get file stats for size and mime type
        const stats = await fs.stat(newFilePath);
        const fileSize = stats.size;

        // Determine mime type from extension
        const ext = path.extname(request.fileName).toLowerCase();
        const mimeTypeMap = {
          '.pdf': 'application/pdf',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        const mimeType = mimeTypeMap[ext] || 'application/octet-stream';

        // Create document version
        await prisma.documentVersion.create({
          data: {
            documentId: newDocument.id,
            version: newVersion,
            filePath: newFilePath,
            fileName: newFileName,
            mimeType: mimeType,
            fileSize: fileSize,
            uploadedById: request.requestedById,
            isPublished: false
          }
        });
      } catch (error) {
        console.error('Error copying file:', error);
        // Continue even if file copy fails
      }
    }

    // Set up storage, register and code ledger for the new document (parity with NDR)
    try {
      const fileStorageService = require('./fileStorageService');
      await fileStorageService.createDocumentDirectory(newFileCode, originalDocument.projectCategoryId || null);
    } catch (error) {
      console.error('Failed to create document directory for NVR:', error);
    }

    try {
      const ownerName = `${request.requestedBy?.firstName || ''} ${request.requestedBy?.lastName || ''}`.trim()
      await prisma.documentRegister.upsert({
        where: { fileCode_projectCategoryId: { fileCode: newFileCode, projectCategoryId: originalDocument.projectCategoryId } },
        update: {
          documentTitle: newDocument.title,
          documentType: originalDocument.documentType?.name || '',
          version: newDocument.version,
          owner: ownerName,
          department: '',
          status: 'ACKNOWLEDGED'
        },
        create: {
          fileCode: newFileCode,
          projectCategoryId: originalDocument.projectCategoryId,
          documentTitle: newDocument.title,
          documentType: originalDocument.documentType?.name || '',
          version: newDocument.version,
          owner: ownerName,
          department: '',
          status: 'ACKNOWLEDGED'
        }
      });
    } catch (error) {
      console.error('Failed to upsert document register for NVR:', error);
    }

    try {
      const DocumentNumbering = require('../utils/documentNumbering');
      const documentService = require('./documentService');
      const settings = await DocumentNumbering.loadSettings();
      const parsed = documentService.parseAndNormalizeFileCodeStrict(newFileCode, settings);
      await documentService.registerFileCodeLedger({
        fileCode: newFileCode,
        projectCategoryId: originalDocument.projectCategoryId,
        documentTypeId: originalDocument.documentTypeId,
        runningNumber: parsed.runningNumber,
        source: 'NVR_ACKNOWLEDGE',
        sourceRefId: newDocument.id
      });
    } catch (error) {
      console.error('Failed to register file code ledger for NVR:', error);
    }

    // Update request status with link to new document
    const updated = await prisma.versionRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        stage: 'COMPLETED',
        reviewedById: acknowledgerId,
        reviewedAt: new Date(),
        reviewComments: remarks,
        newDocumentId: newDocument.id
      },
      include: {
        document: true,
        newDocument: true,
        requestedBy: true
      }
    });

    // Notify the requester that the new version document has been created
    try {
      const notificationService = require('./notificationService');
      await notificationService.notifyNDRAcknowledged(newDocument.id, newDocument, acknowledgerId);
    } catch (error) {
      console.error('Failed to send NVR acknowledgment notification:', error);
    }

    return updated;
  }

  /**
   * Review a request (approve to move to approval stage or reject)
   * @deprecated Use acknowledgeRequest instead
   */
  async reviewRequest(requestId, userId, action, comments) {
    const request = await this.getRequest(requestId);

    if (request.status !== 'PENDING_REVIEW' && request.status !== 'IN_REVIEW') {
      throw new BadRequestError('Request is not in review stage');
    }

    if (action === 'approve') {
      // Move to approval stage
      const updated = await prisma.versionRequest.update({
        where: { id: requestId },
        data: {
          status: 'PENDING_APPROVAL',
          stage: 'APPROVAL',
          reviewedById: userId,
          reviewedAt: new Date(),
          reviewComments: comments
        },
        include: {
          document: true,
          requestedBy: true
        }
      });

      return updated;
    } else if (action === 'reject') {
      // Reject the request
      const updated = await prisma.versionRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          stage: 'COMPLETED',
          rejectedById: userId,
          rejectedAt: new Date(),
          rejectionReason: comments || 'Rejected during review'
        },
        include: {
          document: true,
          requestedBy: true
        }
      });

      return updated;
    } else {
      throw new BadRequestError('Invalid action. Must be "approve" or "reject"');
    }
  }

  /**
   * Increment version number in file code
   * Examples:
   * - Major: MOM/01/251229/002 -> MOM/02/251229/002
   * - Minor: MOM/01/251229/002 -> MOM/01a/251229/002
   */
  incrementSuffix(suffix) {
    const s = String(suffix || '').toLowerCase()
    if (!s) return 'a'
    const chars = s.split('')
    for (let i = chars.length - 1; i >= 0; i--) {
      if (chars[i] !== 'z') {
        chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1)
        return chars.join('')
      }
      chars[i] = 'a'
    }
    return `a${chars.join('')}`
  }

  async getVersionDigitsLen() {
    try {
      const settings = await configService.getDocumentNumberingSettings()
      const n = parseInt(settings?.versionDigits, 10)
      return Number.isFinite(n) && n > 0 ? n : 2
    } catch {
      return 2
    }
  }

  /**
   * Increment the document's version string (e.g. "1.0") to match a file code bump.
   * - major: bump the major part and reset minor ("1.0" -> "2.0")
   * - minor: bump the minor part ("1.0" -> "1.1")
   */
  incrementDocumentVersion(version, bump = 'major') {
    const raw = String(version || '1.0').trim()
    const [majorRaw, minorRaw] = raw.split('.')
    const major = parseInt(majorRaw, 10)
    const minor = parseInt(minorRaw || '0', 10)

    if (!Number.isFinite(major)) return String(bump).toLowerCase() === 'minor' ? '1.1' : '2.0'

    if (String(bump).toLowerCase() === 'minor') {
      return `${major}.${Number.isFinite(minor) ? minor + 1 : 1}`
    }
    return `${major + 1}.0`
  }

  async incrementFileCodeVersion(fileCode, bump = 'major') {
    const parts = String(fileCode || '').split('/');
    
    if (parts.length < 2) {
      throw new BadRequestError('Invalid file code format');
    }

    const seg = String(parts[1] || '').trim()
    const m = /^(\d+)([a-zA-Z]*)$/.exec(seg)
    if (!m) {
      throw new BadRequestError('Invalid version number in file code')
    }

    const digitsStr = m[1]
    const suffix = m[2] || ''
    const configuredLen = await this.getVersionDigitsLen()
    const digitsLen = Math.max(digitsStr.length, configuredLen)
    const n = parseInt(digitsStr, 10)
    if (isNaN(n)) {
      throw new BadRequestError('Invalid version number in file code')
    }

    if (String(bump).toLowerCase() === 'minor') {
      parts[1] = `${String(n).padStart(digitsLen, '0')}${this.incrementSuffix(suffix)}`
    } else {
      parts[1] = String(n + 1).padStart(digitsLen, '0')
    }

    return parts.join('/');
  }

  /**
   * Approve a request (final approval - creates new document with incremented file code)
   */
  async approveRequest(requestId, userId, comments) {
    const request = await this.getRequest(requestId);

    if (request.status !== 'PENDING_APPROVAL' && request.status !== 'IN_APPROVAL') {
      throw new BadRequestError('Request is not in approval stage');
    }

    // Generate new file code with incremented version
    const originalDocument = request.document;
    const bump = String(request.reasonForRevision || '').toLowerCase() === 'minor' ? 'minor' : 'major'
    const newFileCode = await this.incrementFileCodeVersion(originalDocument.fileCode, bump);
    const newVersion = this.incrementDocumentVersion(originalDocument.version, bump);

    // Check if new file code already exists
    const existingDoc = await prisma.document.findFirst({
      where: { fileCode: newFileCode, projectCategoryId: originalDocument.projectCategoryId }
    });

    if (existingDoc) {
      throw new BadRequestError(`Document with file code ${newFileCode} already exists`);
    }

    // Create new document with incremented version
    const newDocument = await prisma.document.create({
      data: {
        fileCode: newFileCode,
        title: originalDocument.title,
        description: originalDocument.description,
        documentTypeId: originalDocument.documentTypeId,
        projectCategoryId: originalDocument.projectCategoryId,
        folderId: originalDocument.folderId,
        status: 'DRAFT',
        stage: 'DRAFT',
        version: newVersion, // Keep same version, will be updated during workflow
        createdById: request.requestedById,
        ownerId: request.requestedById,
        dateOfDocument: new Date()
      }
    });

    // Copy the file if it was uploaded with the request
    if (request.filePath && request.fileName) {
      try {
        const uploadDir = path.join(__dirname, '../../uploads/documents');
        await fs.mkdir(uploadDir, { recursive: true });

        const timestamp = Date.now();
        const newFileName = `${timestamp}_${request.fileName}`;
        const newFilePath = path.join(uploadDir, newFileName);

        // Copy the file from version request to document uploads
        await fs.copyFile(request.filePath, newFilePath);

        // Get file stats for size and mime type
        const stats = await fs.stat(newFilePath);
        const fileSize = stats.size;

        // Determine mime type from extension
        const ext = path.extname(request.fileName).toLowerCase();
        const mimeTypeMap = {
          '.pdf': 'application/pdf',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        const mimeType = mimeTypeMap[ext] || 'application/octet-stream';

        // Create document version
        await prisma.documentVersion.create({
          data: {
            documentId: newDocument.id,
            version: newVersion,
            filePath: newFilePath,
            fileName: newFileName,
            mimeType: mimeType,
            fileSize: fileSize,
            uploadedById: request.requestedById,
            isPublished: false
          }
        });
      } catch (error) {
        console.error('Error copying file:', error);
        // Continue even if file copy fails
      }
    }

    // Update request status with link to new document
    const updated = await prisma.versionRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        stage: 'COMPLETED',
        approvedById: userId,
        approvedAt: new Date(),
        approvalComments: comments,
        newDocumentId: newDocument.id
      },
      include: {
        document: true,
        newDocument: true,
        requestedBy: true
      }
    });

    return updated;
  }

  /**
   * Reject a request at approval stage
   */
  async rejectRequest(requestId, userId, reason) {
    const request = await this.getRequest(requestId);

    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      throw new BadRequestError('Request has already been finalized');
    }

    const updated = await prisma.versionRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        stage: 'COMPLETED',
        rejectedById: userId,
        rejectedAt: new Date(),
        rejectionReason: reason
      },
      include: {
        document: true,
        requestedBy: true
      }
    });

    return updated;
  }

  /**
   * Delete a request (only if not yet approved)
   */
  async deleteRequest(requestId, userId) {
    const request = await this.getRequest(requestId);

    if (request.status === 'APPROVED') {
      throw new BadRequestError('Cannot delete an approved request');
    }

    // Only requester or admin can delete
    if (request.requestedById !== userId) {
      throw new ForbiddenError('Only the requester can delete this request');
    }

    // Delete associated file if exists
    if (request.filePath) {
      try {
        await fs.unlink(request.filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    await prisma.versionRequest.delete({
      where: { id: requestId }
    });

    return { message: 'Request deleted successfully' };
  }
}

module.exports = new VersionRequestService();
