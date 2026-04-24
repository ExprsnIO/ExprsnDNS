/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create groups table
 * Auth Service - User groups for permission management
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Organization this group belongs to (null for system groups)
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      // Group type
      type: {
        type: Sequelize.ENUM('system', 'organization', 'custom'),
        defaultValue: 'custom'
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
    await queryInterface.addIndex('groups', ['organization_id'], {
      name: 'groups_organization_id_idx'
    });
    await queryInterface.addIndex('groups', ['type'], {
      name: 'groups_type_idx'
    });
    await queryInterface.addIndex('groups', ['organization_id', 'name'], {
      name: 'groups_org_name_idx',
      unique: true
    });
    await queryInterface.addIndex('groups', ['metadata'], {
      name: 'groups_metadata_gin_idx',
      using: 'GIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('groups');
  }
};
