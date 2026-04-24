/**
 * ═══════════════════════════════════════════════════════════
 * Permission Model
 * Fine-grained permissions for resources and actions
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Permission = sequelize.define('Permission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Resource being protected
    resource: {
      type: DataTypes.STRING,
      allowNull: false
      // Examples: 'user', 'group', 'application', 'organization', 'spark:message'
    },

    // Action allowed on resource
    action: {
      type: DataTypes.STRING,
      allowNull: false
      // Examples: 'read', 'write', 'delete', 'manage', 'create', 'update'
    },

    // Scope (organization, application, service)
    scope: {
      type: DataTypes.ENUM('system', 'organization', 'application', 'service'),
      defaultValue: 'application'
    },

    // Permission string (resource:action)
    permissionString: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
      // Example: 'user:read', 'spark:message:write'
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Service this permission belongs to
    service: {
      type: DataTypes.STRING,
      allowNull: true
      // Examples: 'auth', 'spark', 'timeline', 'filevault'
    },

    // Is this a system permission?
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'permissions',
    timestamps: true,
    indexes: [
      { fields: ['permissionString'], unique: true },
      { fields: ['resource'] },
      { fields: ['action'] },
      { fields: ['scope'] },
      { fields: ['service'] }
    ]
  });

  /**
   * Create system permissions (OPTIMIZED - Batch Loading)
   */
  Permission.createSystemPermissions = async function() {
    const systemPermissions = [
      // User permissions
      { resource: 'user', action: 'read', permissionString: 'user:read', scope: 'system', isSystem: true },
      { resource: 'user', action: 'write', permissionString: 'user:write', scope: 'system', isSystem: true },
      { resource: 'user', action: 'delete', permissionString: 'user:delete', scope: 'system', isSystem: true },
      { resource: 'user', action: 'manage', permissionString: 'user:manage', scope: 'system', isSystem: true },

      // Group permissions
      { resource: 'group', action: 'read', permissionString: 'group:read', scope: 'system', isSystem: true },
      { resource: 'group', action: 'write', permissionString: 'group:write', scope: 'system', isSystem: true },
      { resource: 'group', action: 'delete', permissionString: 'group:delete', scope: 'system', isSystem: true },
      { resource: 'group', action: 'manage', permissionString: 'group:manage', scope: 'system', isSystem: true },

      // Organization permissions
      { resource: 'organization', action: 'read', permissionString: 'org:read', scope: 'system', isSystem: true },
      { resource: 'organization', action: 'write', permissionString: 'org:write', scope: 'system', isSystem: true },
      { resource: 'organization', action: 'delete', permissionString: 'org:delete', scope: 'system', isSystem: true },
      { resource: 'organization', action: 'manage', permissionString: 'org:manage', scope: 'system', isSystem: true },

      // Application permissions
      { resource: 'application', action: 'read', permissionString: 'app:read', scope: 'system', isSystem: true },
      { resource: 'application', action: 'write', permissionString: 'app:write', scope: 'system', isSystem: true },
      { resource: 'application', action: 'delete', permissionString: 'app:delete', scope: 'system', isSystem: true },
      { resource: 'application', action: 'manage', permissionString: 'app:manage', scope: 'system', isSystem: true },

      // Service permissions (for each Exprsn service)
      { resource: 'service:auth', action: 'access', permissionString: 'service:auth:access', scope: 'service', service: 'auth', isSystem: true },
      { resource: 'service:spark', action: 'access', permissionString: 'service:spark:access', scope: 'service', service: 'spark', isSystem: true },
      { resource: 'service:timeline', action: 'access', permissionString: 'service:timeline:access', scope: 'service', service: 'timeline', isSystem: true },
      { resource: 'service:prefetch', action: 'access', permissionString: 'service:prefetch:access', scope: 'service', service: 'prefetch', isSystem: true },
      { resource: 'service:moderator', action: 'access', permissionString: 'service:moderator:access', scope: 'service', service: 'moderator', isSystem: true },
      { resource: 'service:filevault', action: 'access', permissionString: 'service:filevault:access', scope: 'service', service: 'filevault', isSystem: true },
      { resource: 'service:gallery', action: 'access', permissionString: 'service:gallery:access', scope: 'service', service: 'gallery', isSystem: true },
      { resource: 'service:live', action: 'access', permissionString: 'service:live:access', scope: 'service', service: 'live', isSystem: true }
    ];

    // OPTIMIZATION: Use single query to fetch existing permissions
    const { Op } = require('sequelize');
    const permissionStrings = systemPermissions.map(p => p.permissionString);

    const existingPermissions = await Permission.findAll({
      where: {
        permissionString: {
          [Op.in]: permissionStrings
        }
      },
      attributes: ['permissionString']
    });

    // Create a Set of existing permission strings for O(1) lookup
    const existingSet = new Set(existingPermissions.map(p => p.permissionString));

    // Filter out permissions that already exist
    const permissionsToCreate = systemPermissions.filter(
      p => !existingSet.has(p.permissionString)
    );

    // Bulk create only missing permissions
    if (permissionsToCreate.length > 0) {
      await Permission.bulkCreate(permissionsToCreate, {
        ignoreDuplicates: true
      });
    }
  };

  /**
   * Parse permission string
   */
  Permission.parsePermissionString = function(permString) {
    const parts = permString.split(':');
    return {
      resource: parts.slice(0, -1).join(':'),
      action: parts[parts.length - 1]
    };
  };

  return Permission;
};
