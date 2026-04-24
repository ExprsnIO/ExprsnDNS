/**
 * ═══════════════════════════════════════════════════════════
 * Group Model
 * User groups for permission management
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Group = sequelize.define('Group', {
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

    // Organization this group belongs to
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },

    // Group type
    type: {
      type: DataTypes.ENUM('system', 'organization', 'custom'),
      defaultValue: 'custom'
    },

    // Legacy permissions (for backward compatibility)
    permissions: {
      type: DataTypes.JSON,
      defaultValue: {
        read: false,
        write: false,
        append: false,
        delete: false,
        update: false
      }
    },

    // Parent group for hierarchical groups
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'groups',
        key: 'id'
      }
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'groups',
    timestamps: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['slug'] },
      { fields: ['organizationId'] },
      { fields: ['organizationId', 'slug'], unique: true },
      { fields: ['parentId'] }
    ]
  });

  Group.associate = function(models) {
    // Organization relationship
    Group.belongsTo(models.Organization, {
      as: 'organization',
      foreignKey: 'organizationId'
    });

    // Parent/child relationships
    Group.belongsTo(Group, {
      as: 'parent',
      foreignKey: 'parentId'
    });

    Group.hasMany(Group, {
      as: 'children',
      foreignKey: 'parentId'
    });

    // Members relationship
    Group.belongsToMany(models.User, {
      through: models.UserGroup,
      as: 'members',
      foreignKey: 'groupId',
      otherKey: 'userId'
    });

    // Roles relationship
    Group.belongsToMany(models.Role, {
      through: models.GroupRole,
      as: 'roles',
      foreignKey: 'groupId',
      otherKey: 'roleId'
    });
  };

  return Group;
};
