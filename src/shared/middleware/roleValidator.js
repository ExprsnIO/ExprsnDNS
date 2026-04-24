/**
 * ═══════════════════════════════════════════════════════════
 * Role-Based Authorization Middleware
 * Validates user roles and permissions for protected endpoints
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

/**
 * Validates user has required role(s)
 * @param {string|Array<string>} roles - Required role(s) (e.g., 'admin' or ['admin', 'moderator'])
 * @returns {Function} Express middleware
 */
function requireRole(roles) {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.userId) {
      logger.warn('Role check failed: No authenticated user', {
        path: req.path,
        method: req.method
      });

      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    // Check if user role is available (should be attached by auth middleware)
    if (!req.userRole && !req.userRoles) {
      logger.error('Role check failed: No role data attached to request', {
        userId: req.userId,
        path: req.path
      });

      return res.status(500).json({
        error: 'CONFIGURATION_ERROR',
        message: 'User role information not available'
      });
    }

    // Support both single role (userRole) and multiple roles (userRoles array)
    const userRoles = req.userRoles || [req.userRole];

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some(role =>
      userRoles.includes(role)
    );

    if (!hasRequiredRole) {
      logger.warn('Role check failed: Insufficient role', {
        userId: req.userId,
        userRoles,
        requiredRoles,
        path: req.path
      });

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Required role: ${requiredRoles.join(' or ')}`
      });
    }

    logger.debug('Role validation successful', {
      userId: req.userId,
      userRoles,
      path: req.path
    });

    next();
  };
}

/**
 * Validates user is a moderator
 * @returns {Function} Express middleware
 */
function requireModerator() {
  return requireRole(['moderator', 'admin']);
}

/**
 * Validates user is an administrator
 * @returns {Function} Express middleware
 */
function requireAdmin() {
  return requireRole('admin');
}

/**
 * Validates user has specific permission
 * @param {string|Array<string>} permissions - Required permission(s)
 * @returns {Function} Express middleware
 */
function requirePermission(permissions) {
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

  return (req, res, next) => {
    if (!req.userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    // Check if user permissions are available
    if (!req.userPermissions) {
      logger.error('Permission check failed: No permission data attached to request', {
        userId: req.userId,
        path: req.path
      });

      return res.status(500).json({
        error: 'CONFIGURATION_ERROR',
        message: 'User permission information not available'
      });
    }

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every(perm =>
      req.userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      logger.warn('Permission check failed', {
        userId: req.userId,
        userPermissions: req.userPermissions,
        requiredPermissions,
        path: req.path
      });

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Required permissions: ${requiredPermissions.join(', ')}`
      });
    }

    logger.debug('Permission validation successful', {
      userId: req.userId,
      path: req.path
    });

    next();
  };
}

/**
 * Validates user owns the resource or is an admin
 * @param {Function} getResourceOwner - Function to extract owner ID from request
 * @returns {Function} Express middleware
 */
function requireOwnerOrAdmin(getResourceOwner) {
  return async (req, res, next) => {
    if (!req.userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    try {
      // Extract resource owner ID
      const ownerId = await getResourceOwner(req);

      // Check if user is owner or admin
      const userRoles = req.userRoles || [req.userRole];
      const isOwner = req.userId === ownerId;
      const isAdmin = userRoles.includes('admin');

      if (!isOwner && !isAdmin) {
        logger.warn('Ownership check failed', {
          userId: req.userId,
          ownerId,
          path: req.path
        });

        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have permission to access this resource'
        });
      }

      logger.debug('Ownership validation successful', {
        userId: req.userId,
        isOwner,
        isAdmin,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Ownership validation error', {
        error: error.message,
        userId: req.userId,
        path: req.path
      });

      next(error);
    }
  };
}

module.exports = {
  requireRole,
  requireModerator,
  requireAdmin,
  requirePermission,
  requireOwnerOrAdmin
};
