/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create users table
 * Auth Service - User authentication and profiles
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },

      // Authentication
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Null for OAuth-only accounts'
      },
      email_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      email_verification_token: {
        type: Sequelize.STRING,
        allowNull: true
      },

      // OAuth provider IDs
      google_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true
      },
      github_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true
      },

      // Profile
      display_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      avatar_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // MFA
      mfa_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      mfa_secret: {
        type: Sequelize.STRING,
        allowNull: true
      },
      mfa_backup_codes: {
        type: Sequelize.JSONB,
        allowNull: true
      },

      // Security
      login_attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      locked_until: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      last_login_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      password_changed_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      reset_password_token: {
        type: Sequelize.STRING,
        allowNull: true
      },
      reset_password_expires: {
        type: Sequelize.BIGINT,
        allowNull: true
      },

      // Status
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'suspended'),
        defaultValue: 'active'
      },

      // Metadata
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },

      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Indexes
    await queryInterface.addIndex('users', ['email'], {
      name: 'users_email_idx'
    });
    await queryInterface.addIndex('users', ['google_id'], {
      name: 'users_google_id_idx'
    });
    await queryInterface.addIndex('users', ['github_id'], {
      name: 'users_github_id_idx'
    });
    await queryInterface.addIndex('users', ['status'], {
      name: 'users_status_idx'
    });
    await queryInterface.addIndex('users', ['email_verified'], {
      name: 'users_email_verified_idx'
    });
    await queryInterface.addIndex('users', ['mfa_enabled'], {
      name: 'users_mfa_enabled_idx'
    });
    await queryInterface.addIndex('users', ['metadata'], {
      name: 'users_metadata_gin_idx',
      using: 'GIN'
    });
    await queryInterface.addIndex('users', ['mfa_backup_codes'], {
      name: 'users_mfa_backup_codes_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('users');
  }
};
