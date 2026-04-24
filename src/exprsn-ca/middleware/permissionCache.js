/**
 * ═══════════════════════════════════════════════════════════════════════
 * Permission Caching Middleware - Redis-backed permission caching
 * ═══════════════════════════════════════════════════════════════════════
 */

const redis = require('redis');
const { User, Role, Group, RoleSet } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

// Redis client singleton
let redisClient = null;

// Cache TTL (5 minutes default)
const PERMISSION_CACHE_TTL = parseInt(process.env.PERMISSION_CACHE_TTL) || 300;

/**
 * Initialize Redis client
 */
async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  if (!config.cache.enabled) {
    return null;
  }

  try {
    redisClient = redis.createClient({
      host: config.cache.host,
      port: config.cache.port,
      password: config.cache.password,
      db: config.cache.db || 0
    });

    redisClient.on('error', (err) => {
      logger.error('Redis permission cache error:', err);
    });

    await redisClient.connect();
    logger.info('Redis permission cache client connected');

    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis for permission caching:', error);
    return null;
  }
}

/**
 * Aggregate permissions from user roles and group roles
 */
function aggregatePermissions(user) {
  const permissions = {
    read: false,
    write: false,
    append: false,
    delete: false,
    update: false,
    admin: false,
    moderator: false
  };

  // Aggregate direct user roles
  if (user.roles && user.roles.length > 0) {
    user.roles.forEach(role => {
      if (role.permissionRead) permissions.read = true;
      if (role.permissionWrite) permissions.write = true;
      if (role.permissionAppend) permissions.append = true;
      if (role.permissionDelete) permissions.delete = true;
      if (role.permissionUpdate) permissions.update = true;

      // Check for admin/moderator roles
      if (role.name === 'admin' || role.slug === 'admin') {
        permissions.admin = true;
      }
      if (role.name === 'moderator' || role.slug === 'moderator') {
        permissions.moderator = true;
      }
    });
  }

  // Aggregate permissions from groups
  if (user.groups && user.groups.length > 0) {
    user.groups.forEach(group => {
      if (group.roleSets && group.roleSets.length > 0) {
        group.roleSets.forEach(roleSet => {
          if (roleSet.roles && roleSet.roles.length > 0) {
            roleSet.roles.forEach(role => {
              if (role.permissionRead) permissions.read = true;
              if (role.permissionWrite) permissions.write = true;
              if (role.permissionAppend) permissions.append = true;
              if (role.permissionDelete) permissions.delete = true;
              if (role.permissionUpdate) permissions.update = true;

              if (role.name === 'admin' || role.slug === 'admin') {
                permissions.admin = true;
              }
              if (role.name === 'moderator' || role.slug === 'moderator') {
                permissions.moderator = true;
              }
            });
          }
        });
      }
    });
  }

  // Admin users get all permissions
  if (permissions.admin) {
    permissions.read = true;
    permissions.write = true;
    permissions.append = true;
    permissions.delete = true;
    permissions.update = true;
  }

  return permissions;
}

/**
 * Load user permissions from database
 */
async function loadUserPermissions(userId) {
  try {
    const user = await User.findByPk(userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          through: { attributes: [] }
        },
        {
          model: Group,
          as: 'groups',
          include: [
            {
              model: RoleSet,
              as: 'roleSets',
              through: { attributes: [] },
              include: [
                {
                  model: Role,
                  as: 'roles',
                  through: { attributes: [] }
                }
              ]
            }
          ]
        }
      ]
    });

    if (!user) {
      return null;
    }

    return aggregatePermissions(user);
  } catch (error) {
    logger.error(`Failed to load permissions for user ${userId}:`, error);
    return null;
  }
}

/**
 * Get user permissions (from cache or database)
 */
async function getUserPermissions(userId) {
  const client = await getRedisClient();

  if (!client) {
    // Redis not available, load from database
    return await loadUserPermissions(userId);
  }

  try {
    const cacheKey = `${config.cache.keyPrefix || 'exprsn:ca:'}permissions:${userId}`;

    // Try to get from cache
    const cached = await client.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - load from database
    const permissions = await loadUserPermissions(userId);

    if (permissions) {
      // Store in cache
      await client.setEx(cacheKey, PERMISSION_CACHE_TTL, JSON.stringify(permissions));
    }

    return permissions;
  } catch (error) {
    logger.error('Permission cache get error:', error);
    // Fallback to database
    return await loadUserPermissions(userId);
  }
}

/**
 * Invalidate permission cache for a user
 */
async function invalidateUserPermissionCache(userId) {
  const client = await getRedisClient();

  if (!client) {
    return;
  }

  try {
    const cacheKey = `${config.cache.keyPrefix || 'exprsn:ca:'}permissions:${userId}`;
    await client.del(cacheKey);
    logger.debug(`Invalidated permission cache for user ${userId}`);
  } catch (error) {
    logger.error(`Failed to invalidate permission cache for user ${userId}:`, error);
  }
}

/**
 * Invalidate permission cache for all users in a group
 */
async function invalidateGroupPermissionCache(groupId) {
  try {
    const group = await Group.findByPk(groupId, {
      include: [{ model: User, as: 'users' }]
    });

    if (group && group.users) {
      for (const user of group.users) {
        await invalidateUserPermissionCache(user.id);
      }
      logger.debug(`Invalidated permission cache for ${group.users.length} users in group ${groupId}`);
    }
  } catch (error) {
    logger.error(`Failed to invalidate group permission cache for group ${groupId}:`, error);
  }
}

/**
 * Invalidate permission cache for all users with a specific role
 */
async function invalidateRolePermissionCache(roleId) {
  try {
    const role = await Role.findByPk(roleId, {
      include: [{ model: User, as: 'users' }]
    });

    if (role && role.users) {
      for (const user of role.users) {
        await invalidateUserPermissionCache(user.id);
      }
      logger.debug(`Invalidated permission cache for ${role.users.length} users with role ${roleId}`);
    }
  } catch (error) {
    logger.error(`Failed to invalidate role permission cache for role ${roleId}:`, error);
  }
}

/**
 * Check if user has required permissions
 */
function hasPermissions(userPermissions, requiredPermissions) {
  if (!userPermissions || !requiredPermissions) {
    return false;
  }

  // Admin users have all permissions
  if (userPermissions.admin) {
    return true;
  }

  // Check each required permission
  for (const [permission, required] of Object.entries(requiredPermissions)) {
    if (required && !userPermissions[permission]) {
      return false;
    }
  }

  return true;
}

/**
 * Permission checking middleware
 */
function requirePermissions(requiredPermissions) {
  return async (req, res, next) => {
    try {
      // Get user ID from session or request
      const userId = req.session?.userId || req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      }

      // Get user permissions (from cache or database)
      const permissions = await getUserPermissions(userId);

      if (!permissions) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Unable to verify permissions'
        });
      }

      // Check if user has required permissions
      if (!hasPermissions(permissions, requiredPermissions)) {
        return res.status(403).json({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have the required permissions for this action',
          required: requiredPermissions,
          current: permissions
        });
      }

      // Attach permissions to request object
      req.userPermissions = permissions;

      next();
    } catch (error) {
      logger.error('Permission check middleware error:', error);
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to verify permissions'
      });
    }
  };
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
  return requirePermissions({ admin: true })(req, res, next);
}

/**
 * Check if user is admin or moderator
 */
function requireModerator(req, res, next) {
  return async (req, res, next) => {
    const userId = req.session?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const permissions = await getUserPermissions(userId);

    if (!permissions || (!permissions.admin && !permissions.moderator)) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Admin or moderator access required'
      });
    }

    req.userPermissions = permissions;
    next();
  };
}

/**
 * Close Redis connection
 */
async function closeRedis() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    logger.info('Redis permission cache client disconnected');
  }
}

module.exports = {
  getUserPermissions,
  invalidateUserPermissionCache,
  invalidateGroupPermissionCache,
  invalidateRolePermissionCache,
  hasPermissions,
  aggregatePermissions,
  requirePermissions,
  requireAdmin,
  requireModerator,
  getRedisClient,
  closeRedis
};
