/**
 * ═══════════════════════════════════════════════════════════
 * GroupRole Model
 * Junction table for groups with assigned roles
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GroupRole = sequelize.define('GroupRole', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'groups',
        key: 'id'
      }
    },

    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id'
      }
    },

    // Scope of this role assignment
    scope: {
      type: DataTypes.ENUM('global', 'organization', 'application'),
      defaultValue: 'organization'
    },

    // Scoped to specific organization
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },

    // Scoped to specific application
    applicationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'applications',
        key: 'id'
      }
    },

    // Assigned by
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'revoked'),
      defaultValue: 'active'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'auth_group_roles',
    timestamps: true,
    indexes: [
      { fields: ['groupId'] },
      { fields: ['roleId'] },
      {
        fields: ['groupId', 'roleId', 'scope', 'organizationId', 'applicationId'],
        unique: true,
        name: 'auth_group_roles_unique_assignment'
      },
      { fields: ['organizationId'] },
      { fields: ['applicationId'] },
      { fields: ['status'] }
    ]
  });

  return GroupRole;
};
