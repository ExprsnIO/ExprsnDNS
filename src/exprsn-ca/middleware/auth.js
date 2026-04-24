/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Middleware
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../config/logging');

/**
 * Require authentication - redirect to login if not authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    // Store the original URL for redirect after login
    req.session.returnTo = req.originalUrl;

    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'You must be logged in to access this resource'
      });
    }

    // For web requests, redirect to login
    return res.redirect('/auth/login');
  }

  // Attach user to res.locals for views
  res.locals.user = req.session.user;
  next();
}

/**
 * Require authentication for API endpoints - return JSON error
 */
function requireAuthAPI(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'You must be logged in to access this resource'
    });
  }

  res.locals.user = req.session.user;
  next();
}

/**
 * Optional authentication - attach user if logged in, but don't require it
 */
function optionalAuth(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
  } else {
    res.locals.user = null;
  }
  next();
}

/**
 * Check if user is already authenticated and redirect to dashboard
 * Useful for login/register pages
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Require specific permissions
 * @param {Array<string>} permissions - Array of required permissions
 */
function requirePermissions(...permissions) {
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({
          success: false,
          error: 'AUTHENTICATION_REQUIRED',
          message: 'You must be logged in to access this resource'
        });
      }
      return res.redirect('/auth/login');
    }

    try {
      const User = require('../models/User');
      const user = await User.findByPk(req.session.user.id, {
        include: [
          {
            association: 'roles',
            through: { attributes: [] }
          },
          {
            association: 'groups',
            include: [{
              association: 'roleSets',
              include: [{
                association: 'roles'
              }]
            }]
          }
        ]
      });

      if (!user) {
        req.session.destroy();
        if (req.path.startsWith('/api/')) {
          return res.status(401).json({
            success: false,
            error: 'USER_NOT_FOUND',
            message: 'User account not found'
          });
        }
        return res.redirect('/auth/login');
      }

      // Collect all user permissions from roles
      const userPermissions = new Set();

      // Direct roles
      if (user.roles) {
        user.roles.forEach(role => {
          if (role.permissions && Array.isArray(role.permissions)) {
            role.permissions.forEach(p => userPermissions.add(p));
          }
        });
      }

      // Roles from groups
      if (user.groups) {
        user.groups.forEach(group => {
          if (group.roleSets) {
            group.roleSets.forEach(roleSet => {
              if (roleSet.roles) {
                roleSet.roles.forEach(role => {
                  if (role.permissions && Array.isArray(role.permissions)) {
                    role.permissions.forEach(p => userPermissions.add(p));
                  }
                });
              }
            });
          }
        });
      }

      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(p => userPermissions.has(p));

      if (!hasAllPermissions) {
        logger.warn('Permission denied', {
          userId: user.id,
          required: permissions,
          has: Array.from(userPermissions)
        });

        if (req.path.startsWith('/api/')) {
          return res.status(403).json({
            success: false,
            error: 'INSUFFICIENT_PERMISSIONS',
            message: 'You do not have permission to access this resource',
            required: permissions
          });
        }

        return res.status(403).render('error', {
          title: 'Access Denied',
          message: 'You do not have permission to access this resource',
          error: {
            status: 403,
            stack: process.env.NODE_ENV === 'development' ? new Error().stack : undefined
          }
        });
      }

      // Attach full user with permissions to request
      req.user = user;
      req.userPermissions = Array.from(userPermissions);
      res.locals.user = user;
      res.locals.userPermissions = Array.from(userPermissions);

      next();
    } catch (error) {
      logger.error('Error checking permissions', { error: error.message, stack: error.stack });

      if (req.path.startsWith('/api/')) {
        return res.status(500).json({
          success: false,
          error: 'PERMISSION_CHECK_FAILED',
          message: 'An error occurred while checking permissions'
        });
      }

      return res.status(500).render('error', {
        title: 'Error',
        message: 'An error occurred while checking permissions',
        error: {
          status: 500,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
  };
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  return requirePermissions('admin:full')(req, res, next);
}

/**
 * Attach user to locals middleware
 * Runs on every request to make user available in views
 */
function attachUserToLocals(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
  } else {
    res.locals.user = null;
  }

  // Attach helper function to check permissions in views
  res.locals.hasPermission = (permission) => {
    return res.locals.userPermissions && res.locals.userPermissions.includes(permission);
  };

  next();
}

module.exports = {
  requireAuth,
  requireAuthAPI,
  optionalAuth,
  redirectIfAuthenticated,
  requirePermissions,
  requireAdmin,
  attachUserToLocals
};
