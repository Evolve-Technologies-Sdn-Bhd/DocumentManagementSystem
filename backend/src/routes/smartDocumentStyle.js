const express = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { uploadLogo } = require('../middleware/upload');
const {
  listStyleProfiles,
  getStyleProfile,
  createStyleProfile,
  updateStyleProfile,
  deleteStyleProfile,
  setDefaultStyleProfile,
  uploadLogo: uploadLogoController
} = require('../controllers/smartDocumentStyleController');

const router = express.Router();

router.use(authenticate);

router.get('/', listStyleProfiles);

router.post(
  '/',
  authorizePermission('configuration.settings', 'edit'),
  createStyleProfile
);

router.get('/:id', getStyleProfile);

router.put(
  '/:id',
  authorizePermission('configuration.settings', 'edit'),
  updateStyleProfile
);

router.delete(
  '/:id',
  authorizePermission('configuration.settings', 'edit'),
  deleteStyleProfile
);

router.post(
  '/:id/set-default',
  authorizePermission('configuration.settings', 'edit'),
  setDefaultStyleProfile
);

router.post(
  '/upload-logo',
  authorizePermission('configuration.settings', 'edit'),
  uploadLogo.single('logo'),
  uploadLogoController
);

module.exports = router;
