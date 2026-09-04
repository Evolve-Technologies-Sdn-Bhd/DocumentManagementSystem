const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middleware/auth');
const multer = require('multer');

const authenticate = typeof auth === 'function' ? auth : (auth && auth.authenticate) || auth || ((req, res, next) => next());
const authorizePermission = (auth && auth.authorizePermission) || (() => (req, res, next) => next());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/health', aiController.healthCheck);
router.get('/config', aiController.getConfig);

const wrapOrFallback = (handler, label) => {
  if (typeof handler === 'function') return handler;
  return (req, res) => {
    return res.status(501).json({
      success: false,
      message: `AI endpoint ${label} is not available on this server.`,
      error: { code: 'AI_NOT_IMPLEMENTED' }
    });
  };
};

router.post('/chat', authenticate, wrapOrFallback(aiController.chat, 'chat'));
router.post('/search-documents', authenticate, wrapOrFallback(aiController.searchDocumentsNL, 'search-documents'));
router.get('/search-documents', authenticate, wrapOrFallback(aiController.searchDocumentsNL, 'search-documents'));
router.post('/summarize', authenticate, upload.single('file'), wrapOrFallback(aiController.summarizeDocument, 'summarize'));
router.post('/autofill', authenticate, upload.single('file'), wrapOrFallback(aiController.autofillFormFields, 'autofill'));
router.post('/classify', authenticate, upload.single('file'), wrapOrFallback(aiController.classifyDocument, 'classify'));
router.post('/suggest-fields', authenticate, wrapOrFallback(aiController.suggestTemplateFields, 'suggest-fields'));
router.post('/rephrase', authenticate, wrapOrFallback(aiController.rephraseText, 'rephrase'));
router.post('/workflow/route', authenticate, wrapOrFallback(aiController.suggestWorkflowRoute, 'workflow/route'));
router.post('/review/remarks', authenticate, wrapOrFallback(aiController.generateReviewerRemarks, 'review/remarks'));
router.post('/grammar-check', authenticate, upload.single('file'), wrapOrFallback(aiController.checkGrammarSpelling, 'grammar-check'));

module.exports = router;
