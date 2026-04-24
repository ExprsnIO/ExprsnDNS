/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create sessions table
 * Auth Service - User session management
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sessions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      session_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
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
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true
      },
      user_agent: {
        type: Sequelize.STRING,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      last_activity_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      data: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('sessions', ['session_id'], {
      name: 'sessions_session_id_idx',
      unique: true
    });
    await queryInterface.addIndex('sessions', ['user_id'], {
      name: 'sessions_user_id_idx'
    });
    await queryInterface.addIndex('sessions', ['active'], {
      name: 'sessions_active_idx'
    });
    await queryInterface.addIndex('sessions', ['expires_at'], {
      name: 'sessions_expires_at_idx'
    });
    await queryInterface.addIndex('sessions', ['user_id', 'active'], {
      name: 'sessions_user_active_idx'
    });
    await queryInterface.addIndex('sessions', ['data'], {
      name: 'sessions_data_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('sessions');
  }
};
