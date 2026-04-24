/**
 * ═══════════════════════════════════════════════════════════════════════
 * PasswordReset Model - Password reset token management
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = (sequelize, DataTypes) => {
  const PasswordReset = sequelize.define('PasswordReset', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'token_hash',
      comment: 'SHA-256 hash of the reset token'
    },
    expiresAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'expires_at',
      comment: 'Unix timestamp in milliseconds'
    },
    used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    usedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'used_at',
      comment: 'Unix timestamp in milliseconds when token was used'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
      comment: 'IP address of the requester'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    initiatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'initiated_by',
      comment: 'User ID of admin/moderator who initiated reset (null for self-service)'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'password_resets',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'], name: 'idx_password_resets_user' },
      { fields: ['token_hash'], unique: true, name: 'idx_password_resets_token' },
      { fields: ['expires_at'], name: 'idx_password_resets_expires' },
      { fields: ['used'], name: 'idx_password_resets_used' }
    ]
  });

  // Instance methods
  PasswordReset.prototype.isExpired = function() {
    return Date.now() > this.expiresAt;
  };

  PasswordReset.prototype.isValid = function() {
    return !this.used && !this.isExpired();
  };

  // Static methods
  PasswordReset.generateToken = function() {
    return crypto.randomBytes(32).toString('hex');
  };

  PasswordReset.hashToken = function(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  };

  return PasswordReset;
};
