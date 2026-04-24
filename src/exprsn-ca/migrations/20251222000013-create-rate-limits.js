'use strict';

/**
 * Migration: Create Rate Limits Table
 * ═══════════════════════════════════════════════════════════════════════
 * Rate limiting tracking for API endpoints
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('rate_limits', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      identifier: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      endpoint: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      method: {
        type: Sequelize.STRING(10),
        allowNull: false
      },
      count: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      },
      window_start: {
        type: Sequelize.DATE,
        allowNull: false
      },
      window_end: {
        type: Sequelize.DATE,
        allowNull: false
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
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
      blocked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      blocked_until: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
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
    await queryInterface.addIndex('rate_limits', ['identifier'], {
      name: 'rate_limits_identifier_idx'
    });

    await queryInterface.addIndex('rate_limits', ['endpoint'], {
      name: 'rate_limits_endpoint_idx'
    });

    await queryInterface.addIndex('rate_limits', ['user_id'], {
      name: 'rate_limits_user_id_idx'
    });

    await queryInterface.addIndex('rate_limits', ['ip_address'], {
      name: 'rate_limits_ip_address_idx'
    });

    await queryInterface.addIndex('rate_limits', ['window_start'], {
      name: 'rate_limits_window_start_idx'
    });

    await queryInterface.addIndex('rate_limits', ['window_end'], {
      name: 'rate_limits_window_end_idx'
    });

    await queryInterface.addIndex('rate_limits', ['blocked'], {
      name: 'rate_limits_blocked_idx'
    });

    // Composite unique index for rate limit windows
    await queryInterface.addIndex('rate_limits', ['identifier', 'endpoint', 'method', 'window_start'], {
      unique: true,
      name: 'rate_limits_window_unique_idx'
    });

    // GIN index
    await queryInterface.sequelize.query(
      'CREATE INDEX rate_limits_metadata_gin_idx ON rate_limits USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('rate_limits');
  }
};
