/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create oauth2_authorization_codes table
 * Auth Service - OAuth2 authorization codes (RFC 6749)
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('oauth2_authorization_codes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      redirect_uri: {
        type: Sequelize.STRING,
        allowNull: false
      },
      scope: {
        type: Sequelize.STRING,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
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
      used: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      used_at: {
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

    await queryInterface.addIndex('oauth2_authorization_codes', ['code'], {
      name: 'oauth2_authorization_codes_code_idx',
      unique: true
    });
    await queryInterface.addIndex('oauth2_authorization_codes', ['user_id'], {
      name: 'oauth2_authorization_codes_user_id_idx'
    });
    await queryInterface.addIndex('oauth2_authorization_codes', ['client_id'], {
      name: 'oauth2_authorization_codes_client_id_idx'
    });
    await queryInterface.addIndex('oauth2_authorization_codes', ['expires_at'], {
      name: 'oauth2_authorization_codes_expires_at_idx'
    });
    await queryInterface.addIndex('oauth2_authorization_codes', ['used'], {
      name: 'oauth2_authorization_codes_used_idx'
    });
    await queryInterface.addIndex('oauth2_authorization_codes', ['user_id', 'client_id'], {
      name: 'oauth2_authorization_codes_user_client_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('oauth2_authorization_codes');
  }
};
