/**
 * ═══════════════════════════════════════════════════════════
 * Migration: Create LDAP Configurations Table
 * Creates the ldap_configs table for LDAP/AD integration
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ldap_configs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
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
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      host: {
        type: Sequelize.STRING,
        allowNull: false
      },
      port: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 389
      },
      use_ssl: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      use_tls: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      bind_dn: {
        type: Sequelize.STRING,
        allowNull: false
      },
      bind_password: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      base_dn: {
        type: Sequelize.STRING,
        allowNull: false
      },
      user_search_base: {
        type: Sequelize.STRING,
        allowNull: false
      },
      user_search_filter: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '(&(objectClass=person)(uid={{username}}))'
      },
      user_object_class: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'person'
      },
      group_search_base: {
        type: Sequelize.STRING,
        allowNull: true
      },
      group_search_filter: {
        type: Sequelize.STRING,
        defaultValue: '(objectClass=groupOfNames)'
      },
      group_object_class: {
        type: Sequelize.STRING,
        defaultValue: 'groupOfNames'
      },
      attribute_mapping: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          username: 'uid',
          email: 'mail',
          firstName: 'givenName',
          lastName: 'sn',
          displayName: 'displayName',
          phone: 'telephoneNumber',
          title: 'title',
          department: 'department',
          memberOf: 'memberOf'
        }
      },
      group_mapping: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      sync_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      sync_interval: {
        type: Sequelize.INTEGER,
        defaultValue: 3600000
      },
      sync_users: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      sync_groups: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      auto_create_users: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      default_user_role: {
        type: Sequelize.STRING,
        defaultValue: 'user'
      },
      update_user_on_login: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      allow_weak_ciphers: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      verify_certificate: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      timeout: {
        type: Sequelize.INTEGER,
        defaultValue: 10000
      },
      pool_size: {
        type: Sequelize.INTEGER,
        defaultValue: 5
      },
      status: {
        type: Sequelize.ENUM('active', 'disabled', 'error', 'testing'),
        allowNull: false,
        defaultValue: 'active'
      },
      last_sync_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_sync_status: {
        type: Sequelize.STRING,
        allowNull: true
      },
      last_sync_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      stats: {
        type: Sequelize.JSONB,
        defaultValue: {
          totalUsers: 0,
          totalGroups: 0,
          lastSyncDuration: 0,
          usersSynced: 0,
          groupsSynced: 0,
          errors: 0
        }
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for performance
    await queryInterface.addIndex('ldap_configs', ['organization_id'], {
      name: 'ldap_configs_organization_id_idx'
    });

    await queryInterface.addIndex('ldap_configs', ['status'], {
      name: 'ldap_configs_status_idx'
    });

    await queryInterface.addIndex('ldap_configs', ['sync_enabled'], {
      name: 'ldap_configs_sync_enabled_idx'
    });

    await queryInterface.addIndex('ldap_configs', ['deleted_at'], {
      name: 'ldap_configs_deleted_at_idx'
    });

    // Add composite index for active configs by organization
    await queryInterface.addIndex('ldap_configs', ['organization_id', 'status'], {
      name: 'ldap_configs_org_status_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop indexes first
    await queryInterface.removeIndex('ldap_configs', 'ldap_configs_organization_id_idx');
    await queryInterface.removeIndex('ldap_configs', 'ldap_configs_status_idx');
    await queryInterface.removeIndex('ldap_configs', 'ldap_configs_sync_enabled_idx');
    await queryInterface.removeIndex('ldap_configs', 'ldap_configs_deleted_at_idx');
    await queryInterface.removeIndex('ldap_configs', 'ldap_configs_org_status_idx');

    // Drop table
    await queryInterface.dropTable('ldap_configs');
  }
};
