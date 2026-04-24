/**
 * Subscription Model
 * Tracks user and organization subscription tiers
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define('Subscription', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      comment: 'Individual subscription user'
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      comment: 'Organization subscription (mutually exclusive with userId)'
    },
    tier: {
      type: DataTypes.ENUM('free', 'pro', 'max', 'premium', 'team_small', 'team_growing', 'team_scale', 'enterprise'),
      allowNull: false,
      defaultValue: 'free'
    },
    status: {
      type: DataTypes.ENUM('active', 'canceled', 'past_due', 'suspended', 'trialing'),
      allowNull: false,
      defaultValue: 'active'
    },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'annual'),
      allowNull: true,
      field: 'billing_cycle',
      comment: 'Null for free tier'
    },
    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'stripe_customer_id'
    },
    stripeSubscriptionId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'stripe_subscription_id'
    },
    currentPeriodStart: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'current_period_start'
    },
    currentPeriodEnd: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'current_period_end'
    },
    canceledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'canceled_at'
    },
    cancelAtPeriodEnd: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'cancel_at_period_end'
    },
    trialStart: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'trial_start'
    },
    trialEnd: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'trial_end'
    },
    seats: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Number of seats for organization subscriptions'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional subscription metadata'
    }
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['organization_id'] },
      { fields: ['tier'] },
      { fields: ['status'] },
      { fields: ['stripe_customer_id'] },
      { fields: ['stripe_subscription_id'], unique: true },
      { fields: ['current_period_end'] }
    ],
    validate: {
      eitherUserOrOrg() {
        if ((this.userId && this.organizationId) || (!this.userId && !this.organizationId)) {
          throw new Error('Subscription must be associated with either a user or an organization, not both');
        }
      }
    }
  });

  return Subscription;
};
