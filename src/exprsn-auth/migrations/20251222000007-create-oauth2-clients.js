/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create oauth2_clients table
 * Auth Service - OAuth2 client applications
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('oauth2_clients', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      client_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      client_secret: {
        type: Sequelize.STRING,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      redirect_uris: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      grants: {
        type: Sequelize.JSONB,
        defaultValue: ['authorization_code', 'refresh_token']
      },
      scopes: {
        type: Sequelize.JSONB,
        defaultValue: ['read', 'write']
      },
      type: {
        type: Sequelize.ENUM('confidential', 'public'),
        defaultValue: 'confidential'
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'revoked'),
        defaultValue: 'active'
      },
      metadata: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('oauth2_clients', ['client_id'], {
      name: 'oauth2_clients_client_id_idx',
      unique: true
    });
    await queryInterface.addIndex('oauth2_clients', ['owner_id'], {
      name: 'oauth2_clients_owner_id_idx'
    });
    await queryInterface.addIndex('oauth2_clients', ['status'], {
      name: 'oauth2_clients_status_idx'
    });
    await queryInterface.addIndex('oauth2_clients', ['type'], {
      name: 'oauth2_clients_type_idx'
    });
    await queryInterface.addIndex('oauth2_clients', ['redirect_uris'], {
      name: 'oauth2_clients_redirect_uris_gin_idx',
      using: 'GIN'
    });
    await queryInterface.addIndex('oauth2_clients', ['scopes'], {
      name: 'oauth2_clients_scopes_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('oauth2_clients');
  }
};
