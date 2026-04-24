/**
 * ═══════════════════════════════════════════════════════════
 * OrganizationMember Model
 * Junction table for users belonging to organizations
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const OrganizationMember = sequelize.define('OrganizationMember', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Member role in organization
    role: {
      type: DataTypes.ENUM('owner', 'admin', 'member', 'guest'),
      defaultValue: 'member'
    },

    // Join date
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },

    // Invitation details
    invitedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'invited', 'suspended'),
      defaultValue: 'active'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'organization_members',
    timestamps: true,
    indexes: [
      { fields: ['organizationId'] },
      { fields: ['userId'] },
      { fields: ['organizationId', 'userId'], unique: true },
      { fields: ['status'] }
    ]
  });

  return OrganizationMember;
};
