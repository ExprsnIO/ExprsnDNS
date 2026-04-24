/**
 * ═══════════════════════════════════════════════════════════
 * UserRole Model
 * Junction table for users with assigned roles
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserRole = sequelize.define('UserRole', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
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
      defaultValue: 'global'
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

    // Expiration (optional)
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'expired', 'revoked'),
      defaultValue: 'active'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'user_roles',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['roleId'] },
      { fields: ['userId', 'roleId', 'scope', 'organizationId', 'applicationId'], unique: true },
      { fields: ['organizationId'] },
      { fields: ['applicationId'] },
      { fields: ['status'] },
      { fields: ['expiresAt'] }
    ]
  });

  return UserRole;
};
