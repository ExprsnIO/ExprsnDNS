/**
 * ═══════════════════════════════════════════════════════════
 * LDAP Configuration Model
 * Stores LDAP/Active Directory connection settings per organization
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LdapConfig = sequelize.define('LdapConfig', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Organization this LDAP config belongs to
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Friendly name for this LDAP configuration'
    },

    // LDAP server settings
    host: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'LDAP server hostname or IP'
    },

    port: {
      type: DataTypes.INTEGER,
      defaultValue: 389,
      comment: 'LDAP port (389 for LDAP, 636 for LDAPS)'
    },

    useSSL: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Use LDAPS (LDAP over SSL)'
    },

    useTLS: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Use STARTTLS for encryption'
    },

    // Bind credentials (service account)
    bindDN: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Distinguished Name for binding (e.g., cn=admin,dc=example,dc=com)'
    },

    bindPassword: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Password for bind DN (encrypted at rest)'
    },

    // Search settings
    baseDN: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Base DN for all searches (e.g., dc=example,dc=com)'
    },

    userSearchBase: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Base DN for user searches (e.g., ou=users,dc=example,dc=com)'
    },

    userSearchFilter: {
      type: DataTypes.STRING,
      defaultValue: '(&(objectClass=person)(uid={{username}}))',
      comment: 'LDAP filter for user search. {{username}} is replaced with actual username'
    },

    userObjectClass: {
      type: DataTypes.STRING,
      defaultValue: 'person',
      comment: 'Object class for user entries'
    },

    groupSearchBase: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Base DN for group searches (e.g., ou=groups,dc=example,dc=com)'
    },

    groupSearchFilter: {
      type: DataTypes.STRING,
      defaultValue: '(objectClass=groupOfNames)',
      comment: 'LDAP filter for group search'
    },

    groupObjectClass: {
      type: DataTypes.STRING,
      defaultValue: 'groupOfNames',
      comment: 'Object class for group entries'
    },

    // Attribute mapping (LDAP attributes -> Exprsn user fields)
    attributeMapping: {
      type: DataTypes.JSON,
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
      },
      comment: 'Maps LDAP attributes to Exprsn user fields'
    },

    // Group mapping (LDAP groups -> Exprsn groups/roles)
    groupMapping: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Maps LDAP group DNs to Exprsn group IDs or role names'
    },

    // Sync settings
    syncEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Enable automatic user/group synchronization'
    },

    syncInterval: {
      type: DataTypes.INTEGER,
      defaultValue: 3600000, // 1 hour in milliseconds
      comment: 'Sync interval in milliseconds'
    },

    syncUsers: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Sync users from LDAP'
    },

    syncGroups: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Sync groups from LDAP'
    },

    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp of last successful sync'
    },

    lastSyncStatus: {
      type: DataTypes.ENUM('success', 'partial', 'failed', 'never'),
      defaultValue: 'never',
      comment: 'Status of last sync attempt'
    },

    lastSyncError: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message from last sync (if failed)'
    },

    // User provisioning settings
    autoCreateUsers: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Automatically create users on first login'
    },

    defaultUserRole: {
      type: DataTypes.STRING,
      defaultValue: 'user',
      comment: 'Default role for auto-created users'
    },

    updateUserOnLogin: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Update user attributes from LDAP on each login'
    },

    // Security settings
    allowWeakCiphers: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Allow weak SSL/TLS ciphers (not recommended)'
    },

    verifyCertificate: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Verify SSL certificate (disable for self-signed certs)'
    },

    timeout: {
      type: DataTypes.INTEGER,
      defaultValue: 10000,
      comment: 'Connection timeout in milliseconds'
    },

    // Connection pool settings
    poolSize: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      comment: 'Maximum number of LDAP connections to maintain'
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'disabled', 'error', 'testing'),
      defaultValue: 'active',
      comment: 'Current status of this LDAP configuration'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Additional metadata and custom fields'
    },

    // Statistics
    stats: {
      type: DataTypes.JSON,
      defaultValue: {
        totalLogins: 0,
        successfulLogins: 0,
        failedLogins: 0,
        lastLoginAt: null,
        usersSynced: 0,
        groupsSynced: 0
      },
      comment: 'Usage statistics'
    }
  }, {
    tableName: 'ldap_configs',
    timestamps: true,
    paranoid: true, // Soft delete
    indexes: [
      { fields: ['organizationId'] },
      { fields: ['status'] },
      { fields: ['syncEnabled'] },
      { fields: ['lastSyncAt'] }
    ]
  });

  LdapConfig.associate = function(models) {
    // Organization relationship
    LdapConfig.belongsTo(models.Organization, {
      as: 'organization',
      foreignKey: 'organizationId'
    });
  };

  return LdapConfig;
};
