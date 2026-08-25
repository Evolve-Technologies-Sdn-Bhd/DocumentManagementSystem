const express = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { uploadDocument } = require('../middleware/upload');
const {
  getSmartDocumentContent,
  saveSmartDocumentFieldValues,
  snapshotSystemValues,
  getSmartDocumentFieldChanges,
  createSmartRevision,
  previewCurrentSmartDocumentAsPdf,
  generateFinalPdfForDocumentVersion
} = require('../controllers/smartDocumentController');

const router = express.Router();

router.use(authenticate);

const requireDocWrite = authorizePermission('documents.drafts', 'create');
const requirePublish = authorizePermission('documents.published', 'publish');

router.get('/document-versions/:documentVersionId/content', asyncHandler(getSmartDocumentContent));
router.put('/document-versions/:documentVersionId/field-values', asyncHandler(saveSmartDocumentFieldValues));
router.post('/document-versions/:documentVersionId/snapshot-system', asyncHandler(snapshotSystemValues));
router.get('/document-versions/:documentVersionId/field-changes', asyncHandler(getSmartDocumentFieldChanges));
router.post('/document-versions/create-revision', asyncHandler(createSmartRevision));
router.post('/document-versions/:documentVersionId/preview-pdf', asyncHandler(previewCurrentSmartDocumentAsPdf));
router.post('/document-versions/:documentVersionId/preview-docx', asyncHandler(async (req, res, next) => { req.body = req.body || {}; req.body.asDocx = true; next() }), asyncHandler(previewCurrentSmartDocumentAsPdf));
router.post('/document-versions/:documentVersionId/final-pdf', asyncHandler(generateFinalPdfForDocumentVersion));

module.exports = router;
