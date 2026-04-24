/**
 * ═══════════════════════════════════════════════════════════════════════
 * RateLimit Model - User and Group-specific rate limiting configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const RateLimit = sequelize.define('RateLimit', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    targetType: {
      type: DataTypes.ENUM('user', 'group', 'global'),
      allowNull: false,
      field: 'target_type'
    },
    targetId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'target_id',
      comment: 'User ID, Group ID, or null for global limits'
    },
    endpoint: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Specific endpoint pattern (e.g., "/api/tokens/*") or null for all endpoints'
    },
    windowMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 900000, // 15 minutes
      field: 'window_ms',
      comment: 'Time window in milliseconds'
    },
    maxRequests: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      field: 'max_requests',
      comment: 'Maximum number of requests allowed in the window'
    },
    skipSuccessful: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'skip_successful',
      comment: 'If true, only count failed requests'
    },
    skipFailedAuth: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'skip_failed_auth',
      comment: 'If true, skip counting failed authentication attempts'
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Higher priority limits are checked first (user > group > global)'
    },
    message: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Custom rate limit exceeded message'
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
    tableName: 'rate_limits',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['target_type', 'target_id'], name: 'idx_rate_limits_target' },
      { fields: ['endpoint'], name: 'idx_rate_limits_endpoint' },
      { fields: ['enabled'], name: 'idx_rate_limits_enabled' },
      { fields: ['priority'], name: 'idx_rate_limits_priority' },
      {
        fields: ['target_type', 'target_id', 'endpoint'],
        unique: true,
        name: 'idx_rate_limits_unique'
      }
    ],
    hooks: {
      beforeValidate: (rateLimit) => {
        // Set priority based on target type
        if (rateLimit.targetType === 'user') {
          rateLimit.priority = 100;
        } else if (rateLimit.targetType === 'group') {
          rateLimit.priority = 50;
        } else if (rateLimit.targetType === 'global') {
          rateLimit.priority = 0;
        }
      }
    }
  });

  return RateLimit;
};
