const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middleware/auth');
const multer = require('multer');

const { protect: _unused = null, authenticate, authorizePermission } = auth;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/health', aiController.healthCheck);
router.get('/config', aiController.getConfig);

router.post('/chat', authenticate, aiController.chat);
router.post('/search-documents', authenticate, aiController.searchDocumentsNL);
router.get('/search-documents', authenticate, aiController.searchDocumentsNL);
router.post('/summarize', authenticate, upload.single('file'), aiController.summarizeDocument);
router.post('/autofill', authenticate, upload.single('file'), aiController.autofillFormFields);
router.post('/classify', authenticate, upload.single('file'), aiController.classifyDocument);
router.post('/suggest-fields', authenticate, aiController.suggestTemplateFields);

router.post('/rephrase', authenticate, aiController.rephraseText);
router.post('/workflow/route', authenticate, aiController.suggestWorkflowRoute);
router.post('/review/remarks', authenticate, aiController.generateReviewerRemarks);
router.post('/grammar-check', authenticate, upload.single('file'), aiController.checkGrammarSpelling);

module.exports = router;
