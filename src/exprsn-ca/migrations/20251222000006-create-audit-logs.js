'use strict';

/**
 * Migration: Create Audit Logs Table
 * ═══════════════════════════════════════════════════════════════════════
 * Comprehensive audit trail for all CA operations
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
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
      action: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      resource_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      resource_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('success', 'failure', 'error'),
        allowNull: false,
        defaultValue: 'success'
      },
      severity: {
        type: Sequelize.ENUM('info', 'warning', 'error', 'critical'),
        allowNull: false,
        defaultValue: 'info'
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      request_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      details: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: true
      },
      changes: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('audit_logs', ['user_id'], {
      name: 'audit_logs_user_id_idx'
    });

    await queryInterface.addIndex('audit_logs', ['action'], {
      name: 'audit_logs_action_idx'
    });

    await queryInterface.addIndex('audit_logs', ['resource_type'], {
      name: 'audit_logs_resource_type_idx'
    });

    await queryInterface.addIndex('audit_logs', ['resource_id'], {
      name: 'audit_logs_resource_id_idx'
    });

    await queryInterface.addIndex('audit_logs', ['status'], {
      name: 'audit_logs_status_idx'
    });

    await queryInterface.addIndex('audit_logs', ['severity'], {
      name: 'audit_logs_severity_idx'
    });

    await queryInterface.addIndex('audit_logs', ['request_id'], {
      name: 'audit_logs_request_id_idx'
    });

    await queryInterface.addIndex('audit_logs', ['created_at'], {
      name: 'audit_logs_created_at_idx'
    });

    await queryInterface.addIndex('audit_logs', ['ip_address'], {
      name: 'audit_logs_ip_address_idx'
    });

    // Composite indexes for common queries
    await queryInterface.addIndex('audit_logs', ['user_id', 'created_at'], {
      name: 'audit_logs_user_time_idx'
    });

    await queryInterface.addIndex('audit_logs', ['resource_type', 'resource_id'], {
      name: 'audit_logs_resource_idx'
    });

    // GIN indexes for JSONB
    await queryInterface.sequelize.query(
      'CREATE INDEX audit_logs_details_gin_idx ON audit_logs USING GIN (details);'
    );

    await queryInterface.sequelize.query(
      'CREATE INDEX audit_logs_changes_gin_idx ON audit_logs USING GIN (changes);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('audit_logs');
  }
};
