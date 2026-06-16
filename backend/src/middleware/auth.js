const { verifyAccessToken } = require('../utils/jwt');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const prisma = require('../config/database');

/**
 * Authenticate user from JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyAccessToken(token);

    // Check if session exists and is valid
    const session = await prisma.userSession.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: true
              }
            }
          }
        }
      }
    });

    if (!session) {
      throw new UnauthorizedError('Invalid session');
    }

    // Check if session expired
    if (new Date() > session.expiresAt) {
      await prisma.userSession.delete({
        where: { id: session.id }
      });
      throw new UnauthorizedError('Session expired');
    }

    // Check if user is active
    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is not active');
    }

    // Attach user to request
    const mergedPermissions = session.user.roles.reduce((acc, r) => {
      const rolePermissions = typeof r.role.permissions === 'string' 
        ? JSON.parse(r.role.permissions) 
        : r.role.permissions;

      if (!rolePermissions || typeof rolePermissions !== 'object') return acc

      Object.keys(rolePermissions).forEach((moduleKey) => {
        if (!acc[moduleKey]) acc[moduleKey] = {}
        const actions = rolePermissions[moduleKey] || {}
        if (!actions || typeof actions !== 'object') return

        Object.keys(actions).forEach((action) => {
          if (actions[action]) acc[moduleKey][action] = true
        })
      })

      return acc
    }, {})

    req.user = {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.roles.map(r => r.role.name),
      permissions: mergedPermissions
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new UnauthorizedError('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expired'));
    }
    next(error);
  }
};

/**
 * Check if user has required role(s)
 * @param {string|string[]} roles - Required role(s)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('User not authenticated'));
    }

    const userRoles = req.user.roles;
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

/**
 * Check if user has required permission(s)
 * @param {string} resource - Resource name (e.g., 'documents', 'users')
 * @param {string|string[]} actions - Required action(s) (e.g., 'create', 'update')
 */
const authorizePermission = (resource, ...actions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('User not authenticated'));
    }

    const userPermissions = req.user.permissions[resource] || [];
    const hasPermission = actions.some(action => userPermissions.includes(action));

    if (!hasPermission) {
      return next(new ForbiddenError(`You don't have permission to perform this action`));
    }

    next();
  };
};

/**
 * Optional authentication - does not fail if no token
 * Useful for endpoints that work for both authenticated and unauthenticated users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    const session = await prisma.userSession.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: true
              }
            }
          }
        }
      }
    });

    if (session && new Date() <= session.expiresAt) {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        roles: session.user.roles.map(r => r.role.name)
      };
    }

    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
};

// Legacy support
const requireAuth = authenticate;

module.exports = {
  authenticate,
  authorize,
  authorizePermission,
  optionalAuth,
  requireAuth // backward compatibility
};
