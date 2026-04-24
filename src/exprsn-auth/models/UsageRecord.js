/**
 * Usage Record Model
 * Tracks metered usage for billing (storage, bandwidth, API calls, etc.)
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UsageRecord = sequelize.define('UsageRecord', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'subscription_id',
      references: {
        model: 'subscriptions',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      comment: 'User who generated the usage'
    },
    metricType: {
      type: DataTypes.ENUM(
        'storage',
        'bandwidth',
        'api_calls',
        'live_streaming_minutes',
        'ai_moderation_requests',
        'workflow_executions',
        'payment_transactions',
        'sms_messages',
        'email_sends'
      ),
      allowNull: false,
      field: 'metric_type'
    },
    quantity: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Amount used (GB, count, minutes, etc.)'
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Unit of measurement (GB, count, minutes, etc.)'
    },
    cost: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      comment: 'Calculated cost in USD'
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'period_start'
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'period_end'
    },
    billingMonth: {
      type: DataTypes.STRING(7),
      allowNull: false,
      field: 'billing_month',
      comment: 'YYYY-MM format for aggregation'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Service-specific usage details'
    },
    recordedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'recorded_at'
    }
  }, {
    tableName: 'usage_records',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['subscription_id'] },
      { fields: ['user_id'] },
      { fields: ['metric_type'] },
      { fields: ['billing_month'] },
      { fields: ['subscription_id', 'metric_type', 'billing_month'] },
      { fields: ['recorded_at'] },
      { fields: ['period_start', 'period_end'] }
    ]
  });

  return UsageRecord;
};
