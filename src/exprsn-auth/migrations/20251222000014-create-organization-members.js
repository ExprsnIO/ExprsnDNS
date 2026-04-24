/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create organization_members table
 * Auth Service - Many-to-many relationship between organizations and users
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('organization_members', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
      role: {
        type: Sequelize.ENUM('owner', 'admin', 'member', 'guest'),
        defaultValue: 'member'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'pending'),
        defaultValue: 'active'
      },
      invited_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      invited_at: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addIndex('organization_members', ['organization_id', 'user_id'], {
      name: 'organization_members_org_user_idx',
      unique: true
    });
    await queryInterface.addIndex('organization_members', ['organization_id'], {
      name: 'organization_members_organization_id_idx'
    });
    await queryInterface.addIndex('organization_members', ['user_id'], {
      name: 'organization_members_user_id_idx'
    });
    await queryInterface.addIndex('organization_members', ['role'], {
      name: 'organization_members_role_idx'
    });
    await queryInterface.addIndex('organization_members', ['status'], {
      name: 'organization_members_status_idx'
    });
    await queryInterface.addIndex('organization_members', ['invited_by'], {
      name: 'organization_members_invited_by_idx'
    });
    await queryInterface.addIndex('organization_members', ['organization_id', 'status'], {
      name: 'organization_members_org_status_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('organization_members');
  }
};
