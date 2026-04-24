/**
 * Authentication Service Models
 * Sequelize models for sessions, SSO providers, and login tracking
 */

const { DataTypes } = require('sequelize');

let Session, SSOProvider, LoginAttempt, MFAToken;

/**
 * Initialize all models
 * @param {Sequelize} sequelize - Sequelize instance
 */
async function init(sequelize) {
  // Session Model
  Session = sequelize.define('Session', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    token: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true
    },
    caTokenId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'ca_token_id',
      comment: 'Associated CA token for this session'
    },
    ipAddress: {
      type: DataTypes.INET,
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    deviceInfo: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'device_info',
      comment: 'Browser, OS, device type'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'last_activity_at'
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'revoked_at'
    },
    revokedReason: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'revoked_reason'
    }
  }, {
    tableName: 'sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['token'] },
      { fields: ['expires_at'] },
      { fields: ['revoked_at'] }
    ]
  });

  // SSO Provider Model
  SSOProvider = sequelize.define('SSOProvider', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    type: {
      type: DataTypes.ENUM('oauth2', 'saml', 'oidc'),
      allowNull: false
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Provider-specific configuration (client ID, secret, endpoints, etc.)'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    tableName: 'sso_providers',
    timestamps: true,
    underscored: true
  });

  // Login Attempt Model (for security monitoring)
  LoginAttempt = sequelize.define('LoginAttempt', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id'
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    failureReason: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'failure_reason'
    },
    ipAddress: {
      type: DataTypes.INET,
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    attemptedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'attempted_at'
    }
  }, {
    tableName: 'login_attempts',
    timestamps: false,
    indexes: [
      { fields: ['email'] },
      { fields: ['user_id'] },
      { fields: ['attempted_at'] },
      { fields: ['ip_address'] }
    ]
  });

  // MFA Token Model
  MFAToken = sequelize.define('MFAToken', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    method: {
      type: DataTypes.ENUM('totp', 'sms', 'email', 'hardware'),
      allowNull: false
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'TOTP secret or recovery codes'
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'phone_number',
      comment: 'For SMS MFA'
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'verified_at'
    },
    backupCodes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      field: 'backup_codes'
    }
  }, {
    tableName: 'mfa_tokens',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['user_id', 'method'], unique: true }
    ]
  });

  return { Session, SSOProvider, LoginAttempt, MFAToken };
}

module.exports = {
  init,
  getModels: () => ({ Session, SSOProvider, LoginAttempt, MFAToken })
};
