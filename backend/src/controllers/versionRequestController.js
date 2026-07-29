const versionRequestService = require('../services/versionRequestService');
const auditLogService = require('../services/auditLogService');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');

class VersionRequestController {
  /**
   * Create a new version request
   * POST /api/documents/version-requests
   */
  createRequest = asyncHandler(async (req, res) => {
    const { documentId, title, documentType, projectCategory, dateOfDocument, remarks, changeType } = req.body;
    const userId = req.user.id;
    const file = req.file; // multer middleware should populate this

    // Validate required fields
    if (!documentId || !title || !dateOfDocument) {
      return ResponseFormatter.error(res, 'Missing required fields: documentId, title, and dateOfDocument are required', 400);
    }

    const request = await versionRequestService.createRequest(
      parseInt(documentId),
      title,
      documentType,
      projectCategory,
      dateOfDocument,
      remarks,
      changeType,
      file,
      userId
    );

    // Log version request creation
    await auditLogService.logDocument(userId, 'VERSION_REQUEST', request.document, req, {
      requestId: request.id,
      title,
      remarks,
      changeType
    });

    return ResponseFormatter.success(
      res,
      { request },
      'Version request created successfully',
      201
    );
  });

  /**
   * List all version requests
   * GET /api/documents/version-requests
   */
  listRequests = asyncHandler(async (req, res) => {
    try {
      const { status, search, page, limit, sortBy, sortOrder } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (search) filters.search = search;

      const pagination = {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 15,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc'
      };

      console.log('[VR Controller] Fetching version requests with filters:', filters);
      const result = await versionRequestService.listRequests(filters, pagination);
      console.log('[VR Controller] Found', result.requests.length, 'version requests');
      
      // Format for frontend (matching NDR format)
      const requests = result.requests.map((req, index) => {
        try {
          // If acknowledged, show the new document's file code; otherwise show the original
          const displayFileCode = req.newDocument?.fileCode || req.document?.fileCode || '';
          
          return {
            id: req.id,
            title: req.proposedChanges, // Using proposedChanges as title (stored during creation)
            documentType: req.document?.documentType?.name || '',
            documentTypeId: req.document?.documentTypeId || null,
            projectCategory: req.document?.projectCategory?.name || '',
            projectCategoryId: req.document?.projectCategoryId ?? null,
            dateOfDocument: req.targetDate ? new Date(req.targetDate).toLocaleDateString('en-GB') : '',
            requestDate: req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-GB') : '',
            remarks: req.remarks || '',
            fileCode: displayFileCode,
            originalFileCode: req.document?.fileCode || '', // Keep original for reference
            status: this.formatStatus(req.status),
            rawStatus: req.status,
            stage: req.stage,
            requestedBy: req.requestedBy ? `${req.requestedBy.firstName || ''} ${req.requestedBy.lastName || ''}`.trim() || req.requestedBy.email : '',
            requestedById: req.requestedById || req.requestedBy?.id, // Include user ID for self-acknowledgment check
            reviewedBy: req.reviewedBy ? `${req.reviewedBy.firstName || ''} ${req.reviewedBy.lastName || ''}`.trim() || req.reviewedBy.email : null,
            reviewedAt: req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString('en-GB') : null,
            newDocument: req.newDocument ? {
              fileCode: req.newDocument.fileCode,
              title: req.newDocument.title
            } : null
          };
        } catch (formatError) {
          console.error('[VR Controller] Error formatting request', req.id, ':', formatError);
          throw formatError;
        }
      });

      console.log('[VR Controller] Successfully formatted', requests.length, 'requests');
      return ResponseFormatter.success(
        res,
        { 
          requests,
          pagination: result.pagination
        },
        'Requests retrieved successfully'
      );
    } catch (error) {
      console.error('[VR Controller] Error in listRequests:', error);
      throw error;
    }
  });

  /**
   * Get a single request by ID
   * GET /api/documents/version-requests/:id
   */
  getRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const request = await versionRequestService.getRequest(parseInt(id));

    // Format for frontend
    const formatted = {
      id: request.id,
      document: {
        id: request.document.id,
        fileCode: request.document.fileCode,
        title: request.document.title,
        documentType: request.document.documentType?.name || '',
        version: request.document.version,
        owner: request.document.owner ? `${request.document.owner.firstName || ''} ${request.document.owner.lastName || ''}`.trim() || request.document.owner.email : ''
      },
      reasonForRevision: request.reasonForRevision,
      proposedChanges: request.proposedChanges,
      targetDate: request.targetDate,
      priority: request.priority,
      remarks: request.remarks,
      fileName: request.fileName,
      status: this.formatStatus(request.status),
      rawStatus: request.status,
      stage: request.stage,
      requestedBy: request.requestedBy ? {
        id: request.requestedBy.id,
        name: `${request.requestedBy.firstName || ''} ${request.requestedBy.lastName || ''}`.trim() || request.requestedBy.email,
        email: request.requestedBy.email
      } : null,
      reviewedBy: request.reviewedBy ? {
        id: request.reviewedBy.id,
        name: `${request.reviewedBy.firstName || ''} ${request.reviewedBy.lastName || ''}`.trim() || request.reviewedBy.email,
        email: request.reviewedBy.email
      } : null,
      reviewedAt: request.reviewedAt,
      reviewComments: request.reviewComments,
      approvedBy: request.approvedBy ? {
        id: request.approvedBy.id,
        name: `${request.approvedBy.firstName || ''} ${request.approvedBy.lastName || ''}`.trim() || request.approvedBy.email,
        email: request.approvedBy.email
      } : null,
      approvedAt: request.approvedAt,
      approvalComments: request.approvalComments,
      rejectedBy: request.rejectedBy ? {
        id: request.rejectedBy.id,
        name: `${request.rejectedBy.firstName || ''} ${request.rejectedBy.lastName || ''}`.trim() || request.rejectedBy.email,
        email: request.rejectedBy.email
      } : null,
      rejectedAt: request.rejectedAt,
      rejectionReason: request.rejectionReason,
      newDocument: request.newDocument ? {
        id: request.newDocument.id,
        fileCode: request.newDocument.fileCode,
        title: request.newDocument.title,
        documentType: request.newDocument.documentType?.name || ''
      } : null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };

    return ResponseFormatter.success(
      res,
      { request: formatted },
      'Request retrieved successfully'
    );
  });

  /**
   * Acknowledge a version request and create new document
   * POST /api/documents/version-requests/:id/acknowledge
   */
  acknowledgeRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { remarks } = req.body;
    const userId = req.user.id;

    const request = await versionRequestService.acknowledgeRequest(
      parseInt(id),
      userId,
      remarks
    );

    // Log acknowledgment
    await auditLogService.logDocument(userId, 'VERSION_ACKNOWLEDGE', request.document, req, {
      requestId: request.id,
      newDocumentId: request.newDocumentId,
      remarks
    });

    return ResponseFormatter.success(
      res,
      { request },
      'Version request acknowledged successfully. New document has been created.'
    );
  });

  /**
   * Review a request
   * POST /api/documents/version-requests/:id/review
   */
  reviewRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { action, comments } = req.body;
    const userId = req.user.id;

    if (!action || !['approve', 'reject'].includes(action)) {
      return ResponseFormatter.error(res, 'Invalid action. Must be "approve" or "reject"', 400);
    }

    const request = await versionRequestService.reviewRequest(
      parseInt(id),
      userId,
      action,
      comments
    );

    // Log review action
    await auditLogService.logDocument(userId, action === 'approve' ? 'VERSION_REVIEW_APPROVE' : 'VERSION_REVIEW_REJECT', request.document, req, {
      requestId: request.id,
      action,
      comments
    });

    return ResponseFormatter.success(
      res,
      { request },
      `Request ${action === 'approve' ? 'approved for final approval' : 'rejected'} successfully`
    );
  });

  /**
   * Approve a request (final approval - creates new document)
   * POST /api/documents/version-requests/:id/approve
   */
  approveRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { comments } = req.body;
    const userId = req.user.id;

    const request = await versionRequestService.approveRequest(
      parseInt(id),
      userId,
      comments
    );

    // Log final approval
    await auditLogService.logDocument(userId, 'VERSION_FINAL_APPROVE', request.document, req, {
      requestId: request.id,
      newDocumentId: request.newDocumentId,
      comments
    });

    return ResponseFormatter.success(
      res,
      { request },
      'Request approved successfully. New document version has been created.'
    );
  });

  /**
   * Reject a request
   * POST /api/documents/version-requests/:id/reject
   */
  rejectRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason) {
      return ResponseFormatter.error(res, 'Rejection reason is required', 400);
    }

    const request = await versionRequestService.rejectRequest(
      parseInt(id),
      userId,
      reason
    );

    // Log rejection
    await auditLogService.logDocument(userId, 'VERSION_REJECT', request.document, req, {
      requestId: request.id,
      reason
    });

    return ResponseFormatter.success(
      res,
      { request },
      'Request rejected successfully'
    );
  });

  /**
   * Delete a request
   * DELETE /api/documents/version-requests/:id
   */
  deleteRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    await versionRequestService.deleteRequest(parseInt(id), userId);

    return ResponseFormatter.success(
      res,
      null,
      'Request deleted successfully'
    );
  });

  /**
   * Helper to format status for frontend
   */
  formatStatus(status) {
    const statusMap = {
      'PENDING_REVIEW': 'Pending Acknowledgment', // Same as NDR
      'IN_REVIEW': 'In Review',
      'PENDING_APPROVAL': 'Pending Approval',
      'IN_APPROVAL': 'In Approval',
      'APPROVED': 'Acknowledged', // Same as NDR
      'REJECTED': 'Rejected'
    };

    return statusMap[status] || status;
  }
}

module.exports = new VersionRequestController();
