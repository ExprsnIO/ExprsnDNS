'use strict';

/**
 * Migration: Create Password Resets Table
 * ═══════════════════════════════════════════════════════════════════════
 * Password reset request tracking
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('password_resets', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      token: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'used', 'expired', 'revoked'),
        defaultValue: 'pending',
        allowNull: false
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('password_resets', ['token'], {
      unique: true,
      name: 'password_resets_token_unique_idx'
    });

    await queryInterface.addIndex('password_resets', ['user_id'], {
      name: 'password_resets_user_id_idx'
    });

    await queryInterface.addIndex('password_resets', ['status'], {
      name: 'password_resets_status_idx'
    });

    await queryInterface.addIndex('password_resets', ['expires_at'], {
      name: 'password_resets_expires_at_idx'
    });

    await queryInterface.addIndex('password_resets', ['created_at'], {
      name: 'password_resets_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('password_resets');
  }
};
