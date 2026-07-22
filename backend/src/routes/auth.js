const express = require('express');
const { authController } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { uploadProfileImage } = require('../middleware/upload');

const router = express.Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh-token', authController.refreshToken);
router.post('/verify-2fa', authController.verify2FA);
router.post('/resend-2fa', authController.resend2FA);

// Protected routes (require authentication)
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.put('/profile', authenticate, uploadProfileImage.single('profileImage'), authController.updateProfile);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/sessions', authenticate, authController.getSessions);
router.delete('/sessions/:sessionId', authenticate, authController.revokeSession);
router.put('/2fa', authenticate, authController.toggleTwoFactor);
router.get('/2fa/status', authenticate, authController.getTwoFactorStatus);
router.post('/2fa/setup-authenticator', authenticate, authController.setupAuthenticator);
router.post('/2fa/verify-authenticator', authenticate, authController.verifyAuthenticatorSetup);
router.post('/2fa/revoke-trusted-device', authenticate, authController.revokeTrustedDevice);
router.post('/deactivate', authenticate, authController.deactivateAccount);

module.exports = router;
