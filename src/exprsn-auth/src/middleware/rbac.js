/**
 * ═══════════════════════════════════════════════════════════
 * RBAC Middleware
 * Role-Based Access Control middleware for protecting endpoints
 * ═══════════════════════════════════════════════════════════
 */

const { asyncHandler, AppError, logger } = require('@exprsn/shared');
const { getRbacService } = require('../services/rbacService');

/**
 * Require specific permission for the current user
 * @param {string|string[]} permissions - Permission name(s) required
 * @param {object} options - Additional options
 * @returns {Function} Express middleware
 */
function requirePermission(permissions, options = {}) {
  const {
    organizationId = null,
    applicationId = null,
    requireAll = false // If true, require all permissions; if false, require any
  } = options;

  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }

    const rbacService = await getRbacService();
    const permsArray = Array.isArray(permissions) ? permissions : [permissions];

    // Get organization/app from request if not provided
    const orgId = organizationId || req.params.organizationId || req.query.organizationId;
    const appId = applicationId || req.params.applicationId || req.query.applicationId;

    // Check permissions
    const hasPermission = requireAll
      ? await rbacService.hasAllPermissions(req.user.id, permsArray, { organizationId: orgId, applicationId: appId })
      : await rbacService.hasAnyPermission(req.user.id, permsArray, { organizationId: orgId, applicationId: appId });

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        requiredPermissions: permsArray,
        requireAll,
        organizationId: orgId,
        applicationId: appId
      });

      throw new AppError(
        'Insufficient permissions',
        403,
        'FORBIDDEN',
        { required: permsArray }
      );
    }

    logger.debug('Permission granted', {
      userId: req.user.id,
      permissions: permsArray
    });

    next();
  });
}

/**
 * Require specific role for the current user
 * @param {string|string[]} roles - Role name(s) required
 * @param {object} options - Additional options
 * @returns {Function} Express middleware
 */
function requireRole(roles, options = {}) {
  const {
    organizationId = null,
    applicationId = null,
    requireAll = false
  } = options;

  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }

    const rbacService = await getRbacService();
    const rolesArray = Array.isArray(roles) ? roles : [roles];

    // Get organization/app from request if not provided
    const orgId = organizationId || req.params.organizationId || req.query.organizationId;
    const appId = applicationId || req.params.applicationId || req.query.applicationId;

    // Check roles
    const hasRole = requireAll
      ? await rbacService.hasAllRoles(req.user.id, rolesArray, { organizationId: orgId, applicationId: appId })
      : await rbacService.hasAnyRole(req.user.id, rolesArray, { organizationId: orgId, applicationId: appId });

    if (!hasRole) {
      logger.warn('Role check failed', {
        userId: req.user.id,
        requiredRoles: rolesArray,
        requireAll,
        organizationId: orgId,
        applicationId: appId
      });

      throw new AppError(
        'Insufficient role privileges',
        403,
        'FORBIDDEN',
        { required: rolesArray }
      );
    }

    logger.debug('Role check passed', {
      userId: req.user.id,
      roles: rolesArray
    });

    next();
  });
}

/**
 * Require ownership of a resource
 * @param {Function} getResourceOwner - Function to get resource owner ID from request
 * @returns {Function} Express middleware
 */
function requireOwnership(getResourceOwner) {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }

    const ownerId = await getResourceOwner(req);

    if (!ownerId) {
      throw new AppError('Resource not found', 404, 'NOT_FOUND');
    }

    if (req.user.id !== ownerId) {
      logger.warn('Ownership check failed', {
        userId: req.user.id,
        resourceOwnerId: ownerId
      });

      throw new AppError(
        'You do not have permission to access this resource',
        403,
        'FORBIDDEN'
      );
    }

    next();
  });
}

/**
 * Require organization membership
 * @returns {Function} Express middleware
 */
function requireOrganizationMember() {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }

    const organizationId = req.params.organizationId || req.query.organizationId;

    if (!organizationId) {
      throw new AppError('Organization ID required', 400, 'ORGANIZATION_ID_REQUIRED');
    }

    const rbacService = await getRbacService();
    const isMember = await rbacService.isOrganizationMember(req.user.id, organizationId);

    if (!isMember) {
      logger.warn('Organization membership check failed', {
        userId: req.user.id,
        organizationId
      });

      throw new AppError(
        'You are not a member of this organization',
        403,
        'NOT_ORGANIZATION_MEMBER'
      );
    }

    next();
  });
}

/**
 * Require group membership
 * @returns {Function} Express middleware
 */
function requireGroupMember() {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }

    const groupId = req.params.groupId || req.query.groupId;

    if (!groupId) {
      throw new AppError('Group ID required', 400, 'GROUP_ID_REQUIRED');
    }

    const rbacService = await getRbacService();
    const isMember = await rbacService.isGroupMember(req.user.id, groupId);

    if (!isMember) {
      logger.warn('Group membership check failed', {
        userId: req.user.id,
        groupId
      });

      throw new AppError(
        'You are not a member of this group',
        403,
        'NOT_GROUP_MEMBER'
      );
    }

    next();
  });
}

/**
 * Check if user is admin (has 'admin' role globally)
 * @returns {Function} Express middleware
 */
function requireAdmin() {
  return requireRole('admin');
}

/**
 * Check if user is super admin (has 'super_admin' role globally)
 * @returns {Function} Express middleware
 */
function requireSuperAdmin() {
  return requireRole('super_admin');
}

/**
 * Require MFA verification for sensitive operations
 * @returns {Function} Express middleware
 */
function requireMfaVerified() {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
    }

    const { User } = require('../models');
    const user = await User.findByPk(req.user.id);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // If MFA is enabled for user, check if it's verified in session
    if (user.mfaEnabled && !req.session.mfaVerified) {
      throw new AppError(
        'MFA verification required',
        403,
        'MFA_REQUIRED',
        { mfaRequired: true }
      );
    }

    next();
  });
}

/**
 * Combine multiple authorization checks with OR logic
 * @param {...Function} middlewares - Authorization middlewares to combine
 * @returns {Function} Express middleware
 */
function anyOf(...middlewares) {
  return async (req, res, next) => {
    let lastError = null;

    for (const middleware of middlewares) {
      try {
        // Try each middleware
        await new Promise((resolve, reject) => {
          middleware(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // If successful, proceed
        return next();
      } catch (error) {
        // Store error and continue trying
        lastError = error;
      }
    }

    // If all failed, throw the last error
    next(lastError || new AppError('Authorization failed', 403, 'FORBIDDEN'));
  };
}

/**
 * Combine multiple authorization checks with AND logic
 * @param {...Function} middlewares - Authorization middlewares to combine
 * @returns {Function} Express middleware
 */
function allOf(...middlewares) {
  return async (req, res, next) => {
    try {
      for (const middleware of middlewares) {
        await new Promise((resolve, reject) => {
          middleware(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Add user's permissions to request object
 * @returns {Function} Express middleware
 */
function loadUserPermissions() {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const rbacService = await getRbacService();
    const organizationId = req.params.organizationId || req.query.organizationId;
    const applicationId = req.params.applicationId || req.query.applicationId;

    req.userPermissions = await rbacService.getUserPermissions(
      req.user.id,
      { organizationId, applicationId }
    );

    next();
  });
}

/**
 * Add user's roles to request object
 * @returns {Function} Express middleware
 */
function loadUserRoles() {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const rbacService = await getRbacService();
    const organizationId = req.params.organizationId || req.query.organizationId;
    const applicationId = req.params.applicationId || req.query.applicationId;

    req.userRoles = await rbacService.getUserRoles(
      req.user.id,
      { organizationId, applicationId }
    );

    next();
  });
}

module.exports = {
  requirePermission,
  requireRole,
  requireOwnership,
  requireOrganizationMember,
  requireGroupMember,
  requireAdmin,
  requireSuperAdmin,
  requireMfaVerified,
  anyOf,
  allOf,
  loadUserPermissions,
  loadUserRoles
};
