'use strict';

/**
 * Migration: Create Groups Table
 * ═══════════════════════════════════════════════════════════════════════
 * Distribution lists and organizational units
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('groups', {
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
      type: {
        type: Sequelize.ENUM('distribution_list', 'organizational_unit', 'team', 'department'),
        defaultValue: 'organizational_unit',
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'archived'),
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
    await queryInterface.addIndex('groups', ['name'], {
      unique: true,
      name: 'groups_name_unique_idx'
    });

    await queryInterface.addIndex('groups', ['slug'], {
      unique: true,
      name: 'groups_slug_unique_idx'
    });

    await queryInterface.addIndex('groups', ['type'], {
      name: 'groups_type_idx'
    });

    await queryInterface.addIndex('groups', ['parent_id'], {
      name: 'groups_parent_id_idx'
    });

    await queryInterface.addIndex('groups', ['status'], {
      name: 'groups_status_idx'
    });

    // GIN index for metadata
    await queryInterface.sequelize.query(
      'CREATE INDEX groups_metadata_gin_idx ON groups USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('groups');
  }
};
