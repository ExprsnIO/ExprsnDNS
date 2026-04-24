/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create permissions table
 * Auth Service - Fine-grained permissions for resources and actions
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('permissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },

      // Resource being protected
      resource: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Examples: user, group, application, organization, spark:message'
      },

      // Action allowed on resource
      action: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Examples: read, write, delete, manage, create, update'
      },

      // Scope (organization, application, service)
      scope: {
        type: Sequelize.ENUM('system', 'organization', 'application', 'service'),
        defaultValue: 'application'
      },

      // Permission string (resource:action)
      permission_string: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: 'Example: user:read, spark:message:write'
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Service this permission belongs to
      service: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Examples: auth, spark, timeline, filevault'
      },

      // Is this a system permission?
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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
    await queryInterface.addIndex('permissions', ['permission_string'], {
      name: 'permissions_permission_string_idx',
      unique: true
    });
    await queryInterface.addIndex('permissions', ['resource'], {
      name: 'permissions_resource_idx'
    });
    await queryInterface.addIndex('permissions', ['action'], {
      name: 'permissions_action_idx'
    });
    await queryInterface.addIndex('permissions', ['scope'], {
      name: 'permissions_scope_idx'
    });
    await queryInterface.addIndex('permissions', ['service'], {
      name: 'permissions_service_idx'
    });
    await queryInterface.addIndex('permissions', ['is_system'], {
      name: 'permissions_is_system_idx'
    });
    await queryInterface.addIndex('permissions', ['metadata'], {
      name: 'permissions_metadata_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('permissions');
  }
};
