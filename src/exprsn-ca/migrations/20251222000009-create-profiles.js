'use strict';

/**
 * Migration: Create Profiles Table
 * ═══════════════════════════════════════════════════════════════════════
 * Extended user profile information
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('profiles', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      avatar_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      cover_image_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      timezone: {
        type: Sequelize.STRING(100),
        defaultValue: 'UTC',
        allowNull: true
      },
      locale: {
        type: Sequelize.STRING(10),
        defaultValue: 'en',
        allowNull: true
      },
      company: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      job_title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      website: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      location: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      social_links: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: true
      },
      preferences: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: true
      },
      privacy_settings: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: true
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
    await queryInterface.addIndex('profiles', ['user_id'], {
      unique: true,
      name: 'profiles_user_id_unique_idx'
    });

    await queryInterface.addIndex('profiles', ['display_name'], {
      name: 'profiles_display_name_idx'
    });

    await queryInterface.addIndex('profiles', ['company'], {
      name: 'profiles_company_idx'
    });

    // GIN indexes for JSONB
    await queryInterface.sequelize.query(
      'CREATE INDEX profiles_social_links_gin_idx ON profiles USING GIN (social_links);'
    );

    await queryInterface.sequelize.query(
      'CREATE INDEX profiles_preferences_gin_idx ON profiles USING GIN (preferences);'
    );

    await queryInterface.sequelize.query(
      'CREATE INDEX profiles_metadata_gin_idx ON profiles USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('profiles');
  }
};
