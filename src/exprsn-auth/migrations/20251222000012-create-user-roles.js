/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create user_roles table
 * Auth Service - Many-to-many relationship between users and roles
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_roles', {
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
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Organization context for this role assignment'
      },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'User who assigned this role'
      },
      assigned_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Optional expiration for temporary role assignments'
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

    await queryInterface.addIndex('user_roles', ['user_id', 'role_id'], {
      name: 'user_roles_user_role_idx',
      unique: true
    });
    await queryInterface.addIndex('user_roles', ['user_id'], {
      name: 'user_roles_user_id_idx'
    });
    await queryInterface.addIndex('user_roles', ['role_id'], {
      name: 'user_roles_role_id_idx'
    });
    await queryInterface.addIndex('user_roles', ['organization_id'], {
      name: 'user_roles_organization_id_idx'
    });
    await queryInterface.addIndex('user_roles', ['assigned_by'], {
      name: 'user_roles_assigned_by_idx'
    });
    await queryInterface.addIndex('user_roles', ['expires_at'], {
      name: 'user_roles_expires_at_idx'
    });
    await queryInterface.addIndex('user_roles', ['user_id', 'organization_id'], {
      name: 'user_roles_user_org_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_roles');
  }
};
