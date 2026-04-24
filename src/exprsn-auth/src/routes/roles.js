/**
 * ═══════════════════════════════════════════════════════════
 * Roles & Permissions Routes
 * RBAC management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Role, Permission, UserRole, GroupRole } = require('../models');
const rbacService = require('../services/rbacService');
const organizationService = require('../services/organizationService');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * GET /api/roles
 * Get roles (system or organization-scoped)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { organizationId, type } = req.query;

    const where = {};

    if (type) {
      where.type = type;
    }

    if (organizationId) {
      // Check if user is member of organization
      const isMember = await organizationService.isMember(organizationId, req.user.id);
      if (!isMember) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization'
        });
      }

      where.organizationId = organizationId;
    } else {
      // System roles only
      where.organizationId = null;
    }

    const roles = await Role.findAll({
      where,
      order: [['priority', 'DESC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      roles
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles
 * Create custom role
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { organizationId } = req.body;

    // Check permissions
    if (organizationId) {
      const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(organizationId, req.user.id);
      if (!isOwnerOrAdmin) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only organization owners and admins can create roles'
        });
      }
    } else {
      // System role - need system admin permission
      const hasPermission = await rbacService.checkPermission(req.user.id, '*');
      if (!hasPermission.allowed) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only system administrators can create system roles'
        });
      }
    }

    const role = await Role.create({
      ...req.body,
      type: organizationId ? 'organization' : 'custom',
      isSystem: false
    });

    res.status(201).json({
      success: true,
      role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/roles/:id
 * Get role by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Role not found'
      });
    }

    // Check access if organization-scoped
    if (role.organizationId) {
      const isMember = await organizationService.isMember(role.organizationId, req.user.id);
      if (!isMember) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to this role'
        });
      }
    }

    res.json({
      success: true,
      role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/roles/:id
 * Update role
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Role not found'
      });
    }

    // Cannot modify system roles
    if (role.isSystem) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'System roles cannot be modified'
      });
    }

    // Check permissions
    if (role.organizationId) {
      const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(role.organizationId, req.user.id);
      if (!isOwnerOrAdmin) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only organization owners and admins can update roles'
        });
      }
    }

    await role.update(req.body);

    res.json({
      success: true,
      role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/roles/:id
 * Delete role
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Role not found'
      });
    }

    // Cannot delete system roles
    if (role.isSystem) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'System roles cannot be deleted'
      });
    }

    // Check permissions
    if (role.organizationId) {
      const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(role.organizationId, req.user.id);
      if (!isOwnerOrAdmin) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only organization owners and admins can delete roles'
        });
      }
    }

    await role.destroy();

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/assign-user
 * Assign role to user
 */
router.post('/:id/assign-user', requireAuth, async (req, res, next) => {
  try {
    const { userId, organizationId, applicationId, expiresAt } = req.body;

    const userRole = await rbacService.assignRoleToUser(userId, req.params.id, {
      organizationId,
      applicationId,
      assignedBy: req.user.id,
      expiresAt
    });

    res.status(201).json({
      success: true,
      userRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/revoke-user
 * Revoke role from user
 */
router.post('/:id/revoke-user', requireAuth, async (req, res, next) => {
  try {
    const { userId, organizationId, applicationId } = req.body;

    const userRole = await rbacService.revokeRoleFromUser(userId, req.params.id, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      userRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/assign-group
 * Assign role to group
 */
router.post('/:id/assign-group', requireAuth, async (req, res, next) => {
  try {
    const { groupId, organizationId, applicationId } = req.body;

    const groupRole = await rbacService.assignRoleToGroup(groupId, req.params.id, {
      organizationId,
      applicationId,
      assignedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      groupRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/roles/:id/revoke-group
 * Revoke role from group
 */
router.post('/:id/revoke-group', requireAuth, async (req, res, next) => {
  try {
    const { groupId, organizationId, applicationId } = req.body;

    const groupRole = await rbacService.revokeRoleFromGroup(groupId, req.params.id, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      groupRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/permissions
 * Get all permissions
 */
router.get('/permissions', requireAuth, async (req, res, next) => {
  try {
    const { scope, service } = req.query;

    const where = {};
    if (scope) where.scope = scope;
    if (service) where.service = service;

    const permissions = await Permission.findAll({
      where,
      order: [['permissionString', 'ASC']]
    });

    res.json({
      success: true,
      permissions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:userId/permissions
 * Get user's resolved permissions
 */
router.get('/users/:userId/permissions', requireAuth, async (req, res, next) => {
  try {
    const { organizationId, applicationId } = req.query;

    const result = await rbacService.getUserPermissions(req.params.userId, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/check-permission
 * Check if user has specific permission
 */
router.post('/check-permission', requireAuth, async (req, res, next) => {
  try {
    const { userId = req.user.id, permission, organizationId, applicationId, serviceName } = req.body;

    const result = await rbacService.checkPermission(userId, permission, {
      organizationId,
      applicationId,
      serviceName
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/check-service-access
 * Check if user can access a service
 */
router.post('/check-service-access', requireAuth, async (req, res, next) => {
  try {
    const { userId = req.user.id, serviceName, organizationId, applicationId } = req.body;

    const result = await rbacService.checkServiceAccess(userId, serviceName, {
      organizationId,
      applicationId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
