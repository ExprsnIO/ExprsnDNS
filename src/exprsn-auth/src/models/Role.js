/**
 * ═══════════════════════════════════════════════════════════
 * Role Model
 * Roles define sets of permissions for users and groups
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('Role', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    slug: {
      type: DataTypes.STRING,
      allowNull: false
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Organization this role belongs to (null for system roles)
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },

    // Role type
    type: {
      type: DataTypes.ENUM('system', 'organization', 'custom'),
      defaultValue: 'custom'
    },

    // Built-in roles cannot be deleted
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // Priority for conflict resolution (higher wins)
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    // Permissions array
    permissions: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Service access restrictions
    serviceAccess: {
      type: DataTypes.JSON,
      defaultValue: {
        allowedServices: [], // Empty = all services allowed
        deniedServices: []   // Explicit denials
      }
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'roles',
    timestamps: true,
    indexes: [
      { fields: ['organizationId'] },
      { fields: ['type'] },
      { fields: ['slug'] },
      { fields: ['organizationId', 'slug'], unique: true }
    ]
  });

  Role.associate = function(models) {
    // Organization relationship
    Role.belongsTo(models.Organization, {
      as: 'organization',
      foreignKey: 'organizationId'
    });

    // Users with this role
    Role.belongsToMany(models.User, {
      through: models.UserRole,
      as: 'users',
      foreignKey: 'roleId',
      otherKey: 'userId'
    });

    // Groups with this role
    Role.belongsToMany(models.Group, {
      through: models.GroupRole,
      as: 'groups',
      foreignKey: 'roleId',
      otherKey: 'groupId'
    });
  };

  /**
   * Create system roles (OPTIMIZED - Batch Loading)
   */
  Role.createSystemRoles = async function() {
    const systemRoles = [
      {
        name: 'Super Admin',
        slug: 'super-admin',
        description: 'Full system access',
        type: 'system',
        isSystem: true,
        priority: 1000,
        permissions: ['*'],
        serviceAccess: { allowedServices: [], deniedServices: [] }
      },
      {
        name: 'Organization Owner',
        slug: 'org-owner',
        description: 'Full organization access',
        type: 'system',
        isSystem: true,
        priority: 900,
        permissions: ['org:*'],
        serviceAccess: { allowedServices: [], deniedServices: [] }
      },
      {
        name: 'Organization Admin',
        slug: 'org-admin',
        description: 'Organization administration',
        type: 'system',
        isSystem: true,
        priority: 800,
        permissions: ['org:read', 'org:write', 'org:users:*', 'org:groups:*'],
        serviceAccess: { allowedServices: [], deniedServices: [] }
      },
      {
        name: 'Organization Member',
        slug: 'org-member',
        description: 'Basic organization member',
        type: 'system',
        isSystem: true,
        priority: 100,
        permissions: ['org:read', 'app:read'],
        serviceAccess: { allowedServices: [], deniedServices: [] }
      }
    ];

    // OPTIMIZATION: Use single query to fetch existing roles
    const { Op } = require('sequelize');
    const roleSlugs = systemRoles.map(r => r.slug);

    const existingRoles = await Role.findAll({
      where: {
        slug: {
          [Op.in]: roleSlugs
        },
        organizationId: null
      },
      attributes: ['slug']
    });

    // Create a Set of existing role slugs for O(1) lookup
    const existingSet = new Set(existingRoles.map(r => r.slug));

    // Filter out roles that already exist
    const rolesToCreate = systemRoles.filter(
      r => !existingSet.has(r.slug)
    );

    // Bulk create only missing roles
    if (rolesToCreate.length > 0) {
      await Role.bulkCreate(rolesToCreate, {
        ignoreDuplicates: true
      });
    }
  };

  return Role;
};
