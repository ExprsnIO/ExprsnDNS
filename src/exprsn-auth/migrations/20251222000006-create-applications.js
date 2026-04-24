/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create applications table
 * Auth Service - OAuth2/OIDC applications
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('applications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
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
      redirect_uris: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      allowed_scopes: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      grant_types: {
        type: Sequelize.JSONB,
        defaultValue: []
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
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      is_trusted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'suspended'),
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

    await queryInterface.addIndex('applications', ['client_id'], {
      name: 'applications_client_id_idx',
      unique: true
    });
    await queryInterface.addIndex('applications', ['owner_id'], {
      name: 'applications_owner_id_idx'
    });
    await queryInterface.addIndex('applications', ['organization_id'], {
      name: 'applications_organization_id_idx'
    });
    await queryInterface.addIndex('applications', ['status'], {
      name: 'applications_status_idx'
    });
    await queryInterface.addIndex('applications', ['metadata'], {
      name: 'applications_metadata_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('applications');
  }
};
