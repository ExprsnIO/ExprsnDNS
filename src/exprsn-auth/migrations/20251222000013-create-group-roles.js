/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create group_roles table
 * Auth Service - Many-to-many relationship between groups and roles
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_roles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
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
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      assigned_at: {
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

    await queryInterface.addIndex('group_roles', ['group_id', 'role_id'], {
      name: 'group_roles_group_role_idx',
      unique: true
    });
    await queryInterface.addIndex('group_roles', ['group_id'], {
      name: 'group_roles_group_id_idx'
    });
    await queryInterface.addIndex('group_roles', ['role_id'], {
      name: 'group_roles_role_id_idx'
    });
    await queryInterface.addIndex('group_roles', ['assigned_by'], {
      name: 'group_roles_assigned_by_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_roles');
  }
};
