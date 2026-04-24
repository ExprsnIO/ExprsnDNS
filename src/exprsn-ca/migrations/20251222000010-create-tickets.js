'use strict';

/**
 * Migration: Create Tickets Table
 * ═══════════════════════════════════════════════════════════════════════
 * Single-use authentication tickets for passwordless login, etc.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tickets', {
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
      code: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      type: {
        type: Sequelize.ENUM('login', 'password_reset', 'email_verification', 'mfa', 'api_access'),
        defaultValue: 'login',
        allowNull: false
      },
      max_uses: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      },
      uses_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
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
        type: Sequelize.ENUM('active', 'used', 'expired', 'revoked'),
        defaultValue: 'active',
        allowNull: false
      },
      last_used_at: {
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
    await queryInterface.addIndex('tickets', ['code'], {
      unique: true,
      name: 'tickets_code_unique_idx'
    });

    await queryInterface.addIndex('tickets', ['user_id'], {
      name: 'tickets_user_id_idx'
    });

    await queryInterface.addIndex('tickets', ['type'], {
      name: 'tickets_type_idx'
    });

    await queryInterface.addIndex('tickets', ['status'], {
      name: 'tickets_status_idx'
    });

    await queryInterface.addIndex('tickets', ['expires_at'], {
      name: 'tickets_expires_at_idx'
    });

    // Composite index for active tickets
    await queryInterface.addIndex('tickets', ['status', 'expires_at'], {
      name: 'tickets_active_validity_idx'
    });

    // GIN index
    await queryInterface.sequelize.query(
      'CREATE INDEX tickets_metadata_gin_idx ON tickets USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tickets');
  }
};
