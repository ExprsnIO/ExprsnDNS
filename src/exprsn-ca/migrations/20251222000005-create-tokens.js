'use strict';

/**
 * Migration: Create Tokens Table
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn CA Tokens - Implementation of Token Specification v1.0
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tokens', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      version: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: '1.0'
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
      certificate_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'certificates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Permissions
      permission_read: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      permission_write: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      permission_append: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      permission_delete: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      permission_update: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      // Resource
      resource_type: {
        type: Sequelize.ENUM('url', 'did', 'cid'),
        allowNull: false
      },
      resource_value: {
        type: Sequelize.STRING(1000),
        allowNull: false
      },
      // Lifecycle
      expiry_type: {
        type: Sequelize.ENUM('time', 'use', 'persistent'),
        allowNull: false,
        defaultValue: 'time'
      },
      issued_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      not_before: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      uses_remaining: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      max_uses: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      use_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      last_used_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      // Security
      token_data: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      checksum: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      signature: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'revoked', 'expired', 'exhausted'),
        defaultValue: 'active',
        allowNull: false
      },
      revoked_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      revoked_reason: {
        type: Sequelize.STRING(255),
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
    await queryInterface.addIndex('tokens', ['user_id'], {
      name: 'tokens_user_id_idx'
    });

    await queryInterface.addIndex('tokens', ['certificate_id'], {
      name: 'tokens_certificate_id_idx'
    });

    await queryInterface.addIndex('tokens', ['status'], {
      name: 'tokens_status_idx'
    });

    await queryInterface.addIndex('tokens', ['expiry_type'], {
      name: 'tokens_expiry_type_idx'
    });

    await queryInterface.addIndex('tokens', ['expires_at'], {
      name: 'tokens_expires_at_idx'
    });

    await queryInterface.addIndex('tokens', ['resource_type'], {
      name: 'tokens_resource_type_idx'
    });

    await queryInterface.addIndex('tokens', ['resource_value'], {
      name: 'tokens_resource_value_idx'
    });

    await queryInterface.addIndex('tokens', ['created_at'], {
      name: 'tokens_created_at_idx'
    });

    await queryInterface.addIndex('tokens', ['checksum'], {
      name: 'tokens_checksum_idx'
    });

    // Composite index for active, non-expired tokens
    await queryInterface.addIndex('tokens', ['status', 'expiry_type', 'expires_at'], {
      name: 'tokens_active_validity_idx'
    });

    // GIN indexes for JSONB
    await queryInterface.sequelize.query(
      'CREATE INDEX tokens_token_data_gin_idx ON tokens USING GIN (token_data);'
    );

    await queryInterface.sequelize.query(
      'CREATE INDEX tokens_metadata_gin_idx ON tokens USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tokens');
  }
};
