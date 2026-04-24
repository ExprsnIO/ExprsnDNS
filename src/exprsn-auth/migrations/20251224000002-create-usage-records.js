/**
 * Migration: Create Usage Records Table
 * Tracks metered usage for billing calculations
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('usage_records', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      subscription_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'subscriptions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      metric_type: {
        type: Sequelize.ENUM(
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
        allowNull: false
      },
      quantity: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      unit: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      cost: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true
      },
      period_start: {
        type: Sequelize.DATE,
        allowNull: false
      },
      period_end: {
        type: Sequelize.DATE,
        allowNull: false
      },
      billing_month: {
        type: Sequelize.STRING(7),
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      recorded_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
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
    await queryInterface.addIndex('usage_records', ['subscription_id']);
    await queryInterface.addIndex('usage_records', ['user_id']);
    await queryInterface.addIndex('usage_records', ['metric_type']);
    await queryInterface.addIndex('usage_records', ['billing_month']);
    await queryInterface.addIndex('usage_records', ['subscription_id', 'metric_type', 'billing_month']);
    await queryInterface.addIndex('usage_records', ['recorded_at']);
    await queryInterface.addIndex('usage_records', ['period_start', 'period_end']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('usage_records');
  }
};
