'use strict';

/**
 * Migration: Create User Groups Junction Table
 * ═══════════════════════════════════════════════════════════════════════
 * Many-to-many relationship between users and groups
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_groups', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
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
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role: {
        type: Sequelize.ENUM('member', 'admin', 'owner'),
        defaultValue: 'member',
        allowNull: false
      },
      added_by: {
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
        type: Sequelize.ENUM('active', 'inactive', 'pending'),
        defaultValue: 'active',
        allowNull: false
      },
      joined_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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
    await queryInterface.addIndex('user_groups', ['user_id'], {
      name: 'user_groups_user_id_idx'
    });

    await queryInterface.addIndex('user_groups', ['group_id'], {
      name: 'user_groups_group_id_idx'
    });

    await queryInterface.addIndex('user_groups', ['role'], {
      name: 'user_groups_role_idx'
    });

    await queryInterface.addIndex('user_groups', ['status'], {
      name: 'user_groups_status_idx'
    });

    // Unique constraint
    await queryInterface.addIndex('user_groups', ['user_id', 'group_id'], {
      unique: true,
      name: 'user_groups_user_group_unique_idx'
    });

    // GIN index
    await queryInterface.sequelize.query(
      'CREATE INDEX user_groups_metadata_gin_idx ON user_groups USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_groups');
  }
};
