/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create oauth2_tokens table
 * Auth Service - OAuth2 access and refresh tokens
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('oauth2_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      access_token: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      refresh_token: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      },
      token_type: {
        type: Sequelize.STRING,
        defaultValue: 'Bearer'
      },
      scope: {
        type: Sequelize.STRING,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      refresh_token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true
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
      client_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'oauth2_clients',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      revoked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addIndex('oauth2_tokens', ['access_token'], {
      name: 'oauth2_tokens_access_token_idx',
      unique: true
    });
    await queryInterface.addIndex('oauth2_tokens', ['refresh_token'], {
      name: 'oauth2_tokens_refresh_token_idx',
      unique: true
    });
    await queryInterface.addIndex('oauth2_tokens', ['user_id'], {
      name: 'oauth2_tokens_user_id_idx'
    });
    await queryInterface.addIndex('oauth2_tokens', ['client_id'], {
      name: 'oauth2_tokens_client_id_idx'
    });
    await queryInterface.addIndex('oauth2_tokens', ['expires_at'], {
      name: 'oauth2_tokens_expires_at_idx'
    });
    await queryInterface.addIndex('oauth2_tokens', ['revoked'], {
      name: 'oauth2_tokens_revoked_idx'
    });
    await queryInterface.addIndex('oauth2_tokens', ['user_id', 'client_id'], {
      name: 'oauth2_tokens_user_client_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('oauth2_tokens');
  }
};
