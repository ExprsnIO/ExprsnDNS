/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create user_groups table
 * Auth Service - Many-to-many relationship between users and groups
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
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
        type: Sequelize.ENUM('member', 'moderator', 'admin'),
        defaultValue: 'member'
      },
      joined_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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

    await queryInterface.addIndex('user_groups', ['user_id', 'group_id'], {
      name: 'user_groups_user_group_idx',
      unique: true
    });
    await queryInterface.addIndex('user_groups', ['user_id'], {
      name: 'user_groups_user_id_idx'
    });
    await queryInterface.addIndex('user_groups', ['group_id'], {
      name: 'user_groups_group_id_idx'
    });
    await queryInterface.addIndex('user_groups', ['role'], {
      name: 'user_groups_role_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_groups');
  }
};
