const prisma = require('../config/database');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/errors');
const notificationService = require('./notificationService');
const documentAssignmentService = require('./documentAssignmentService');
const projectTrackingService = require('./projectTrackingService');

class WorkflowService {
  async saveWorkflowFileVersion(document, documentId, userId, file) {
    if (!file) return null;

    const fileStorageService = require('./fileStorageService');
    const { absolutePath } = fileStorageService.getDocumentPath(document.fileCode, document.projectCategoryId || null);
    const fileName = fileStorageService.generateUniqueFileName(file.originalname);
    const finalPath = await fileStorageService.saveFile(file, absolutePath, fileName);

    return prisma.documentVersion.create({
      data: {
        documentId,
        version: document.version,
        filePath: finalPath,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedById: userId,
        isPublished: false
      }
    });
  }

  /**
   * Submit document for review
   * Transition: DRAFT → PENDING_REVIEW / REVIEW
   */
  async submitForReview(documentId, userId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if user is owner
    if (document.ownerId !== userId && document.createdById !== userId) {
      throw new ForbiddenError('Only document owner can submit for review');
    }

    // Check if document is in DRAFT stage (accepts both new drafts and returned documents)
    if (document.stage !== 'DRAFT') {
      throw new BadRequestError('Can only submit documents in DRAFT stage');
    }
    
    // Accept documents with DRAFT, DRAFTING, ACKNOWLEDGED (new drafts) or RETURNED (resubmission) status
    if (!['DRAFT', 'DRAFTING', 'ACKNOWLEDGED', 'RETURNED'].includes(document.status)) {
      throw new BadRequestError('Can only submit documents with DRAFT, DRAFTING, ACKNOWLEDGED or RETURNED status');
    }

    // Check if document has a file uploaded
    const versions = await prisma.documentVersion.findMany({
      where: { documentId }
    });

    if (versions.length === 0) {
      throw new BadRequestError('Document must have at least one file uploaded before submission');
    }

    // Update document status
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'PENDING_REVIEW',
        stage: 'REVIEW',
        submittedById: userId,
        submittedAt: new Date()
      },
      include: {
        owner: true,
        documentType: true
      }
    });

    // Create approval history entry
    await prisma.approvalHistory.create({
      data: {
        documentId,
        userId,
        action: 'SUBMITTED',
        stage: 'REVIEW',
        comments: 'Document submitted for review'
      }
    });

    // Send notifications to reviewers
    try {
      console.log(`[Notification] Sending document submission notification for document ${documentId}`);
      const reviewerCount = await notificationService.notifyDocumentSubmittedWithEmail(documentId, updated);
      console.log(`[Notification] Notified ${reviewerCount} reviewers about document submission`);
    } catch (error) {
      console.error('[Notification] Failed to send notification for document submission:', error);
    }

    return updated;
  }

  /**
   * Review document
   * Transition: PENDING_REVIEW → IN_REVIEW → PENDING_FIRST_APPROVAL / RETURNED
   */
  async reviewDocument(documentId, userId, action, comments = null, approverId = null, skipApproval = false, file = null) {
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if document is in review stage (support legacy documents that might be in DRAFT or APPROVAL)
    const validReviewStages = ['REVIEW', 'DRAFT', 'Approval', 'APPROVAL'];
    if (!validReviewStages.includes(document.stage)) {
      throw new BadRequestError(`Document is not in review stage. Current stage: ${document.stage}`);
    }

    // Check if user has reviewer role (will be validated by middleware)

    if (action === 'APPROVE') {
      if (!skipApproval && !approverId) {
        throw new BadRequestError('First approver must be assigned');
      }

      // Upload reviewed file if provided
      if (file) {
        await this.saveWorkflowFileVersion(document, documentId, userId, file);
      }

      if (skipApproval) {
        const updated = await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'READY_TO_PUBLISH',
            stage: 'READY_TO_PUBLISH',
            reviewedById: userId,
            reviewedAt: new Date()
          }
        });

        await documentAssignmentService.removeAssignmentsByType(documentId, 'REVIEW');

        await prisma.approvalHistory.create({
          data: {
            documentId,
            userId,
            action: 'REVIEWED',
            stage: 'READY_TO_PUBLISH',
            comments: comments || 'Document reviewed and marked as ready to publish (approval skipped)'
          }
        });

        try {
          const ownerDoc = await prisma.document.findUnique({
            where: { id: documentId },
            include: {
              owner: true,
              documentType: true
            }
          });

          await notificationService.notifyOwnerDocumentApproved(
            documentId,
            ownerDoc,
            userId
          );
        } catch (error) {
          console.error('Failed to send notification for approval-skipped review:', error);
        }

        return updated;
      }

      // Move to first approval stage
      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'PENDING_FIRST_APPROVAL',
          stage: 'FIRST_APPROVAL',
          reviewedById: userId,
          reviewedAt: new Date(),
          firstApproverId: approverId
        }
      });

      // Remove review assignments (reviewers no longer need access)
      await documentAssignmentService.removeAssignmentsByType(documentId, 'REVIEW');
      
      // Create assignment for first approver
      await documentAssignmentService.assignDocument(
        documentId,
        approverId,
        'FIRST_APPROVAL',
        userId // assigned by reviewer
      );
      console.log(`[WorkflowService] Created FIRST_APPROVAL assignment for user ${approverId}`);

      // Create approval history record
      await prisma.approvalHistory.create({
        data: {
          documentId,
          userId,
          action: 'REVIEWED',
          stage: 'FIRST_APPROVAL',
          comments: comments || 'Document reviewed and forwarded for first approval'
        }
      });

      // Send notifications: 1) to owner that doc was reviewed, 2) to assigned approver
      try {
        const approverDoc = await prisma.document.findUnique({
          where: { id: documentId },
          include: { 
            firstApprover: true,
            owner: true,
            documentType: true 
          }
        });
        
        // Notify document owner that their document has been reviewed
        await notificationService.notifyOwnerDocumentReviewed(
          documentId,
          approverDoc,
          userId
        );
        
        // Notify the assigned approver
        if (approverDoc.firstApprover) {
          await notificationService.notifySpecificUserApprovalRequired(
            approverDoc.firstApproverId,
            documentId,
            approverDoc,
            userId
          );
          console.log(`[Notification] Notified approver ${approverDoc.firstApproverId} about approval request`);
        }
      } catch (error) {
        console.error('Failed to send notification for approval request:', error);
      }

      return updated;
    } else if (action === 'RETURN') {
      if (file) {
        await this.saveWorkflowFileVersion(document, documentId, userId, file);
      }

      // Return to draft
      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'RETURNED',
          stage: 'DRAFT',
          reviewedById: userId,
          reviewedAt: new Date()
        }
      });

      // Remove all assignments when returned to draft (owner already has access)
      await documentAssignmentService.removeAllAssignments(documentId);
      console.log(`[WorkflowService] Removed all assignments - document returned to draft`);

      await prisma.approvalHistory.create({
        data: {
          documentId,
          userId,
          action: 'RETURNED',
          stage: 'DRAFT',
          comments: comments || 'Document returned for amendments'
        }
      });

      // Send notification to document owner only
      try {
        const ownerDoc = await prisma.document.findUnique({
          where: { id: documentId },
          include: { 
            owner: true,
            documentType: true 
          }
        });
        
        await notificationService.notifyDocumentReturnedToOwner(
          documentId,
          ownerDoc,
          userId,
          comments
        );
        console.log(`[Notification] Notified owner ${ownerDoc.ownerId} about document return`);
      } catch (error) {
        console.error('Failed to send notification for document return:', error);
      }

      return updated;
    } else {
      throw new BadRequestError('Invalid review action. Use APPROVE or RETURN');
    }
  }

  /**
   * First Approval
   * Transition: PENDING_FIRST_APPROVAL → PENDING_SECOND_APPROVAL / READY_TO_PUBLISH / RETURNED
   */
  async firstApproval(documentId, userId, action, comments = null, secondApproverId = null, file = null) {
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if document is in first approval stage (support legacy stages)
    const validFirstApprovalStages = ['FIRST_APPROVAL', 'Approval', 'APPROVAL', 'Pending Approval', 'PENDING_APPROVAL'];
    if (!validFirstApprovalStages.includes(document.stage)) {
      throw new BadRequestError(`Document is not in first approval stage. Current stage: ${document.stage}`);
    }

    if (action === 'APPROVE') {
      // Upload approved file if provided
      if (file) {
        await this.saveWorkflowFileVersion(document, documentId, userId, file);
      }

      // If second approver assigned, move to second approval
      // Otherwise, mark as ready to publish
      const newStatus = secondApproverId ? 'PENDING_SECOND_APPROVAL' : 'READY_TO_PUBLISH';
      const newStage = secondApproverId ? 'SECOND_APPROVAL' : 'READY_TO_PUBLISH';

      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          status: newStatus,
          stage: newStage,
          firstApprovedAt: new Date(),
          ...(secondApproverId && { secondApproverId })
        }
      });

      // Remove first approval assignments
      await documentAssignmentService.removeAssignmentsByType(documentId, 'FIRST_APPROVAL');
      
      // If second approver, create assignment for them
      if (secondApproverId) {
        await documentAssignmentService.assignDocument(
          documentId,
          secondApproverId,
          'SECOND_APPROVAL',
          userId // assigned by first approver
        );
        console.log(`[WorkflowService] Created SECOND_APPROVAL assignment for user ${secondApproverId}`);
      } else {
        // No second approver = ready to publish (owner already has access, no assignments needed)
        console.log(`[WorkflowService] Document ready to publish - no assignments needed`);
      }

      await prisma.approvalHistory.create({
        data: {
          documentId,
          userId,
          action: 'FIRST_APPROVED',
          stage: newStage,
          comments: comments || (secondApproverId ? 'First approval completed, forwarded to second approver' : 'First approval completed, ready to publish')
        }
      });

      // Send notifications to specific users
      try {
        const approvedDoc = await prisma.document.findUnique({
          where: { id: documentId },
          include: { 
            secondApprover: true,
            owner: true,
            documentType: true 
          }
        });
        
        if (secondApproverId && approvedDoc.secondApprover) {
          // Notify specific second approver
          await notificationService.notifySpecificUserApprovalRequired(
            secondApproverId,
            documentId,
            approvedDoc,
            userId
          );
          console.log(`[Notification] Notified second approver ${secondApproverId}`);
        } else {
          // Notify document owner that document is ready to publish
          await notificationService.notifyOwnerDocumentApproved(
            documentId,
            approvedDoc,
            userId
          );
          console.log(`[Notification] Notified owner ${approvedDoc.ownerId} that document is approved`);
        }
      } catch (error) {
        console.error('Failed to send notification for first approval:', error);
      }

      return updated;
    } else if (action === 'RETURN') {
      if (file) {
        await this.saveWorkflowFileVersion(document, documentId, userId, file);
      }

      // Return to draft for amendments
      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'RETURNED',
          stage: 'DRAFT',
          firstApprovedAt: new Date()
        }
      });

      // Remove all assignments when returned to draft
      await documentAssignmentService.removeAllAssignments(documentId);
      console.log(`[WorkflowService] Removed all assignments - document returned to draft from first approval`);

      await prisma.approvalHistory.create({
        data: {
          documentId,
          userId,
          action: 'RETURNED',
          stage: 'DRAFT',
          comments: comments || 'Document returned for amendments'
        }
      });

      return updated;
    } else {
      throw new BadRequestError('Invalid approval action. Use APPROVE or RETURN');
    }
  }

  /**
   * Second Approval
   * Transition: PENDING_SECOND_APPROVAL → READY_TO_PUBLISH / RETURNED
   */
  async secondApproval(documentId, userId, action, comments = null, file = null) {
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if document is in second approval stage
    if (document.stage !== 'SECOND_APPROVAL') {
      throw new BadRequestError('Document is not in second approval stage');
    }

    if (action === 'APPROVE') {
      // Upload approved file if provided
      if (file) {
        await this.saveWorkflowFileVersion(document, documentId, userId, file);
      }

      // Mark as ready to publish
      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'READY_TO_PUBLISH',
          stage: 'READY_TO_PUBLISH',
          secondApprovedAt: new Date()
        }
      });

      // Remove second approval assignments (owner has access)
      await documentAssignmentService.removeAssignmentsByType(documentId, 'SECOND_APPROVAL');
      console.log(`[WorkflowService] Removed SECOND_APPROVAL assignments - document ready to publish`);

      await prisma.approvalHistory.create({
        data: {
          documentId,
          userId,
          action: 'SECOND_APPROVED',
          stage: 'READY_TO_PUBLISH',
          comments: comments || 'Second approval completed, ready to publish'
        }
      });

      // Send notification to document owner
      try {
        const approvedDoc = await prisma.document.findUnique({
          where: { id: documentId },
          include: { 
            owner: true,
            documentType: true 
          }
        });
        
        await notificationService.notifyOwnerDocumentApproved(
          documentId,
          approvedDoc,
          userId
        );
        console.log(`[Notification] Notified owner ${approvedDoc.ownerId} that document is approved`);
      } catch (error) {
        console.error('Failed to send notification for second approval:', error);
      }

      return updated;
    } else if (action === 'RETURN') {
      if (file) {
        await this.saveWorkflowFileVersion(document, documentId, userId, file);
      }

      // Return to draft for amendments
      const updated = await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'RETURNED',
          stage: 'DRAFT',
          secondApprovedAt: new Date()
        }
      });

      // Remove all assignments when returned to draft
      await documentAssignmentService.removeAllAssignments(documentId);
      console.log(`[WorkflowService] Removed all assignments - document returned to draft from second approval`);

      await prisma.approvalHistory.create({
        data: {
          documentId,
          userId,
          action: 'RETURNED',
          stage: 'DRAFT',
          comments: comments || 'Document returned for amendments'
        }
      });

      return updated;
    } else {
      throw new BadRequestError('Invalid approval action. Use APPROVE or RETURN');
    }
  }

  /**
   * Publish document
   * Transition: READY_TO_PUBLISH → PUBLISHED
   */
  async publishDocument(documentId, userId, folderId, notes = null, newFileName = null) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, owner: true }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if document is ready to publish
    if (document.status !== 'READY_TO_PUBLISH') {
      throw new BadRequestError('Document is not ready to publish');
    }

    if (!folderId) {
      throw new BadRequestError('Folder ID is required for publication');
    }

    // Verify folder exists
    const folder = await prisma.folder.findUnique({
      where: { id: folderId }
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }

    const normalizeVersionSegment = (versionSegment) => {
      const raw = String(versionSegment || '').trim()
      if (!raw) return ''
      const m = /^(\d+)([a-zA-Z]*)$/.exec(raw)
      if (!m) return raw
      const digitsStr = m[1]
      const suffix = (m[2] || '').toLowerCase()
      const digitsLen = Math.max(2, digitsStr.length)
      return `${digitsStr.padStart(digitsLen, '0')}${suffix}`
    }
    const versionSegment = normalizeVersionSegment(String(document.fileCode || '').split('/')[1] || '')

    // Publish document
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'PUBLISHED',
        stage: 'PUBLISHED',
        folderId,
        publishedById: userId,
        publishedAt: new Date()
      }
    });

    // Remove all assignments when published (published docs are accessible to all)
    await documentAssignmentService.removeAllAssignments(documentId);
    console.log(`[WorkflowService] Removed all assignments - document published`);

    // Mark latest version as published and rename if needed
    const latestVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }]
    });

    if (latestVersion) {
      const updateData = { isPublished: true };
      
      // If new filename provided, update it
      if (newFileName && newFileName.trim() !== '') {
        updateData.fileName = newFileName.trim();
      }
      
      await prisma.documentVersion.update({
        where: { id: latestVersion.id },
        data: updateData
      });
    }

    await prisma.approvalHistory.create({
      data: {
        documentId,
        userId,
        action: 'PUBLISHED',
        stage: 'PUBLISHED',
        comments: notes || 'Document published'
      }
    });

    if (!document.isClientDocument) {
      const projectCategoryId = document.projectCategoryId ?? null
      const existingRegister = await prisma.documentRegister.findUnique({
        where: { fileCode_projectCategoryId: { fileCode: document.fileCode, projectCategoryId } }
      })

      if (existingRegister) {
        await prisma.documentRegister.update({
          where: { fileCode_projectCategoryId: { fileCode: document.fileCode, projectCategoryId } },
          data: { 
            status: 'PUBLISHED',
            version: versionSegment || existingRegister.version,
            registeredDate: new Date()
          }
        });
      } else {
        await prisma.documentRegister.create({
          data: {
            fileCode: document.fileCode,
            projectCategoryId,
            documentTitle: document.title,
            documentType: document.documentType.name,
            version: versionSegment || document.version,
            owner: `${document.owner.firstName} ${document.owner.lastName}`,
            department: document.owner.department || '',
            status: 'PUBLISHED'
          }
        });
      }
    }

    try {
      await notificationService.notifyDocumentPublished(documentId, updated);
    } catch (error) {
      console.error('Failed to send notification for document publish:', error);
    }

    try {
      await projectTrackingService.handleDocumentPublished(documentId);
    } catch (error) {
      console.error('Failed to update project tracking items for published document:', error);
    }

    return updated;
  }

  /**
   * Acknowledge document
   * Transition: PENDING_ACKNOWLEDGMENT → ACKNOWLEDGED → PUBLISHED
   */
  async acknowledgeDocument(documentId, userId, comments = null) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if document is in acknowledgment stage
    if (document.stage !== 'ACKNOWLEDGMENT') {
      throw new BadRequestError('Document is not in acknowledgment stage');
    }

    // Publish document
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'PUBLISHED',
        stage: 'PUBLISHED',
        acknowledgedById: userId,
        acknowledgedAt: new Date(),
        publishedAt: new Date()
      }
    });

    try {
      await projectTrackingService.handleDocumentPublished(documentId);
    } catch (error) {
      console.error('Failed to update project tracking items for published document:', error);
    }

    // Mark latest version as published
    const latestVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }]
    });

    if (latestVersion) {
      await prisma.documentVersion.update({
        where: { id: latestVersion.id },
        data: { isPublished: true }
      });
    }

    await prisma.approvalHistory.create({
      data: {
        documentId,
        userId,
        action: 'ACKNOWLEDGED',
        stage: 'PUBLISHED',
        comments: comments || 'Document acknowledged and published'
      }
    });

    if (!document.isClientDocument) {
      await prisma.documentRegister.updateMany({
        where: { fileCode: document.fileCode },
        data: { status: 'PUBLISHED' }
      });
    }

    // Send notification to document owner
    try {
      await notificationService.notifyDocumentPublished(documentId, updated);
    } catch (error) {
      console.error('Failed to send notification for document publish:', error);
    }

    return updated;
  }

  /**
   * Get pending tasks for user based on their role
   */
  async getPendingTasks(userId, userRoles, filters = {}) {
    const { stage, documentTypeId } = filters;

    // Build where conditions based on user roles
    const whereClauses = [];

    if (userRoles.includes('reviewer') || userRoles.includes('admin')) {
      whereClauses.push({
        stage: 'REVIEW',
        status: { in: ['PENDING_REVIEW', 'IN_REVIEW'] }
      });
    }

    if (userRoles.includes('approver') || userRoles.includes('admin')) {
      whereClauses.push({
        stage: 'APPROVAL',
        status: { in: ['PENDING_APPROVAL', 'IN_APPROVAL'] }
      });
    }

    if (userRoles.includes('acknowledger') || userRoles.includes('admin')) {
      whereClauses.push({
        stage: 'ACKNOWLEDGMENT',
        status: 'PENDING_ACKNOWLEDGMENT'
      });
    }

    if (whereClauses.length === 0) {
      return [];
    }

    const where = { OR: whereClauses };

    // Apply additional filters
    if (stage) {
      where.stage = stage;
      delete where.OR;
    }
    if (documentTypeId) {
      where.documentTypeId = documentTypeId;
    }

    const tasks = await prisma.document.findMany({
      where,
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        versions: {
          orderBy: { uploadedAt: 'desc' },
          take: 1
        }
      },
      orderBy: { submittedAt: 'asc' }
    });

    return tasks;
  }

  /**
   * Get approval history for document
   */
  async getApprovalHistory(documentId) {
    const history = await prisma.approvalHistory.findMany({
      where: { documentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return history;
  }

  /**
   * Mark document as superseded by another document
   */
  async markAsSuperseded(documentId, supersededById, userId, reason = null) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        owner: true,
        versions: {
          orderBy: { uploadedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    if (document.status !== 'PUBLISHED') {
      throw new BadRequestError('Can only supersede published documents');
    }

    const supersedingDoc = await prisma.document.findUnique({
      where: { id: supersededById }
    });

    if (!supersedingDoc) {
      throw new NotFoundError('Superseding document');
    }

    // Get user who is performing the action
    const actionUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true }
    });
    const archivedByName = actionUser ? `${actionUser.firstName} ${actionUser.lastName}` : 'System';

    // Update document
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'SUPERSEDED',
        stage: 'SUPERSEDED',
        supersededById
      }
    });

    // Create history entry
    await prisma.approvalHistory.create({
      data: {
        documentId,
        userId,
        action: 'SUPERSEDED',
        stage: 'SUPERSEDED',
        comments: reason || `Document superseded by ${supersedingDoc.fileCode}`
      }
    });

    // Update document register
    await prisma.documentRegister.updateMany({
      where: { fileCode: document.fileCode },
      data: { status: 'SUPERSEDED' }
    });

    // Create archive register entry for the old version
    try {
      // Calculate retention date (e.g., 7 years from now for compliance)
      const retentionDate = new Date();
      retentionDate.setFullYear(retentionDate.getFullYear() + 7);

      await prisma.archiveRegister.create({
        data: {
          fileCode: document.fileCode,
          documentTitle: document.title,
          version: document.version,
          archivedDate: new Date(),
          archivedBy: archivedByName,
          currentVersion: supersedingDoc.version || supersedingDoc.fileCode.split('/')[1] + '.0',
          retentionUntil: retentionDate,
          filePath: document.versions[0]?.filePath || ''
        }
      });
      console.log(`[ArchiveRegister] Created entry for superseded document: ${document.fileCode}`);
    } catch (error) {
      console.error('Failed to create archive register entry:', error);
    }

    // Send broadcast notification to all users
    try {
      const fullDocument = await prisma.document.findUnique({
        where: { id: documentId },
        include: { documentType: true }
      });
      
      await notificationService.notifyDocumentSuperseded(
        documentId,
        fullDocument,
        supersedingDoc
      );
    } catch (error) {
      console.error('Failed to send superseded notification:', error);
    }

    return updated;
  }

  /**
   * Mark document as obsolete
   */
  async markAsObsolete(documentId, userId, reason) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        owner: true
      }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    if (!['PUBLISHED', 'SUPERSEDED'].includes(document.status)) {
      throw new BadRequestError('Can only mark published or superseded documents as obsolete');
    }

    if (!reason) {
      throw new BadRequestError('Reason is required for marking document as obsolete');
    }

    // Update document
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'OBSOLETE',
        stage: 'OBSOLETE',
        obsoleteReason: reason,
        obsoleteDate: new Date()
      }
    });

    // Create history entry
    await prisma.approvalHistory.create({
      data: {
        documentId,
        userId,
        action: 'OBSOLETED',
        stage: 'OBSOLETE',
        comments: reason
      }
    });

    // Create obsolete register entry
    await prisma.obsoleteRegister.create({
      data: {
        fileCode: document.fileCode,
        documentTitle: document.title,
        documentType: document.documentType.name,
        obsoleteDate: new Date(),
        reason,
        replacedBy: document.supersededById ? 
          (await prisma.document.findUnique({ 
            where: { id: document.supersededById } 
          }))?.fileCode : null,
        lastOwner: `${document.owner.firstName} ${document.owner.lastName}`
      }
    });

    // Send broadcast notification to all users
    try {
      await notificationService.notifyDocumentObsolete(
        documentId,
        updated,
        reason
      );
    } catch (error) {
      console.error('Failed to send obsolete notification:', error);
    }

    return updated;
  }

  /**
   * Get workflow configuration for document type
   */
  async getWorkflowForDocumentType(documentTypeId) {
    const workflow = await prisma.workflow.findUnique({
      where: { documentTypeId },
      include: {
        steps: {
          include: {
            role: true
          },
          orderBy: { stepOrder: 'asc' }
        },
        documentType: true
      }
    });

    return workflow;
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStats(filters = {}) {
    const { documentTypeId } = filters;
    const where = {};

    if (documentTypeId) {
      where.documentTypeId = documentTypeId;
    }

    const [
      pendingReview,
      pendingApproval,
      pendingAcknowledgment,
      published,
      rejected
    ] = await Promise.all([
      prisma.document.count({ where: { ...where, stage: 'REVIEW' } }),
      prisma.document.count({ where: { ...where, stage: 'APPROVAL' } }),
      prisma.document.count({ where: { ...where, stage: 'ACKNOWLEDGMENT' } }),
      prisma.document.count({ where: { ...where, status: 'PUBLISHED' } }),
      prisma.document.count({ where: { ...where, status: 'REJECTED' } })
    ]);

    return {
      pendingReview,
      pendingApproval,
      pendingAcknowledgment,
      published,
      rejected
    };
  }

  /**
   * Archive obsolete/superseded document to a folder
   * This moves the document to the specified archive folder
   */
  async archiveObsoleteDocument(documentId, userId, folderId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if document is obsolete or superseded
    if (!['OBSOLETE', 'SUPERSEDED'].includes(document.status)) {
      throw new BadRequestError('Can only archive obsolete or superseded documents');
    }

    if (!folderId) {
      throw new BadRequestError('Folder ID is required for archiving');
    }

    // Verify folder exists
    const folder = await prisma.folder.findUnique({
      where: { id: folderId }
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }

    // Update document with folder assignment
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        folderId
      }
    });

    // Create history entry
    await prisma.approvalHistory.create({
      data: {
        documentId,
        userId,
        action: 'ARCHIVED',
        stage: document.stage,
        comments: `Document archived to folder: ${folder.name}`
      }
    });

    return updated;
  }
}

module.exports = new WorkflowService();
