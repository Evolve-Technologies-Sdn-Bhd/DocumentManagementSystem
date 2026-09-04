const express = require('express');
const { authenticate, authorizePermission } = require('../middleware/auth');
const { uploadLogo, uploadSmartHeaderImage, uploadSmartFooterImage } = require('../middleware/upload');
const {
  listStyleProfiles,
  getStyleProfile,
  createStyleProfile,
  updateStyleProfile,
  deleteStyleProfile,
  setDefaultStyleProfile,
  uploadLogo: uploadLogoController,
  uploadHeaderCustomImage,
  uploadFooterCustomImage
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

router.post(
  '/upload-header-image',
  authorizePermission('configuration.settings', 'edit'),
  uploadSmartHeaderImage.single('headerImage'),
  uploadHeaderCustomImage
);

router.post(
  '/upload-footer-image',
  authorizePermission('configuration.settings', 'edit'),
  uploadSmartFooterImage.single('footerImage'),
  uploadFooterCustomImage
);

module.exports = router;
