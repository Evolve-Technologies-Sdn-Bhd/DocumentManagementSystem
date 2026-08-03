const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const config = require('../config/app');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { UnauthorizedError, NotFoundError, BadRequestError } = require('../utils/errors');
const { generateEmployeeId } = require('../utils/employeeIdGenerator');
const securityService = require('./securityService');

class AuthService {
  buildPasswordResetSecret(user) {
    return `${config.jwtSecret}:${user.password}`;
  }

  stripSensitiveUser(user) {
    const hasAuthenticator = Boolean(user.twoFactorSecret)
    const {
      password: _,
      twoFactorCode: __,
      twoFactorCodeExpiry: ___,
      twoFactorSecret: ____,
      twoFactorTempSecret: _____,
      ...userWithoutPassword
    } = user
    return { ...userWithoutPassword, hasAuthenticator }
  }

  async createSessionForUser(user, ipAddress, userAgent) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    })

    await prisma.userSession.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() }
      }
    })

    const securitySettings = await securityService.getSecuritySettings()
    const sessionTimeoutMs = (securitySettings.sessionTimeout || 480) * 60 * 1000

    const payload = {
      userId: user.id,
      email: user.email,
      roles: user.roles.map(r => r.role.name)
    }

    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken({ userId: user.id })

    await prisma.userSession.create({
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + sessionTimeoutMs)
      }
    })

    return { accessToken, refreshToken }
  }
  /**
   * Login user with email and password
   * @param {string} email
   * @param {string} password
   * @param {string} ipAddress
   * @param {string} userAgent
   * @param {object} options - { skipSession: boolean } - skip session creation for 2FA flow
   */
  async login(email, password, ipAddress, userAgent, options = {}) {
    const { skipSession = false } = options;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
                permissions: true,
                isSystem: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if user is active
    if (user.status === 'LOCKED') {
      throw new UnauthorizedError('Account is locked. Please contact administrator');
    }

    if (user.status === 'INACTIVE') {
      throw new UnauthorizedError('Account is inactive');
    }

    // Check if account is temporarily locked due to failed attempts
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      throw new UnauthorizedError('Account is temporarily locked. Please try again later');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Increment failed attempts
      await this.handleFailedLogin(user.id);
      throw new UnauthorizedError('Invalid credentials');
    }

    // Reset failed attempts on successful password validation
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null
      }
    });

    const userWithoutPassword = this.stripSensitiveUser(user)

    // If skipSession is true (2FA required), return user only without creating session
    if (skipSession) {
      return {
        user: userWithoutPassword,
        accessToken: null,
        refreshToken: null
      };
    }
    const { accessToken, refreshToken } = await this.createSessionForUser(user, ipAddress, userAgent)

    return { user: userWithoutPassword, accessToken, refreshToken }
  }

  async issueTokensForUserId(userId, ipAddress, userAgent) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
                permissions: true,
                isSystem: true
              }
            }
          }
        }
      }
    })
    if (!user) {
      throw new NotFoundError('User not found')
    }
    const tokens = await this.createSessionForUser(user, ipAddress, userAgent)
    return { user: this.stripSensitiveUser(user), ...tokens }
  }

  /**
   * Handle failed login attempts using security settings
   */
  async handleFailedLogin(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    // Get security settings
    const securitySettings = await securityService.getSecuritySettings();
    const maxAttempts = securitySettings.maxLoginAttempts || 5;
    const lockoutMinutes = securitySettings.lockoutDuration || 30;

    const failedAttempts = user.failedAttempts + 1;
    const updateData = { failedAttempts };

    // Lock account based on configurable settings
    if (failedAttempts >= maxAttempts) {
      updateData.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });
  }

  /**
   * Register new user
   */
  async register(userData) {
    const { email, password, firstName, lastName, phone, department, position } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new BadRequestError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate Employee ID
    const generatedEmployeeId = await generateEmployeeId();

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        department,
        position,
        employeeId: generatedEmployeeId,
        status: 'ACTIVE'
      }
    });

    // Assign default 'drafter' role
    const drafterRole = await prisma.role.findUnique({
      where: { name: 'drafter' }
    });

    if (drafterRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: drafterRole.id
        }
      });
    }

    // Create user preferences
    await prisma.userPreference.create({
      data: {
        userId: user.id
      }
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Find session
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

      if (!session) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Check if session expired
      if (new Date() > session.expiresAt) {
        await prisma.userSession.delete({
          where: { id: session.id }
        });
        throw new UnauthorizedError('Session expired');
      }

      // Generate new tokens
      const payload = {
        userId: session.user.id,
        email: session.user.email,
        roles: session.user.roles.map(r => r.role.name)
      };

      const newAccessToken = signAccessToken(payload);
      const newRefreshToken = signRefreshToken({ userId: session.user.id });

      // Get session timeout from security settings
      const securitySettings = await securityService.getSecuritySettings();
      const sessionTimeoutMs = (securitySettings.sessionTimeout || 480) * 60 * 1000;

      // Update session with configurable timeout
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          token: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: new Date(Date.now() + sessionTimeoutMs)
        }
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user
   */
  async logout(token) {
    await prisma.userSession.deleteMany({
      where: { token }
    });
  }

  /**
   * Get user by ID with roles
   */
  async getUserById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
                permissions: true,
                isSystem: true
              }
            }
          }
        },
        preferences: true
      }
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Remove password
    const { password: _, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updateData) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
                permissions: true,
                isSystem: true
              }
            }
          }
        }
      }
    });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
  }

  async createPasswordResetCode(email) {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      throw new BadRequestError('Email is required');
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user || user.status !== 'ACTIVE') {
      return null;
    }

    const expiresInMinutes = parseInt(process.env.PASSWORD_RESET_CODE_MINUTES || '10', 10) || 10;
    const cooldownSeconds = parseInt(process.env.PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS || '60', 10) || 60;

    const existing = await prisma.passwordResetCode.findUnique({
      where: { userId: user.id }
    });

    const now = new Date();
    if (existing?.lastSentAt) {
      const cooldownUntil = new Date(existing.lastSentAt.getTime() + cooldownSeconds * 1000);
      if (cooldownUntil > now) {
        return { user, code: null, expiresInMinutes, cooldownSeconds };
      }
    }

    const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000);

    await prisma.passwordResetCode.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        codeHash,
        expiresAt,
        attempts: 0,
        lastSentAt: now,
        consumedAt: null
      },
      update: {
        codeHash,
        expiresAt,
        attempts: 0,
        lastSentAt: now,
        consumedAt: null
      }
    });

    return { user, code, expiresInMinutes, cooldownSeconds };
  }

  async verifyPasswordResetCode(email, code) {
    const normalizedEmail = String(email || '').trim();
    const normalizedCode = String(code || '').trim();
    if (!normalizedEmail || !normalizedCode) {
      return { ok: false };
    }

    const maxAttempts = parseInt(process.env.PASSWORD_RESET_CODE_MAX_ATTEMPTS || '5', 10) || 5;
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user || user.status !== 'ACTIVE') {
      return { ok: false };
    }

    const record = await prisma.passwordResetCode.findUnique({
      where: { userId: user.id }
    });

    const now = new Date();
    if (!record) return { ok: false };
    if (record.consumedAt) return { ok: false };
    if (record.expiresAt <= now) return { ok: false };
    if (record.attempts >= maxAttempts) return { ok: false };

    const match = await bcrypt.compare(normalizedCode, record.codeHash);
    if (!match) {
      await prisma.passwordResetCode.update({
        where: { userId: user.id },
        data: { attempts: { increment: 1 } }
      });
      return { ok: false };
    }

    return { ok: true, user };
  }

  async resetPasswordWithCode(email, code, newPassword) {
    const verification = await this.verifyPasswordResetCode(email, code);
    if (!verification.ok || !verification.user) {
      throw new UnauthorizedError('Invalid or expired reset code');
    }

    const user = verification.user;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          failedAttempts: 0,
          lockedUntil: null,
          twoFactorCode: null,
          twoFactorCodeExpiry: null
        }
      }),
      prisma.userSession.deleteMany({
        where: { userId: user.id }
      }),
      prisma.trustedDevice.deleteMany({
        where: { userId: user.id }
      }),
      prisma.passwordResetCode.update({
        where: { userId: user.id },
        data: { consumedAt: now }
      })
    ]);

    return user;
  }

  /**
   * Get all user sessions
   */
  async getUserSessions(userId) {
    return await prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId, userId) {
    await prisma.userSession.deleteMany({
      where: {
        id: sessionId,
        userId
      }
    });
  }
}

module.exports = new AuthService();
