/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create organizations table
 * Auth Service - Multi-tenant organizations
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('organizations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Organization type
      type: {
        type: Sequelize.ENUM('enterprise', 'team', 'personal'),
        defaultValue: 'team'
      },

      // Owner
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // Cannot delete user who owns organizations
      },

      // Contact info
      email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      website: {
        type: Sequelize.STRING,
        allowNull: true
      },

      // Branding
      logo_url: {
        type: Sequelize.STRING,
        allowNull: true
      },

      // Subscription/billing
      plan: {
        type: Sequelize.ENUM('free', 'starter', 'professional', 'enterprise'),
        defaultValue: 'free'
      },
      billing_email: {
        type: Sequelize.STRING,
        allowNull: true
      },

      // Settings
      settings: {
        type: Sequelize.JSONB,
        defaultValue: {
          allowUserRegistration: false,
          requireEmailVerification: true,
          requireMfa: false,
          sessionTimeout: 3600000,
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSymbols: false
          }
        }
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
    await queryInterface.addIndex('organizations', ['slug'], {
      name: 'organizations_slug_idx',
      unique: true
    });
    await queryInterface.addIndex('organizations', ['owner_id'], {
      name: 'organizations_owner_id_idx'
    });
    await queryInterface.addIndex('organizations', ['type'], {
      name: 'organizations_type_idx'
    });
    await queryInterface.addIndex('organizations', ['plan'], {
      name: 'organizations_plan_idx'
    });
    await queryInterface.addIndex('organizations', ['status'], {
      name: 'organizations_status_idx'
    });
    await queryInterface.addIndex('organizations', ['settings'], {
      name: 'organizations_settings_gin_idx',
      using: 'GIN'
    });
    await queryInterface.addIndex('organizations', ['metadata'], {
      name: 'organizations_metadata_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('organizations');
  }
};
