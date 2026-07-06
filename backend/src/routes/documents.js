const express = require('express');
const documentController = require('../controllers/documentController');
const versionRequestController = require('../controllers/versionRequestController');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');
const { ForbiddenError } = require('../utils/errors')

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const requirePermission = (moduleKey, action) => {
  return (req, res, next) => {
    const allowed = !!req.user?.permissions?.[moduleKey]?.[action]
    if (!allowed) {
      return next(new ForbiddenError("You don't have permission to perform this action"))
    }
    next()
  }
}

// Document requests (NDR - New Document Request)
router.get('/requests', requirePermission('newDocumentRequest', 'view'), documentController.getDocumentRequests);
router.post('/requests', requirePermission('newDocumentRequest', 'create'), documentController.createDocumentRequest);
router.post('/requests/:id/acknowledge', requirePermission('newDocumentRequest', 'acknowledge'), documentController.acknowledgeDocumentRequest);
router.post('/requests/:id/reject', requirePermission('newDocumentRequest', 'acknowledge'), documentController.rejectDocumentRequest);
router.delete('/requests/:id', requirePermission('newDocumentRequest', 'create'), documentController.deleteDocumentRequest);

// Draft document workflow
router.post('/drafts/submit-for-review', uploadDocument.single('file'), documentController.createDraftAndSubmitForReview);
router.post('/:id/submit-for-review', documentController.submitDraftForReview);

// Version requests (MUST be before generic /:id routes to avoid conflicts)
router.post('/version-requests', uploadDocument.single('file'), versionRequestController.createRequest);
router.get('/version-requests', versionRequestController.listRequests);
router.get('/version-requests/:id', versionRequestController.getRequest);
router.post('/version-requests/:id/acknowledge', versionRequestController.acknowledgeRequest); // Main action - creates document
router.post('/version-requests/:id/review', versionRequestController.reviewRequest);
router.post('/version-requests/:id/approve', versionRequestController.approveRequest);
router.post('/version-requests/:id/reject', versionRequestController.rejectRequest);
router.delete('/version-requests/:id', versionRequestController.deleteRequest);

router.post('/bulk-import', authorize('admin', 'Admin', 'Administrator', 'ADMIN'), uploadDocument.array('files'), documentController.bulkImportPublished);
router.post('/bulk-move', documentController.bulkMoveDocuments);

// Document CRUD operations
router.post('/', documentController.createDocument);
router.get('/search', documentController.searchDocuments);
router.get('/', documentController.listDocuments);
router.get('/published', documentController.getPublishedDocuments);
router.get('/stats', documentController.getStats);
router.get('/my-stats', documentController.getMyStats);
router.get('/drafts', documentController.getUserDrafts);
router.get('/review-approval', documentController.getReviewApprovalDocuments);
router.get('/superseded-obsolete', documentController.getSupersededObsoleteDocuments);
router.get('/my-status', documentController.getMyDocuments);
router.get('/my-status/:status', documentController.getMyDocumentsByStatus);
router.get('/code/:fileCode', documentController.getDocumentByCode);
router.delete('/code/:fileCode/purge', authorize('admin', 'Admin', 'Administrator', 'ADMIN'), documentController.purgeDocumentByCode);
router.get('/:id/remarks', documentController.getDocumentRemarks);
router.get('/:id/confidential-access', documentController.getConfidentialAccess);
router.get('/:id', documentController.getDocument);
router.put('/:id/confidential-access', documentController.updateConfidentialAccess);
router.put('/:id', documentController.updateDocument);
router.put('/:id/rename', documentController.renameDocument);
router.delete('/:id/purge', authorize('admin', 'Admin', 'Administrator', 'ADMIN'), documentController.purgeDocument);
router.delete('/:id', documentController.deleteDocument);

// Document file operations
router.post('/:id/upload', uploadDocument.single('file'), documentController.uploadDocument);
router.get('/:id/download', documentController.downloadDocument);
router.get('/:id/preview', documentController.previewDocument);
router.get('/:id/versions', documentController.getDocumentVersions);

// Document comments
router.post('/:id/comments', documentController.addComment);
router.get('/:id/comments', documentController.getComments);

module.exports = router;
