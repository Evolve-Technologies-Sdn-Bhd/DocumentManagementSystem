const express = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { uploadTemplate } = require('../middleware/upload');
const {
  listSmartTemplates,
  getSmartTemplate,
  createSmartTemplate,
  updateSmartTemplate,
  deleteSmartTemplate,
  createVersion,
  publishVersion,
  listSectionsForVersion,
  upsertSectionsForVersion,
  listFieldsForVersion,
  upsertFieldsForVersion,
  upsertFieldMappings,
  uploadTemplateDocx,
  extractTemplatePlaceholders,
  generatePreviewDocx,
  generatePreviewPdf,
  generateFinalPdfForDocumentVersion,
  downloadFinalPdf
} = require('../controllers/smartTemplateController');

const router = express.Router();

router.use(authenticate);

const requireCreatePermission = authorizePermission('configuration.templates', 'create', 'edit');
const requireEditPermission = authorizePermission('configuration.templates', 'edit', 'update');
const requireDeletePermission = authorizePermission('configuration.templates', 'delete', 'edit');

router.get('/', asyncHandler(listSmartTemplates));
router.post('/', requireCreatePermission, asyncHandler(createSmartTemplate));
router.get('/:id', asyncHandler(getSmartTemplate));
router.put('/:id', requireEditPermission, asyncHandler(updateSmartTemplate));
router.delete('/:id', requireDeletePermission, asyncHandler(deleteSmartTemplate));
router.post('/:id/versions', requireEditPermission, asyncHandler(createVersion));
router.post('/:id/versions/:versionId/publish', requireEditPermission, asyncHandler(publishVersion));

router.post('/versions/:versionId/upload', requireEditPermission, uploadTemplate.single('templateFile'), asyncHandler(uploadTemplateDocx));
router.get('/versions/:versionId/placeholders', asyncHandler(extractTemplatePlaceholders));

router.post('/versions/:versionId/preview-docx', asyncHandler(generatePreviewDocx));
router.post('/versions/:versionId/preview-pdf', asyncHandler(generatePreviewPdf));

router.post('/document-versions/:documentVersionId/final-pdf', requireEditPermission, asyncHandler(generateFinalPdfForDocumentVersion));
router.get('/document-versions/:documentVersionId/final-pdf/download', asyncHandler(downloadFinalPdf));

router.get('/versions/:versionId/sections', asyncHandler(listSectionsForVersion));
router.put('/versions/:versionId/sections', requireEditPermission, asyncHandler(upsertSectionsForVersion));
router.get('/versions/:versionId/fields', asyncHandler(listFieldsForVersion));
router.put('/versions/:versionId/fields', requireEditPermission, asyncHandler(upsertFieldsForVersion));
router.put('/versions/:versionId/field-mappings', requireEditPermission, asyncHandler(upsertFieldMappings));

module.exports = router;
