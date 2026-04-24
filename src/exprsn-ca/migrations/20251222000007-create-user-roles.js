'use strict';

/**
 * Migration: Create User Roles Junction Table
 * ═══════════════════════════════════════════════════════════════════════
 * Many-to-many relationship between users and roles
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('user_roles', {
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
      granted_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      granted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'expired', 'revoked'),
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
    await queryInterface.addIndex('user_roles', ['user_id'], {
      name: 'user_roles_user_id_idx'
    });

    await queryInterface.addIndex('user_roles', ['role_id'], {
      name: 'user_roles_role_id_idx'
    });

    await queryInterface.addIndex('user_roles', ['status'], {
      name: 'user_roles_status_idx'
    });

    await queryInterface.addIndex('user_roles', ['granted_by'], {
      name: 'user_roles_granted_by_idx'
    });

    await queryInterface.addIndex('user_roles', ['expires_at'], {
      name: 'user_roles_expires_at_idx'
    });

    // Unique constraint: user can't have same role twice
    await queryInterface.addIndex('user_roles', ['user_id', 'role_id'], {
      unique: true,
      name: 'user_roles_user_role_unique_idx'
    });

    // Composite index for active roles
    await queryInterface.addIndex('user_roles', ['user_id', 'status'], {
      name: 'user_roles_user_active_idx'
    });

    // GIN index for metadata
    await queryInterface.sequelize.query(
      'CREATE INDEX user_roles_metadata_gin_idx ON user_roles USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_roles');
  }
};
