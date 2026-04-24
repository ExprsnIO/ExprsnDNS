/**
 * Migration: Create Feature Flags Table
 * Defines features available at each subscription tier
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('feature_flags', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      feature_key: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      feature_name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      category: {
        type: Sequelize.ENUM('service', 'storage', 'compute', 'integration', 'security', 'support'),
        allowNull: false
      },
      tiers: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          free: false,
          pro: false,
          max: false,
          premium: false,
          team_small: false,
          team_growing: false,
          team_scale: false,
          enterprise: false
        }
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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
    await queryInterface.addIndex('feature_flags', ['feature_key'], { unique: true });
    await queryInterface.addIndex('feature_flags', ['category']);
    await queryInterface.addIndex('feature_flags', ['enabled']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('feature_flags');
  }
};
