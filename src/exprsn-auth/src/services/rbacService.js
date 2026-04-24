/**
 * ═══════════════════════════════════════════════════════════
 * RBAC Service
 * Role-Based Access Control for users, groups, and applications
 * ═══════════════════════════════════════════════════════════
 */

const { User, Group, Role, Permission, UserRole, GroupRole, Application, Organization } = require('../models');
const { AppError } = require('@exprsn/shared');
const redisClient = require('../utils/redis');

/**
 * Check if user has permission
 * Resolves permissions from user roles and group roles
 */
async function checkPermission(userId, permissionString, options = {}) {
  const { organizationId, applicationId, serviceName } = options;

  try {
    // Check cache first
    const cacheKey = `permission:${userId}:${permissionString}:${organizationId || 'null'}:${applicationId || 'null'}:${serviceName || 'null'}`;
    const cachedResult = await redisClient.get(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    // Get user with roles and groups
    const user = await User.findByPk(userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: {
              status: 'active',
              ...(organizationId && { organizationId }),
              ...(applicationId && { applicationId })
            }
          }
        },
        {
          model: Group,
          as: 'groups',
          include: [
            {
              model: Role,
              as: 'roles',
              through: {
                where: {
                  status: 'active',
                  ...(organizationId && { organizationId }),
                  ...(applicationId && { applicationId })
                }
              }
            }
          ]
        }
      ]
    });

    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    // Collect all roles (user roles + group roles)
    const allRoles = [...user.roles];

    user.groups.forEach(group => {
      allRoles.push(...group.roles);
    });

    // Remove duplicates and sort by priority
    const uniqueRoles = Array.from(new Map(allRoles.map(r => [r.id, r])).values());
    uniqueRoles.sort((a, b) => b.priority - a.priority);

    // Check wildcard permission first
    for (const role of uniqueRoles) {
      if (role.permissions.includes('*')) {
        const result = { allowed: true, role: role.slug, reason: 'Wildcard permission' };
        await redisClient.set(cacheKey, result, 300); // Cache for 5 minutes
        return result;
      }
    }

    // Check exact permission
    for (const role of uniqueRoles) {
      if (role.permissions.includes(permissionString)) {
        const result = { allowed: true, role: role.slug, reason: 'Direct permission' };
        await redisClient.set(cacheKey, result, 300); // Cache for 5 minutes
        return result;
      }
    }

    // Check pattern matching (e.g., 'org:*' matches 'org:read')
    for (const role of uniqueRoles) {
      for (const perm of role.permissions) {
        if (matchesPermissionPattern(perm, permissionString)) {
          const result = { allowed: true, role: role.slug, reason: 'Pattern match' };
          await redisClient.set(cacheKey, result, 300); // Cache for 5 minutes
          return result;
        }
      }
    }

    // Check service access if serviceName provided
    if (serviceName) {
      for (const role of uniqueRoles) {
        if (!canAccessService(role, serviceName)) {
          const result = { allowed: false, reason: `Service ${serviceName} access denied` };
          await redisClient.set(cacheKey, result, 60); // Cache denials for 1 minute
          return result;
        }
      }
    }

    const result = { allowed: false, reason: 'No matching permission found' };
    await redisClient.set(cacheKey, result, 60); // Cache denials for 1 minute
    return result;
  } catch (error) {
    console.error('Error checking permission:', error);
    return { allowed: false, reason: 'Permission check failed', error: error.message };
  }
}

/**
 * Check if user can access a service
 */
async function checkServiceAccess(userId, serviceName, options = {}) {
  const { organizationId, applicationId } = options;

  try {
    // Get user with roles
    const user = await User.findByPk(userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: {
              status: 'active',
              ...(organizationId && { organizationId }),
              ...(applicationId && { applicationId })
            }
          }
        },
        {
          model: Group,
          as: 'groups',
          include: [
            {
              model: Role,
              as: 'roles',
              through: {
                where: {
                  status: 'active',
                  ...(organizationId && { organizationId }),
                  ...(applicationId && { applicationId })
                }
              }
            }
          ]
        }
      ]
    });

    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    // Collect all roles
    const allRoles = [...user.roles];
    user.groups.forEach(group => {
      allRoles.push(...group.roles);
    });

    // Check if any role denies access to this service
    for (const role of allRoles) {
      if (role.serviceAccess.deniedServices.includes(serviceName)) {
        return { allowed: false, reason: `Service explicitly denied by role ${role.slug}` };
      }
    }

    // Check if any role explicitly allows access
    let hasExplicitAllow = false;
    for (const role of allRoles) {
      const sa = role.serviceAccess;

      // Empty allowedServices means allow all (unless denied)
      if (!sa.allowedServices || sa.allowedServices.length === 0) {
        hasExplicitAllow = true;
        break;
      }

      // Check if service is in allowed list
      if (sa.allowedServices.includes(serviceName)) {
        hasExplicitAllow = true;
        break;
      }
    }

    if (!hasExplicitAllow) {
      return { allowed: false, reason: 'Service not in allowed list' };
    }

    // Check service-specific permission
    const servicePermission = `service:${serviceName}:access`;
    const permCheck = await checkPermission(userId, servicePermission, options);

    return permCheck;
  } catch (error) {
    console.error('Error checking service access:', error);
    return { allowed: false, reason: 'Service access check failed', error: error.message };
  }
}

/**
 * Check if application can be accessed by user
 */
async function checkApplicationAccess(userId, applicationId) {
  try {
    const [app, user] = await Promise.all([
      Application.findByPk(applicationId),
      User.findByPk(userId, {
        include: [
          {
            model: Group,
            as: 'groups'
          }
        ]
      })
    ]);

    if (!app || app.status !== 'active') {
      return { allowed: false, reason: 'Application not found or inactive' };
    }

    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    // Get user's group IDs
    const userGroupIds = user.groups.map(g => g.id);

    // Check if user can access this application
    const canAccess = app.canUserAccess(userId, userGroupIds);

    if (!canAccess) {
      return { allowed: false, reason: 'User not authorized for this application' };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking application access:', error);
    return { allowed: false, reason: 'Application access check failed', error: error.message };
  }
}

/**
 * Assign role to user
 */
async function assignRoleToUser(userId, roleId, options = {}) {
  const { organizationId, applicationId, assignedBy, expiresAt } = options;

  try {
    // Check if role assignment already exists
    const existing = await UserRole.findOne({
      where: {
        userId,
        roleId,
        scope: organizationId ? (applicationId ? 'application' : 'organization') : 'global',
        ...(organizationId && { organizationId }),
        ...(applicationId && { applicationId })
      }
    });

    if (existing) {
      if (existing.status === 'active') {
        throw new AppError('Role already assigned to user', 400, 'ROLE_ALREADY_ASSIGNED');
      }

      // Reactivate if it was revoked
      existing.status = 'active';
      existing.expiresAt = expiresAt || null;
      await existing.save();

      // Invalidate permission cache for this user
      await redisClient.delPattern(`permission:${userId}:*`);

      return existing;
    }

    // Create new role assignment
    const userRole = await UserRole.create({
      userId,
      roleId,
      scope: organizationId ? (applicationId ? 'application' : 'organization') : 'global',
      organizationId,
      applicationId,
      assignedBy,
      expiresAt,
      status: 'active'
    });

    // Invalidate permission cache for this user
    await redisClient.delPattern(`permission:${userId}:*`);

    return userRole;
  } catch (error) {
    console.error('Error assigning role to user:', error);
    throw error;
  }
}

/**
 * Revoke role from user
 */
async function revokeRoleFromUser(userId, roleId, options = {}) {
  const { organizationId, applicationId } = options;

  try {
    const userRole = await UserRole.findOne({
      where: {
        userId,
        roleId,
        status: 'active',
        ...(organizationId && { organizationId }),
        ...(applicationId && { applicationId })
      }
    });

    if (!userRole) {
      throw new AppError('Role assignment not found', 404, 'ROLE_NOT_FOUND');
    }

    userRole.status = 'revoked';
    await userRole.save();

    // Invalidate permission cache for this user
    await redisClient.delPattern(`permission:${userId}:*`);

    return userRole;
  } catch (error) {
    console.error('Error revoking role from user:', error);
    throw error;
  }
}

/**
 * Assign role to group
 */
async function assignRoleToGroup(groupId, roleId, options = {}) {
  const { organizationId, applicationId, assignedBy } = options;

  try {
    // Check if role assignment already exists
    const existing = await GroupRole.findOne({
      where: {
        groupId,
        roleId,
        scope: organizationId ? (applicationId ? 'application' : 'organization') : 'global',
        ...(organizationId && { organizationId }),
        ...(applicationId && { applicationId })
      }
    });

    if (existing) {
      if (existing.status === 'active') {
        throw new AppError('Role already assigned to group', 400, 'ROLE_ALREADY_ASSIGNED');
      }

      // Reactivate if revoked
      existing.status = 'active';
      await existing.save();
      return existing;
    }

    // Create new role assignment
    const groupRole = await GroupRole.create({
      groupId,
      roleId,
      scope: organizationId ? (applicationId ? 'application' : 'organization') : 'global',
      organizationId,
      applicationId,
      assignedBy,
      status: 'active'
    });

    return groupRole;
  } catch (error) {
    console.error('Error assigning role to group:', error);
    throw error;
  }
}

/**
 * Revoke role from group
 */
async function revokeRoleFromGroup(groupId, roleId, options = {}) {
  const { organizationId, applicationId } = options;

  try {
    const groupRole = await GroupRole.findOne({
      where: {
        groupId,
        roleId,
        status: 'active',
        ...(organizationId && { organizationId }),
        ...(applicationId && { applicationId })
      }
    });

    if (!groupRole) {
      throw new AppError('Role assignment not found', 404, 'ROLE_NOT_FOUND');
    }

    groupRole.status = 'revoked';
    await groupRole.save();

    return groupRole;
  } catch (error) {
    console.error('Error revoking role from group:', error);
    throw error;
  }
}

/**
 * Get all permissions for a user (resolved from roles)
 */
async function getUserPermissions(userId, options = {}) {
  const { organizationId, applicationId } = options;

  try {
    const user = await User.findByPk(userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: {
              status: 'active',
              ...(organizationId && { organizationId }),
              ...(applicationId && { applicationId })
            }
          }
        },
        {
          model: Group,
          as: 'groups',
          include: [
            {
              model: Role,
              as: 'roles',
              through: {
                where: {
                  status: 'active',
                  ...(organizationId && { organizationId }),
                  ...(applicationId && { applicationId })
                }
              }
            }
          ]
        }
      ]
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Collect all permissions from roles
    const permissions = new Set();
    const roles = [];

    user.roles.forEach(role => {
      roles.push({ id: role.id, slug: role.slug, name: role.name, source: 'user' });
      role.permissions.forEach(p => permissions.add(p));
    });

    user.groups.forEach(group => {
      group.roles.forEach(role => {
        roles.push({ id: role.id, slug: role.slug, name: role.name, source: `group:${group.name}` });
        role.permissions.forEach(p => permissions.add(p));
      });
    });

    return {
      userId,
      permissions: Array.from(permissions),
      roles
    };
  } catch (error) {
    console.error('Error getting user permissions:', error);
    throw error;
  }
}

/**
 * Helper: Match permission pattern
 * Supports wildcards: 'org:*' matches 'org:read', 'org:write', etc.
 */
function matchesPermissionPattern(pattern, permission) {
  if (pattern === '*') return true;
  if (pattern === permission) return true;

  const patternParts = pattern.split(':');
  const permParts = permission.split(':');

  if (patternParts.length !== permParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') continue;
    if (patternParts[i] !== permParts[i]) return false;
  }

  return true;
}

/**
 * Helper: Check if role allows service access
 */
function canAccessService(role, serviceName) {
  const sa = role.serviceAccess;

  // Check explicit denial
  if (sa.deniedServices && sa.deniedServices.includes(serviceName)) {
    return false;
  }

  // Empty allowedServices means all services allowed
  if (!sa.allowedServices || sa.allowedServices.length === 0) {
    return true;
  }

  // Check if service is in allowed list
  return sa.allowedServices.includes(serviceName);
}

module.exports = {
  checkPermission,
  checkServiceAccess,
  checkApplicationAccess,
  assignRoleToUser,
  revokeRoleFromUser,
  assignRoleToGroup,
  revokeRoleFromGroup,
  getUserPermissions
};
