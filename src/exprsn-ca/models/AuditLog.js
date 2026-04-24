/**
 * ═══════════════════════════════════════════════════════════════════════
 * AuditLog Model - Comprehensive audit trail
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User who performed the action (null for system actions)'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Action type (e.g., certificate.create, token.validate, user.login)'
    },
    resourceType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'resource_type',
      comment: 'Type of resource affected (e.g., certificate, token, user)'
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resource_id',
      comment: 'ID of the affected resource'
    },
    status: {
      type: DataTypes.ENUM('success', 'failure', 'error'),
      allowNull: false,
      defaultValue: 'success'
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
      allowNull: false,
      defaultValue: 'info'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Human-readable description of the action'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'user_agent'
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'request_id',
      comment: 'Correlation ID for grouping related logs'
    },
    details: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Additional structured data about the action'
    },
    changes: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Before/after state for update operations'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  }, {
    tableName: 'audit_logs',
    timestamps: false, // Only track creation
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['action'] },
      { fields: ['resource_type'] },
      { fields: ['resource_id'] },
      { fields: ['status'] },
      { fields: ['severity'] },
      { fields: ['request_id'] },
      { fields: ['created_at'] }
    ]
  });

  // Class methods
  AuditLog.log = async function(data) {
    return this.create({
      userId: data.userId || null,
      action: data.action,
      resourceType: data.resourceType || null,
      resourceId: data.resourceId || null,
      status: data.status || 'success',
      severity: data.severity || 'info',
      message: data.message || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      requestId: data.requestId || null,
      details: data.details || {},
      changes: data.changes || null
    });
  };

  return AuditLog;
};
