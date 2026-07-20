const workflowService = require('../services/workflowService');
const workflowConfigService = require('../services/workflowConfigService');
const auditLogService = require('../services/auditLogService');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');

class WorkflowController {
  /**
   * Submit document for review
   * POST /api/workflow/submit/:documentId
   */
  submitForReview = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);

    const document = await workflowService.submitForReview(documentId, req.user.id);

    return ResponseFormatter.success(
      res,
      { document },
      'Document submitted for review successfully'
    );
  });

  /**
   * Review document
   * POST /api/workflow/review/:documentId
   */
  reviewDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { action, comments, approverId, skipApproval } = req.body;
    const skipApprovalBool = skipApproval === true || skipApproval === 'true' || skipApproval === '1';

    if (!action || !['APPROVE', 'RETURN'].includes(action)) {
      return ResponseFormatter.validationError(res, [
        { field: 'action', message: 'Action must be either APPROVE or RETURN' }
      ]);
    }

    // If reviewing (APPROVE), approver must be assigned
    if (action === 'APPROVE' && !skipApprovalBool && !approverId) {
      return ResponseFormatter.validationError(res, [
        { field: 'approverId', message: 'Approver must be assigned when reviewing document' }
      ]);
    }

    const document = await workflowService.reviewDocument(
      documentId,
      req.user.id,
      action,
      comments,
      approverId ? parseInt(approverId) : null,
      skipApprovalBool,
      req.file
    );

    // Log review action
    await auditLogService.logWorkflow(req.user.id, action === 'APPROVE' ? 'REVIEW_APPROVE' : 'REVIEW_RETURN', document, req, {
      comments,
      approverId,
      skipApproval: skipApprovalBool
    });

    return ResponseFormatter.success(
      res,
      { document },
      `Document ${action.toLowerCase()}d successfully`
    );
  });

  /**
   * First Approval
   * POST /api/workflow/approve/first/:documentId
   */
  firstApproval = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { action, comments, secondApproverId } = req.body;

    if (!action || !['APPROVE', 'RETURN'].includes(action)) {
      return ResponseFormatter.validationError(res, [
        { field: 'action', message: 'Action must be either APPROVE or RETURN' }
      ]);
    }

    const document = await workflowService.firstApproval(
      documentId,
      req.user.id,
      action,
      comments,
      secondApproverId ? parseInt(secondApproverId) : null,
      req.file
    );

    // Log first approval
    await auditLogService.logWorkflow(req.user.id, action === 'APPROVE' ? 'FIRST_APPROVE' : 'FIRST_RETURN', document, req, {
      comments,
      secondApproverId
    });

    return ResponseFormatter.success(
      res,
      { document },
      action === 'APPROVE' ? 'First approval completed successfully' : 'Document returned for amendments'
    );
  });

  /**
   * Second Approval
   * POST /api/workflow/approve/second/:documentId
   */
  secondApproval = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { action, comments } = req.body;

    if (!action || !['APPROVE', 'RETURN'].includes(action)) {
      return ResponseFormatter.validationError(res, [
        { field: 'action', message: 'Action must be either APPROVE or RETURN' }
      ]);
    }

    const document = await workflowService.secondApproval(
      documentId,
      req.user.id,
      action,
      comments,
      req.file
    );

    // Log second approval
    await auditLogService.logWorkflow(req.user.id, action === 'APPROVE' ? 'SECOND_APPROVE' : 'SECOND_RETURN', document, req, {
      comments
    });

    return ResponseFormatter.success(
      res,
      { document },
      action === 'APPROVE' ? 'Second approval completed successfully' : 'Document returned to first approver'
    );
  });

  /**
   * Publish document
   * POST /api/workflow/publish/:documentId
   */
  publishDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { folderId, notes, newFileName, expiryInfo } = req.body;

    if (!folderId) {
      return ResponseFormatter.validationError(res, [
        { field: 'folderId', message: 'Folder ID is required for publication' }
      ]);
    }

    const document = await workflowService.publishDocument(
      documentId,
      req.user.id,
      parseInt(folderId),
      notes,
      newFileName,
      expiryInfo,
      { deferFollowUps: true, syncExpiryInline: true }
    );

    // Log publication
    await auditLogService.logWorkflow(req.user.id, 'PUBLISH', document, req, {
      folderId,
      notes
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document published successfully'
    );
  });

  /**
   * Acknowledge document
   * POST /api/workflow/acknowledge/:documentId
   */
  acknowledgeDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { comments } = req.body;

    const document = await workflowService.acknowledgeDocument(
      documentId,
      req.user.id,
      comments
    );

    return ResponseFormatter.success(
      res,
      { document },
      'Document acknowledged and published successfully'
    );
  });

  /**
   * Get pending tasks for current user
   * GET /api/workflow/pending-tasks
   */
  getPendingTasks = asyncHandler(async (req, res) => {
    const { stage, documentTypeId } = req.query;

    const filters = {};
    if (stage) filters.stage = stage;
    if (documentTypeId) filters.documentTypeId = parseInt(documentTypeId);

    const tasks = await workflowService.getPendingTasks(
      req.user.id,
      req.user.roles,
      filters
    );

    return ResponseFormatter.success(
      res,
      { tasks, count: tasks.length },
      'Pending tasks retrieved successfully'
    );
  });

  /**
   * Get approval history for document
   * GET /api/workflow/history/:documentId
   */
  getApprovalHistory = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);

    const history = await workflowService.getApprovalHistory(documentId);

    return ResponseFormatter.success(
      res,
      { history },
      'Approval history retrieved successfully'
    );
  });

  /**
   * Mark document as superseded
   * POST /api/workflow/supersede/:documentId
   */
  markAsSuperseded = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { supersededById, reason } = req.body;

    if (!supersededById) {
      return ResponseFormatter.validationError(res, [
        { field: 'supersededById', message: 'Superseding document is required' }
      ]);
    }

    // Check if supersededById is a fileCode (string) or document ID (number)
    let supersedingDocId;
    if (isNaN(supersededById)) {
      // It's a fileCode, find the document
      const prisma = require('../config/database');
      const supersedingDoc = await prisma.document.findUnique({
        where: { fileCode: supersededById }
      });
      
      if (!supersedingDoc) {
        return ResponseFormatter.validationError(res, [
          { field: 'supersededById', message: `Document with file code "${supersededById}" not found` }
        ]);
      }
      
      supersedingDocId = supersedingDoc.id;
    } else {
      supersedingDocId = parseInt(supersededById);
    }

    const document = await workflowService.markAsSuperseded(
      documentId,
      supersedingDocId,
      req.user.id,
      reason
    );

    // Log supersede action
    await auditLogService.logWorkflow(req.user.id, 'SUPERSEDE', document, req, {
      supersededById,
      reason
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document marked as superseded successfully'
    );
  });

  /**
   * Mark document as obsolete
   * POST /api/workflow/obsolete/:documentId
   */
  markAsObsolete = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { reason } = req.body;

    if (!reason) {
      return ResponseFormatter.validationError(res, [
        { field: 'reason', message: 'Reason is required' }
      ]);
    }

    const document = await workflowService.markAsObsolete(
      documentId,
      req.user.id,
      reason
    );

    // Log obsolete action
    await auditLogService.logWorkflow(req.user.id, 'OBSOLETE', document, req, {
      reason
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document marked as obsolete successfully'
    );
  });

  /**
   * Get workflow configuration for document type
   * GET /api/workflow/config/:documentTypeId
   */
  getWorkflowConfig = asyncHandler(async (req, res) => {
    const documentTypeId = parseInt(req.params.documentTypeId);

    const workflow = await workflowService.getWorkflowForDocumentType(documentTypeId);

    if (!workflow) {
      return ResponseFormatter.notFound(res, 'Workflow configuration');
    }

    return ResponseFormatter.success(
      res,
      { workflow },
      'Workflow configuration retrieved successfully'
    );
  });

  /**
   * Get workflow statistics
   * GET /api/workflow/stats
   */
  getWorkflowStats = asyncHandler(async (req, res) => {
    const { documentTypeId } = req.query;

    const filters = {};
    if (documentTypeId) filters.documentTypeId = parseInt(documentTypeId);

    const stats = await workflowService.getWorkflowStats(filters);

    return ResponseFormatter.success(
      res,
      { stats },
      'Workflow statistics retrieved successfully'
    );
  });

  // ============================================
  // WORKFLOW CONFIGURATION MANAGEMENT
  // ============================================

  /**
   * Get all workflow configurations
   * GET /api/workflows
   */
  getAllWorkflows = asyncHandler(async (req, res) => {
    const workflows = await workflowConfigService.getAllWorkflows();

    return ResponseFormatter.success(
      res,
      { workflows },
      'Workflows retrieved successfully'
    );
  });

  /**
   * Get workflow configuration by ID
   * GET /api/workflows/:id
   */
  getWorkflowByIdController = asyncHandler(async (req, res) => {
    const workflowId = parseInt(req.params.id);

    const workflow = await workflowConfigService.getWorkflowById(workflowId);

    return ResponseFormatter.success(
      res,
      { workflow },
      'Workflow retrieved successfully'
    );
  });

  /**
   * Create new workflow configuration
   * POST /api/workflows
   */
  createWorkflow = asyncHandler(async (req, res) => {
    const workflow = await workflowConfigService.createWorkflow(req.body);

    return ResponseFormatter.success(
      res,
      { workflow },
      'Workflow created successfully',
      201
    );
  });

  /**
   * Update workflow configuration
   * PUT /api/workflows/:id
   */
  updateWorkflow = asyncHandler(async (req, res) => {
    const workflowId = parseInt(req.params.id);

    const workflow = await workflowConfigService.updateWorkflow(workflowId, req.body);

    return ResponseFormatter.success(
      res,
      { workflow },
      'Workflow updated successfully'
    );
  });

  /**
   * Delete workflow configuration
   * DELETE /api/workflows/:id
   */
  deleteWorkflow = asyncHandler(async (req, res) => {
    const workflowId = parseInt(req.params.id);

    await workflowConfigService.deleteWorkflow(workflowId);

    return ResponseFormatter.success(
      res,
      null,
      'Workflow deleted successfully'
    );
  });

  /**
   * Toggle workflow active status
   * PATCH /api/workflows/:id/toggle
   */
  toggleWorkflowStatus = asyncHandler(async (req, res) => {
    const workflowId = parseInt(req.params.id);

    const workflow = await workflowConfigService.toggleWorkflowStatus(workflowId);

    return ResponseFormatter.success(
      res,
      { workflow },
      'Workflow status updated successfully'
    );
  });

  /**
   * Archive obsolete/superseded document
   * POST /api/workflow/archive/:documentId
   */
  archiveObsoleteDocument = asyncHandler(async (req, res) => {
    const documentId = parseInt(req.params.documentId);
    const { folderId } = req.body;

    if (!folderId) {
      return ResponseFormatter.validationError(res, [
        { field: 'folderId', message: 'Folder ID is required' }
      ]);
    }

    const document = await workflowService.archiveObsoleteDocument(
      documentId,
      req.user.id,
      parseInt(folderId)
    );

    // Log archive action
    await auditLogService.logWorkflow(req.user.id, 'ARCHIVE', document, req, {
      folderId
    });

    return ResponseFormatter.success(
      res,
      { document },
      'Document archived successfully'
    );
  });
}

module.exports = new WorkflowController();
