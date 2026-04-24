'use strict';

/**
 * Migration: Create Roles Table
 * ═══════════════════════════════════════════════════════════════════════
 * Permission scope based roles
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('roles', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      permission_flags: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      resource_type: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      resource_pattern: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'deprecated'),
        defaultValue: 'active',
        allowNull: false
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
    await queryInterface.addIndex('roles', ['name'], {
      unique: true,
      name: 'roles_name_unique_idx'
    });

    await queryInterface.addIndex('roles', ['slug'], {
      unique: true,
      name: 'roles_slug_unique_idx'
    });

    await queryInterface.addIndex('roles', ['resource_type'], {
      name: 'roles_resource_type_idx'
    });

    await queryInterface.addIndex('roles', ['is_system'], {
      name: 'roles_is_system_idx'
    });

    await queryInterface.addIndex('roles', ['priority'], {
      name: 'roles_priority_idx'
    });

    await queryInterface.addIndex('roles', ['status'], {
      name: 'roles_status_idx'
    });

    // GIN index for metadata
    await queryInterface.sequelize.query(
      'CREATE INDEX roles_metadata_gin_idx ON roles USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('roles');
  }
};
