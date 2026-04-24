/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create roles table
 * Auth Service - RBAC roles with permissions
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('roles', {
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
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Organization this role belongs to (null for system roles)
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

      // Role type
      type: {
        type: Sequelize.ENUM('system', 'organization', 'custom'),
        defaultValue: 'custom'
      },

      // Built-in roles cannot be deleted
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      // Priority for conflict resolution (higher wins)
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },

      // Permissions array
      permissions: {
        type: Sequelize.JSONB,
        defaultValue: []
      },

      // Service access restrictions
      service_access: {
        type: Sequelize.JSONB,
        defaultValue: {
          allowedServices: [],
          deniedServices: []
        }
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
    await queryInterface.addIndex('roles', ['organization_id'], {
      name: 'roles_organization_id_idx'
    });
    await queryInterface.addIndex('roles', ['type'], {
      name: 'roles_type_idx'
    });
    await queryInterface.addIndex('roles', ['slug'], {
      name: 'roles_slug_idx'
    });
    await queryInterface.addIndex('roles', ['organization_id', 'slug'], {
      name: 'roles_org_slug_idx',
      unique: true
    });
    await queryInterface.addIndex('roles', ['priority'], {
      name: 'roles_priority_idx'
    });
    await queryInterface.addIndex('roles', ['permissions'], {
      name: 'roles_permissions_gin_idx',
      using: 'GIN'
    });
    await queryInterface.addIndex('roles', ['service_access'], {
      name: 'roles_service_access_gin_idx',
      using: 'GIN'
    });
    await queryInterface.addIndex('roles', ['metadata'], {
      name: 'roles_metadata_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('roles');
  }
};
