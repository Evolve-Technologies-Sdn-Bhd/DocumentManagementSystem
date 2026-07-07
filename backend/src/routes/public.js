const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const publicShareController = require('../controllers/publicShareController')

/**
 * Public routes - no authentication required
 */

// GET /api/public/features - Get system features and information
router.get('/features', publicController.getFeatures);

// POST /api/public/contact - Submit contact/inquiry form
router.post('/contact', publicController.submitContactForm);

// GET /api/public/statistics - Get public statistics
router.get('/statistics', publicController.getStatistics);

// GET /api/public/landing-page-settings - Get landing page settings (global)
router.get('/landing-page-settings', publicController.getLandingPageSettings);

// GET /api/public/branding - Get global branding (company info + theme)
router.get('/branding', publicController.getBranding);

router.get('/share/:token/meta', publicShareController.getSharedDocumentMeta)
router.get('/share/:token/preview', publicShareController.previewSharedDocument)

module.exports = router;
