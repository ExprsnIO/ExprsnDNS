/**
 * ═══════════════════════════════════════════════════════════
 * Application Model
 * OAuth2/OIDC applications with granular permissions
 * Extends OAuth2Client with application-level permission management
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const crypto = require('crypto');

module.exports = (sequelize) => {
  const Application = sequelize.define('Application', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // OAuth2/OIDC client credentials
    clientId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    clientSecret: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // Application info
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Organization this app belongs to
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },

    // Creator/owner
    ownerId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Application type
    type: {
      type: DataTypes.ENUM('web', 'native', 'spa', 'service', 'm2m'),
      defaultValue: 'web'
    },

    // OAuth2 client type
    clientType: {
      type: DataTypes.ENUM('confidential', 'public'),
      defaultValue: 'confidential'
    },

    // Redirect URIs (whitelist)
    redirectUris: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Post-logout redirect URIs
    postLogoutRedirectUris: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Web origins (for CORS)
    webOrigins: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Allowed grant types
    grantTypes: {
      type: DataTypes.JSON,
      defaultValue: ['authorization_code', 'refresh_token']
      // Options: authorization_code, implicit, password, client_credentials, refresh_token
    },

    // Allowed response types (OpenID Connect)
    responseTypes: {
      type: DataTypes.JSON,
      defaultValue: ['code']
      // Options: code, token, id_token, code token, code id_token, token id_token, code token id_token
    },

    // OAuth scopes
    scopes: {
      type: DataTypes.JSON,
      defaultValue: ['openid', 'profile', 'email']
    },

    // Token lifetimes (seconds)
    accessTokenLifetime: {
      type: DataTypes.INTEGER,
      defaultValue: 3600 // 1 hour
    },

    refreshTokenLifetime: {
      type: DataTypes.INTEGER,
      defaultValue: 2592000 // 30 days
    },

    idTokenLifetime: {
      type: DataTypes.INTEGER,
      defaultValue: 3600 // 1 hour
    },

    // PKCE requirement
    requirePkce: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },

    // Consent requirement
    requireConsent: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },

    // Trusted application (skip consent)
    isTrusted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // First-party application (owned by org)
    isFirstParty: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // Application-level permissions
    // These define what this app can request access to
    allowedPermissions: {
      type: DataTypes.JSON,
      defaultValue: []
      // Array of permission strings: ['user:read', 'user:write', 'spark:message:write']
    },

    // Service access restrictions
    // Controls which Exprsn services this app can access
    serviceAccess: {
      type: DataTypes.JSON,
      defaultValue: {
        allowedServices: [], // Empty = all services allowed
        deniedServices: [],  // Explicit denials
        servicePermissions: {}
        // Example: { spark: ['message:read', 'message:write'], timeline: ['post:read'] }
      }
    },

    // User/Group restrictions
    // Controls who can use this application
    accessControl: {
      type: DataTypes.JSON,
      defaultValue: {
        allowAllUsers: true,
        allowedUserIds: [],
        allowedGroupIds: [],
        deniedUserIds: [],
        deniedGroupIds: []
      }
    },

    // Branding
    logoUri: {
      type: DataTypes.STRING,
      allowNull: true
    },

    homepageUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    privacyPolicyUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    termsOfServiceUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // Rate limiting
    rateLimit: {
      type: DataTypes.JSON,
      defaultValue: {
        enabled: true,
        requestsPerMinute: 60,
        requestsPerHour: 3600
      }
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'revoked'),
      defaultValue: 'active'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'applications',
    timestamps: true,
    paranoid: true, // Soft delete
    indexes: [
      { fields: ['clientId'], unique: true },
      { fields: ['organizationId'] },
      { fields: ['ownerId'] },
      { fields: ['status'] }
    ]
  });

  /**
   * Generate client credentials before creating
   */
  Application.beforeCreate(async (app) => {
    if (!app.clientId) {
      app.clientId = 'app_' + crypto.randomBytes(16).toString('hex');
    }
    if (!app.clientSecret) {
      app.clientSecret = crypto.randomBytes(32).toString('hex');
    }
  });

  Application.associate = function(models) {
    // Organization relationship
    Application.belongsTo(models.Organization, {
      as: 'organization',
      foreignKey: 'organizationId'
    });

    // Owner relationship
    Application.belongsTo(models.User, {
      as: 'owner',
      foreignKey: 'ownerId'
    });

    // Tokens
    Application.hasMany(models.OAuth2Token, {
      as: 'tokens',
      foreignKey: 'clientId'
    });

    // Authorization codes
    Application.hasMany(models.OAuth2AuthorizationCode, {
      as: 'authorizationCodes',
      foreignKey: 'clientId'
    });
  };

  /**
   * Check if user can access this application
   */
  Application.prototype.canUserAccess = function(userId, userGroupIds = []) {
    const ac = this.accessControl;

    // Check explicit denial first
    if (ac.deniedUserIds && ac.deniedUserIds.includes(userId)) {
      return false;
    }

    // Check group denials
    if (ac.deniedGroupIds && ac.deniedGroupIds.length > 0) {
      const hasDeniedGroup = userGroupIds.some(gid => ac.deniedGroupIds.includes(gid));
      if (hasDeniedGroup) {
        return false;
      }
    }

    // If allow all users, grant access
    if (ac.allowAllUsers) {
      return true;
    }

    // Check explicit allow
    if (ac.allowedUserIds && ac.allowedUserIds.includes(userId)) {
      return true;
    }

    // Check group allows
    if (ac.allowedGroupIds && ac.allowedGroupIds.length > 0) {
      const hasAllowedGroup = userGroupIds.some(gid => ac.allowedGroupIds.includes(gid));
      if (hasAllowedGroup) {
        return true;
      }
    }

    return false;
  };

  /**
   * Check if application can access a service
   */
  Application.prototype.canAccessService = function(serviceName) {
    const sa = this.serviceAccess;

    // Check explicit denial
    if (sa.deniedServices && sa.deniedServices.includes(serviceName)) {
      return false;
    }

    // If allowedServices is empty, all services allowed (unless denied)
    if (!sa.allowedServices || sa.allowedServices.length === 0) {
      return true;
    }

    // Check if service is in allowed list
    return sa.allowedServices.includes(serviceName);
  };

  /**
   * Get allowed permissions for a specific service
   */
  Application.prototype.getServicePermissions = function(serviceName) {
    if (!this.canAccessService(serviceName)) {
      return [];
    }

    const sa = this.serviceAccess;
    return sa.servicePermissions?.[serviceName] || [];
  };

  return Application;
};
