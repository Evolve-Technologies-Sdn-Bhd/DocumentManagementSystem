const express = require('express');
const workflowController = require('../controllers/workflowController');
const { authenticate, authorize, authorizePermission } = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// WORKFLOW CONFIGURATION MANAGEMENT (Admin only)
// ============================================
router.get('/workflows', authorize('admin'), workflowController.getAllWorkflows);
router.get('/workflows/:id', authorize('admin'), workflowController.getWorkflowByIdController);
router.post('/workflows', authorize('admin'), workflowController.createWorkflow);
router.put('/workflows/:id', authorize('admin'), workflowController.updateWorkflow);
router.delete('/workflows/:id', authorize('admin'), workflowController.deleteWorkflow);
router.patch('/workflows/:id/toggle', authorize('admin'), workflowController.toggleWorkflowStatus);

// Document workflow actions
router.post('/submit/:documentId', workflowController.submitForReview);

router.post(
  '/review/:documentId',
  uploadDocument.single('reviewedFile'),
  authorize('reviewer', 'admin'),
  workflowController.reviewDocument
);

router.post(
  '/approve/first/:documentId',
  uploadDocument.single('approvedFile'),
  authorize('approver', 'admin'),
  workflowController.firstApproval
);

router.post(
  '/approve/second/:documentId',
  uploadDocument.single('approvedFile'),
  authorize('approver', 'admin'),
  workflowController.secondApproval
);

router.post(
  '/publish/:documentId',
  authorizePermission('documents.published', 'publish'),
  workflowController.publishDocument
);

router.post(
  '/acknowledge/:documentId',
  authorize('acknowledger', 'admin'),
  workflowController.acknowledgeDocument
);

// Workflow queries
router.get('/pending-tasks', workflowController.getPendingTasks);
router.get('/history/:documentId', workflowController.getApprovalHistory);
router.get('/stats', workflowController.getWorkflowStats);
router.get('/config/:documentTypeId', workflowController.getWorkflowConfig);

// Document lifecycle management (admin only)
router.post(
  '/supersede/:documentId',
  authorize('admin'),
  workflowController.markAsSuperseded
);

router.post(
  '/obsolete/:documentId',
  authorize('admin'),
  workflowController.markAsObsolete
);

router.post(
  '/archive/:documentId',
  authorize('acknowledger', 'admin'),
  workflowController.archiveObsoleteDocument
);

module.exports = router;
