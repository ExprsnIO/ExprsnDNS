/**
 * ═══════════════════════════════════════════════════════════════════════
 * Role Model - Permission scope based roles
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define('Role', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Permission flags (binary)
    permissionFlags: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'permission_flags',
      comment: 'Binary flags: Read(1), Write(2), Append(4), Share(8), Delete(16), Moderate(32), Link(64)'
    },
    resourceType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'resource_type',
      comment: 'Type of resource this role applies to (e.g., certificate, token, user)'
    },
    resourcePattern: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'resource_pattern',
      comment: 'Pattern for matching resources (e.g., /api/certificates/*)'
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_system',
      comment: 'System roles cannot be deleted'
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Higher priority roles take precedence'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'deprecated'),
      defaultValue: 'active',
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'roles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['name'], unique: true },
      { fields: ['slug'], unique: true },
      { fields: ['resource_type'] },
      { fields: ['is_system'] },
      { fields: ['priority'] },
      { fields: ['status'] }
    ]
  });

  // Instance methods for permission checking
  Role.prototype.hasPermission = function(permission) {
    const flags = require('../config').permissions.flags;
    return (this.permissionFlags & flags[permission.toUpperCase()]) !== 0;
  };

  Role.prototype.addPermission = function(permission) {
    const flags = require('../config').permissions.flags;
    this.permissionFlags |= flags[permission.toUpperCase()];
  };

  Role.prototype.removePermission = function(permission) {
    const flags = require('../config').permissions.flags;
    this.permissionFlags &= ~flags[permission.toUpperCase()];
  };

  Role.prototype.getPermissions = function() {
    const flags = require('../config').permissions.flags;
    const permissions = [];

    for (const [name, value] of Object.entries(flags)) {
      if (this.permissionFlags & value) {
        permissions.push(name.toLowerCase());
      }
    }

    return permissions;
  };

  return Role;
};
