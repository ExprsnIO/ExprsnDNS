/**
 * ═══════════════════════════════════════════════════════════
 * Admin Authentication Middleware
 * Ensures user is authenticated and has admin privileges
 * ═══════════════════════════════════════════════════════════
 */

const { Role } = require('../models');

/**
 * Require admin role
 */
async function requireAdmin(req, res, next) {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.redirect('/admin/login?returnTo=' + encodeURIComponent(req.originalUrl));
    }

    // Check if user has admin role
    const roles = await Role.findAll({
      include: [{
        model: req.user.constructor,
        as: 'users',
        where: { id: req.user.id },
        through: { attributes: [] }
      }]
    });

    const hasAdminRole = roles.some(role =>
      role.name === 'admin' ||
      role.name === 'system_admin' ||
      role.permissions?.includes('admin:*')
    );

    if (!hasAdminRole) {
      return res.status(403).render('error', {
        error: 'Access Denied',
        message: 'You do not have permission to access the admin interface.'
      });
    }

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).render('error', {
      error: 'Authentication Error',
      message: 'An error occurred while verifying your permissions.'
    });
  }
}

/**
 * Optionally check for specific admin permission
 */
function requireAdminPermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.redirect('/admin/login?returnTo=' + encodeURIComponent(req.originalUrl));
      }

      const roles = await Role.findAll({
        include: [{
          model: req.user.constructor,
          as: 'users',
          where: { id: req.user.id },
          through: { attributes: [] }
        }]
      });

      const hasPermission = roles.some(role => {
        if (!role.permissions) return false;
        return role.permissions.includes(permission) ||
               role.permissions.includes('admin:*') ||
               role.name === 'system_admin';
      });

      if (!hasPermission) {
        return res.status(403).render('error', {
          error: 'Insufficient Permissions',
          message: `You need the '${permission}' permission to access this resource.`
        });
      }

      next();
    } catch (error) {
      console.error('Admin permission check error:', error);
      res.status(500).render('error', {
        error: 'Authorization Error',
        message: 'An error occurred while verifying your permissions.'
      });
    }
  };
}

module.exports = {
  requireAdmin,
  requireAdminPermission
};
