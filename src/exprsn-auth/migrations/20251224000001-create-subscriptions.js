/**
 * Migration: Create Subscriptions Table
 * Tracks user and organization subscription tiers and billing information
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('subscriptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tier: {
        type: Sequelize.ENUM('free', 'pro', 'max', 'premium', 'team_small', 'team_growing', 'team_scale', 'enterprise'),
        allowNull: false,
        defaultValue: 'free'
      },
      status: {
        type: Sequelize.ENUM('active', 'canceled', 'past_due', 'suspended', 'trialing'),
        allowNull: false,
        defaultValue: 'active'
      },
      billing_cycle: {
        type: Sequelize.ENUM('monthly', 'annual'),
        allowNull: true
      },
      stripe_customer_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      stripe_subscription_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      current_period_start: {
        type: Sequelize.DATE,
        allowNull: true
      },
      current_period_end: {
        type: Sequelize.DATE,
        allowNull: true
      },
      canceled_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      cancel_at_period_end: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      trial_start: {
        type: Sequelize.DATE,
        allowNull: true
      },
      trial_end: {
        type: Sequelize.DATE,
        allowNull: true
      },
      seats: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('subscriptions', ['user_id']);
    await queryInterface.addIndex('subscriptions', ['organization_id']);
    await queryInterface.addIndex('subscriptions', ['tier']);
    await queryInterface.addIndex('subscriptions', ['status']);
    await queryInterface.addIndex('subscriptions', ['stripe_customer_id']);
    await queryInterface.addIndex('subscriptions', ['stripe_subscription_id'], { unique: true });
    await queryInterface.addIndex('subscriptions', ['current_period_end']);

    // Add constraint: either user_id or organization_id must be set
    await queryInterface.addConstraint('subscriptions', {
      fields: ['user_id', 'organization_id'],
      type: 'check',
      name: 'subscriptions_user_or_org_check',
      where: {
        [Sequelize.Op.or]: [
          { user_id: { [Sequelize.Op.ne]: null } },
          { organization_id: { [Sequelize.Op.ne]: null } }
        ]
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('subscriptions');
  }
};
