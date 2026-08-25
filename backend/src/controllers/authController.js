const authService = require('../services/authService');
const auditLogService = require('../services/auditLogService');
const securityService = require('../services/securityService');
const twoFactorService = require('../services/twoFactorService');
const trustedDeviceService = require('../services/trustedDeviceService');
const auditSettingsService = require('../services/auditSettingsService');
const emailService = require('../services/emailService');
const configService = require('../services/configService');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const { UnauthorizedError } = require('../utils/errors');
const prisma = require('../config/database');

class AuthController {
  /**
   * Helper to get client IP
   */
  getClientIp(req) {
    const { getClientIp } = require('../utils/clientIp')
    return getClientIp(req) || 'Unknown'
  }

  isSystemAdminUser(user) {
    if (!user) return false
    if (user?.permissions?.all === true) return true

    const roles = Array.isArray(user.roles) ? user.roles : []
    const systemNames = new Set(['system administrator', 'system_admin', 'system-admin'])

    return roles.some((roleData) => {
      const role = roleData?.role || roleData
      const roleName = String(role?.name || role?.displayName || '').toLowerCase()
      if (systemNames.has(roleName)) return true

      let permissions = role?.permissions
      if (typeof permissions === 'string') {
        try {
          permissions = JSON.parse(permissions)
        } catch {
          permissions = null
        }
      }
      return permissions?.all === true
    })
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return ResponseFormatter.validationError(res, [
        { field: 'email', message: 'Email is required' },
        { field: 'password', message: 'Password is required' }
      ]);
    }

    const ipAddress = this.getClientIp(req);
    const userAgent = req.headers['user-agent'];

    let maintenance;
    try {
      maintenance = await configService.getMaintenanceSettings();
    } catch {
      maintenance = { enabled: false, message: 'System is under maintenance' };
    }
    const maintenanceEnabled = maintenance?.enabled === true;

    let is2FASystemEnabled = false;
    try {
      is2FASystemEnabled = await twoFactorService.is2FAEnabled();
    } catch {
      is2FASystemEnabled = false;
    }

    let result;
    try {
      result = await authService.login(email, password, ipAddress, userAgent, { skipSession: is2FASystemEnabled || maintenanceEnabled });
    } catch (error) {
      try {
        const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
        if (user) {
          try {
            await auditLogService.logAuth(user.id, 'LOGIN_FAILED', req, {
              email,
              reason: error.message,
              failedAttempts: user.failedAttempts + 1
            });
          } catch {}
          try {
            await auditSettingsService.checkFailedLoginAlert(user.id, email, ipAddress);
          } catch {}
          try {
            const securitySettings = await securityService.getSecuritySettings();
            if (user.failedAttempts + 1 >= (securitySettings.maxLoginAttempts || 5)) {
              await auditLogService.logAuth(user.id, 'ACCOUNT_LOCKED', req, {
                email,
                lockoutDuration: securitySettings.lockoutDuration || 30
              }).catch(() => {});
            }
          } catch {}
        }
      } catch {}

      if (error && error.isOperational) throw error;
      throw new UnauthorizedError('Invalid credentials');
    }

    if (maintenanceEnabled && !this.isSystemAdminUser(result.user)) {
      return ResponseFormatter.error(
        res,
        maintenance.message || 'System is under maintenance',
        503,
        { code: 'MAINTENANCE_MODE', maintenance }
      );
    }
    
    const isUser2FAEnabled = result.user.twoFactorEnabled;
    const requires2FA = is2FASystemEnabled || isUser2FAEnabled;

    if (requires2FA) {
      const trustedToken = trustedDeviceService.getTrustedToken(req);
      if (trustedToken) {
        let ok = false;
        try {
          ok = await trustedDeviceService.verifyTrustedDevice(result.user.id, trustedToken);
        } catch {}
        if (ok) {
          const fullResult = await authService.issueTokensForUserId(result.user.id, ipAddress, userAgent);
          try {
            await auditLogService.logAuth(fullResult.user.id, 'LOGIN', req, {
              email: fullResult.user.email,
              twoFactorBypassed: true
            });
          } catch {}
          return ResponseFormatter.success(res, fullResult, 'Login successful', 200);
        }
      }

      let enabledMethods = { email: false, app: false };
      try {
        enabledMethods = await twoFactorService.getEnabledMethods();
      } catch {}
      const availableMethods = [];

      if (enabledMethods.app && Boolean(result.user.hasAuthenticator)) {
        availableMethods.push('app');
      }
      if (enabledMethods.email) {
        availableMethods.push('email');
      }

      if (availableMethods.length === 0) {
        return ResponseFormatter.error(
          res,
          '2FA is enabled but no supported verification method is configured.',
          400
        );
      }

      const defaultMethod = availableMethods.includes('app') ? 'app' : 'email';
      const autoSendEmailCode = availableMethods.length === 1 && defaultMethod === 'email';

      if (autoSendEmailCode) {
        try {
          await twoFactorService.sendTwoFactorCode(result.user.id);
        } catch {}
      }

      try {
        await auditLogService.logAuth(result.user.id, 'TWO_FACTOR_INITIATED', req, {
          email: result.user.email,
          method: defaultMethod,
          availableMethods
        });
      } catch {}

      // Return partial response - user needs to verify 2FA
      return ResponseFormatter.success(
        res,
        {
          requires2FA: true,
          userId: result.user.id,
          email: result.user.email,
          availableMethods,
          method: defaultMethod,
          codeSent: autoSendEmailCode,
          message: availableMethods.length > 1
            ? 'Choose a verification method'
            : (defaultMethod === 'app'
              ? 'Enter code from your authenticator app'
              : 'Verification code sent to your email')
        },
        'Two-factor authentication required',
        200
      );
    }

    // If no 2FA but skipSession was true, we need to create the session now
    if (!result.accessToken) {
      // This shouldn't happen in normal flow, but handle it gracefully
      const fullResult = await authService.login(email, password, ipAddress, userAgent, { skipSession: false });
      try {
        await auditLogService.logAuth(fullResult.user.id, 'LOGIN', req, {
          email: fullResult.user.email
        });
      } catch {}
      return ResponseFormatter.success(res, fullResult, 'Login successful', 200);
    }

    // Log successful login (no 2FA)
    try {
      await auditLogService.logAuth(result.user.id, 'LOGIN', req, {
        email: result.user.email
      });
    } catch {}

    return ResponseFormatter.success(
      res,
      result,
      'Login successful',
      200
    );
  });

  /**
   * Register new user
   * POST /api/auth/register
   */
  register = asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone, department, position, employeeId } = req.body;

    // Validation
    const errors = [];
    if (!email) errors.push({ field: 'email', message: 'Email is required' });
    if (!password) errors.push({ field: 'password', message: 'Password is required' });
    if (!firstName) errors.push({ field: 'firstName', message: 'First name is required' });
    if (!lastName) errors.push({ field: 'lastName', message: 'Last name is required' });

    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    const user = await authService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      department,
      position,
      employeeId
    });

    return ResponseFormatter.success(
      res,
      { user },
      'Registration successful',
      201
    );
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh-token
   */
  refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return ResponseFormatter.validationError(res, [
        { field: 'refreshToken', message: 'Refresh token is required' }
      ]);
    }

    const maintenance = await configService.getMaintenanceSettings();
    if (maintenance?.enabled) {
      const session = await prisma.userSession.findUnique({
        where: { refreshToken },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: {
                    select: {
                      id: true,
                      name: true,
                      displayName: true,
                      permissions: true,
                      isSystem: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!session?.user || !this.isSystemAdminUser(session.user)) {
        return ResponseFormatter.error(
          res,
          maintenance.message || 'System is under maintenance',
          503,
          { code: 'MAINTENANCE_MODE', maintenance }
        );
      }
    }

    const tokens = await authService.refreshToken(refreshToken);

    return ResponseFormatter.success(
      res,
      tokens,
      'Token refreshed successfully'
    );
  });

  /**
   * Request password reset code via email
   * POST /api/auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return ResponseFormatter.validationError(res, [
        { field: 'email', message: 'Email is required' }
      ]);
    }

    const resetPayload = await authService.createPasswordResetCode(email);

    if (resetPayload?.user?.email && resetPayload?.code) {
      Promise.resolve().then(async () => {
        await emailService.sendPasswordResetCodeEmail(resetPayload.user.email, {
          firstName: resetPayload.user.firstName,
          code: resetPayload.code,
          expiresInMinutes: resetPayload.expiresInMinutes
        });

        await auditLogService.logAuth(resetPayload.user.id, 'PASSWORD_RESET_REQUESTED', req, {
          email: resetPayload.user.email
        });
      }).catch((error) => {
        console.error('Failed to send password reset code email:', error);
      });
    }

    return ResponseFormatter.success(
      res,
      null,
      'If the email is registered, a reset code has been sent.',
      200
    );
  });

  /**
   * Verify reset code
   * POST /api/auth/verify-reset-code
   */
  verifyResetCode = asyncHandler(async (req, res) => {
    const { email, code } = req.body;

    const errors = [];
    if (!email) errors.push({ field: 'email', message: 'Email is required' });
    if (!code) errors.push({ field: 'code', message: 'Reset code is required' });
    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    const verification = await authService.verifyPasswordResetCode(email, code);
    if (!verification.ok) {
      return ResponseFormatter.error(res, 'Invalid or expired reset code', 400);
    }

    return ResponseFormatter.success(res, null, 'Reset code verified', 200);
  });

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    
    // Log logout before invalidating token
    if (req.user) {
      await auditLogService.logAuth(req.user.id, 'LOGOUT', req);
    }
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await authService.logout(token);
    }

    return ResponseFormatter.success(
      res,
      null,
      'Logout successful'
    );
  });

  /**
   * Get current user
   * GET /api/auth/me
   */
  me = asyncHandler(async (req, res) => {
    const user = await authService.getUserById(req.user.id);

    return ResponseFormatter.success(
      res,
      { user },
      'User retrieved successfully'
    );
  });

  /**
   * Update user profile
   * PUT /api/auth/profile
   */
  updateProfile = asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, department, position } = req.body;

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;

    // Handle profile image if uploaded
    if (req.file) {
      const profileImagePath = `/uploads/profiles/${req.user.id}/${req.file.filename}`;
      updateData.profileImage = profileImagePath;
    }

    const user = await authService.updateProfile(req.user.id, updateData);

    return ResponseFormatter.success(
      res,
      { user },
      'Profile updated successfully'
    );
  });

  /**
   * Change password
   * POST /api/auth/change-password
   */
  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const errors = [];
    if (!currentPassword) errors.push({ field: 'currentPassword', message: 'Current password is required' });
    if (!newPassword) errors.push({ field: 'newPassword', message: 'New password is required' });

    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    // Validate password against security policy
    const passwordValidation = await securityService.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return ResponseFormatter.validationError(res, 
        passwordValidation.errors.map(err => ({ field: 'newPassword', message: err }))
      );
    }

    await authService.changePassword(req.user.id, currentPassword, newPassword);

    // Log password change
    await auditLogService.logAuth(req.user.id, 'PASSWORD_CHANGE', req);

    return ResponseFormatter.success(
      res,
      null,
      'Password changed successfully'
    );
  });

  /**
   * Complete password reset using emailed code
   * POST /api/auth/reset-password-code
   */
  resetPasswordWithCode = asyncHandler(async (req, res) => {
    const { email, code, newPassword } = req.body;

    const errors = [];
    if (!email) errors.push({ field: 'email', message: 'Email is required' });
    if (!code) errors.push({ field: 'code', message: 'Reset code is required' });
    if (!newPassword) errors.push({ field: 'newPassword', message: 'New password is required' });

    if (errors.length > 0) {
      return ResponseFormatter.validationError(res, errors);
    }

    const passwordValidation = await securityService.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return ResponseFormatter.validationError(
        res,
        passwordValidation.errors.map((err) => ({ field: 'newPassword', message: err }))
      );
    }

    const user = await authService.resetPasswordWithCode(email, code, newPassword);

    await auditLogService.logAuth(user.id, 'PASSWORD_RESET_COMPLETED', req, {
      email: user.email
    });

    return ResponseFormatter.success(
      res,
      null,
      'Password reset successfully'
    );
  });

  /**
   * Get user sessions
   * GET /api/auth/sessions
   */
  getSessions = asyncHandler(async (req, res) => {
    const sessions = await authService.getUserSessions(req.user.id);

    return ResponseFormatter.success(
      res,
      { sessions },
      'Sessions retrieved successfully'
    );
  });

  /**
   * Revoke session
   * DELETE /api/auth/sessions/:sessionId
   */
  revokeSession = asyncHandler(async (req, res) => {
    const sessionId = parseInt(req.params.sessionId);

    await authService.revokeSession(sessionId, req.user.id);

    return ResponseFormatter.success(
      res,
      null,
      'Session revoked successfully'
    );
  });

  /**
   * Verify 2FA code
   * POST /api/auth/verify-2fa
   */
  verify2FA = asyncHandler(async (req, res) => {
    const { userId, code, method, rememberDevice } = req.body;

    if (!userId || !code) {
      return ResponseFormatter.validationError(res, [
        { field: 'userId', message: 'User ID is required' },
        { field: 'code', message: 'Verification code is required' }
      ]);
    }

    const maintenance = await configService.getMaintenanceSettings();
    if (maintenance?.enabled) {
      const user = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
        include: {
          roles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  permissions: true,
                  isSystem: true
                }
              }
            }
          }
        }
      });
      if (!this.isSystemAdminUser(user)) {
        return ResponseFormatter.error(
          res,
          maintenance.message || 'System is under maintenance',
          503,
          { code: 'MAINTENANCE_MODE', maintenance }
        );
      }
    }

    const enabledMethods = await twoFactorService.getEnabledMethods();
    const resolvedMethod = method || 'email';
    if (resolvedMethod === 'email' && !enabledMethods.email) {
      return ResponseFormatter.error(res, 'Email verification is disabled', 400);
    }
    if (resolvedMethod === 'app' && !enabledMethods.app) {
      return ResponseFormatter.error(res, 'Authenticator app verification is disabled', 400);
    }

    // Verify the 2FA code
    const verification = await twoFactorService.verifyCode(parseInt(userId), code, resolvedMethod);

    if (!verification.valid) {
      // Log failed 2FA attempt
      await auditLogService.logAuth(parseInt(userId), 'TWO_FACTOR_FAILED', req, {
        error: verification.error
      });

      return ResponseFormatter.error(
        res,
        verification.error,
        401
      );
    }

    const fullResult = await authService.issueTokensForUserId(parseInt(userId), this.getClientIp(req), req.headers['user-agent']);

    if (rememberDevice) {
      const { rawToken, expiresAt } = await trustedDeviceService.issueTrustedDevice(parseInt(userId), req, 7);
      trustedDeviceService.setTrustedCookie(res, rawToken, expiresAt);
    }

    // Log successful login after 2FA
    await auditLogService.logAuth(fullResult.user.id, 'LOGIN', req, {
      email: fullResult.user.email,
      twoFactorVerified: true
    });

    return ResponseFormatter.success(
      res,
      fullResult,
      'Login successful',
      200
    );
  });

  /**
   * Resend 2FA code
   * POST /api/auth/resend-2fa
   */
  resend2FA = asyncHandler(async (req, res) => {
    const { userId, method } = req.body;

    if (!userId) {
      return ResponseFormatter.validationError(res, [
        { field: 'userId', message: 'User ID is required' }
      ]);
    }

    const maintenance = await configService.getMaintenanceSettings();
    if (maintenance?.enabled) {
      const user = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
        include: {
          roles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  permissions: true,
                  isSystem: true
                }
              }
            }
          }
        }
      });
      if (!this.isSystemAdminUser(user)) {
        return ResponseFormatter.error(
          res,
          maintenance.message || 'System is under maintenance',
          503,
          { code: 'MAINTENANCE_MODE', maintenance }
        );
      }
    }

    if ((method || 'email') !== 'email') {
      return ResponseFormatter.error(
        res,
        'Resend is only available for email verification',
        400
      );
    }

    const enabledMethods = await twoFactorService.getEnabledMethods();
    if (!enabledMethods.email) {
      return ResponseFormatter.error(res, 'Email verification is disabled', 400);
    }

    await twoFactorService.sendTwoFactorCode(parseInt(userId));

    return ResponseFormatter.success(
      res,
      { message: 'Verification code resent to your email' },
      'Code resent successfully',
      200
    );
  });

  /**
   * Revoke trusted device cookie for current user
   * POST /api/auth/2fa/revoke-trusted-device
   */
  revokeTrustedDevice = asyncHandler(async (req, res) => {
    const token = trustedDeviceService.getTrustedToken(req);
    if (token) {
      await trustedDeviceService.revokeTrustedDevice(req.user.id, token);
    }
    trustedDeviceService.clearTrustedCookie(res);

    return ResponseFormatter.success(
      res,
      { message: 'Trusted device revoked' },
      'Trusted device revoked successfully',
      200
    );
  });

  /**
   * Toggle 2FA for current user
   * PUT /api/auth/2fa
   */
  toggleTwoFactor = asyncHandler(async (req, res) => {
    const { enabled } = req.body;

    if (enabled) {
      await twoFactorService.enableTwoFactor(req.user.id);
    } else {
      await twoFactorService.disableTwoFactor(req.user.id);
    }

    // Log the action
    await auditLogService.log({
      userId: req.user.id,
      action: enabled ? 'TWO_FACTOR_ENABLED' : 'TWO_FACTOR_DISABLED',
      module: 'AUTH',
      description: `User ${enabled ? 'enabled' : 'disabled'} two-factor authentication`,
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    return ResponseFormatter.success(
      res,
      { twoFactorEnabled: enabled },
      `Two-factor authentication ${enabled ? 'enabled' : 'disabled'} successfully`
    );
  });

  /**
   * Deactivate current user account
   * POST /api/auth/deactivate
   */
  deactivateAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Update user status to INACTIVE
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' }
    });

    // Revoke all sessions for this user
    await prisma.userSession.deleteMany({
      where: { userId }
    });

    // Log the action
    await auditLogService.logAuth(userId, 'ACCOUNT_DEACTIVATED', req, {
      reason: 'User self-deactivation'
    });

    return ResponseFormatter.success(
      res,
      null,
      'Account deactivated successfully'
    );
  });

  /**
   * Begin authenticator app setup
   * POST /api/auth/2fa/setup-authenticator
   */
  setupAuthenticator = asyncHandler(async (req, res) => {
    const issuer = req.body?.issuer || 'FileNix / DMS';
    const payload = await twoFactorService.setupAuthenticator(req.user.id, issuer);

    return ResponseFormatter.success(
      res,
      payload,
      'Authenticator setup generated successfully'
    );
  });

  /**
   * Verify authenticator setup
   * POST /api/auth/2fa/verify-authenticator
   */
  verifyAuthenticatorSetup = asyncHandler(async (req, res) => {
    const { code } = req.body;

    if (!code) {
      return ResponseFormatter.validationError(res, [
        { field: 'code', message: 'Verification code is required' }
      ]);
    }

    const verification = await twoFactorService.verifyAuthenticatorSetup(req.user.id, code);
    if (!verification.valid) {
      return ResponseFormatter.error(res, verification.error, 400);
    }

    await auditLogService.log({
      userId: req.user.id,
      action: 'TWO_FACTOR_AUTHENTICATOR_ENABLED',
      module: 'AUTH',
      description: 'User enabled authenticator app for two-factor authentication',
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    return ResponseFormatter.success(
      res,
      { twoFactorEnabled: true, method: 'app' },
      'Authenticator app enabled successfully'
    );
  });

  /**
   * Get current user 2FA status/method
   * GET /api/auth/2fa/status
   */
  getTwoFactorStatus = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        twoFactorEnabled: true,
        twoFactorMethod: true,
        twoFactorSecret: true
      }
    });

    return ResponseFormatter.success(
      res,
      {
        twoFactorEnabled: user?.twoFactorEnabled || false,
        method: user?.twoFactorMethod || 'email',
        hasAuthenticator: Boolean(user?.twoFactorSecret)
      },
      '2FA status retrieved successfully'
    );
  });
}

module.exports = { authController: new AuthController() };
