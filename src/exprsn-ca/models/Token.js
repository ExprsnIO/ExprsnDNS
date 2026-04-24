/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Model - Implementation of Exprsn CA Token Specification v1.0
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const Token = sequelize.define('Token', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    version: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: '1.0'
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
    certificateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'certificate_id',
      references: {
        model: 'certificates',
        key: 'id'
      }
    },
    // Permissions (binary flags matching spec)
    permissionRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'permission_read'
    },
    permissionWrite: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'permission_write'
    },
    permissionAppend: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'permission_append'
    },
    permissionDelete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'permission_delete'
    },
    permissionUpdate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'permission_update'
    },
    // Resource identification
    resourceType: {
      type: DataTypes.ENUM('url', 'did', 'cid'),
      allowNull: false,
      field: 'resource_type'
    },
    resourceValue: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      field: 'resource_value'
    },
    // Token lifecycle
    expiryType: {
      type: DataTypes.ENUM('time', 'use', 'persistent'),
      allowNull: false,
      defaultValue: 'time',
      field: 'expiry_type'
    },
    issuedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'issued_at',
      comment: 'Unix timestamp in milliseconds'
    },
    notBefore: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'not_before',
      comment: 'Unix timestamp in milliseconds'
    },
    expiresAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'expires_at',
      comment: 'Unix timestamp in milliseconds (null for persistent)'
    },
    usesRemaining: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'uses_remaining',
      comment: 'For use-based tokens'
    },
    maxUses: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_uses',
      comment: 'For use-based tokens'
    },
    useCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'use_count'
    },
    lastUsedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'last_used_at',
      comment: 'Unix timestamp in milliseconds'
    },
    // Token data and security
    tokenData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'token_data',
      comment: 'Custom data attached to token'
    },
    checksum: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: 'SHA-256 checksum of token fields'
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'RSA-SHA256-PSS signature (base64)'
    },
    status: {
      type: DataTypes.ENUM('active', 'revoked', 'expired', 'exhausted'),
      defaultValue: 'active',
      allowNull: false
    },
    revokedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'revoked_at',
      comment: 'Unix timestamp in milliseconds'
    },
    revokedReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'revoked_reason'
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
    tableName: 'tokens',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['certificate_id'] },
      { fields: ['status'] },
      { fields: ['expiry_type'] },
      { fields: ['expires_at'] },
      { fields: ['resource_type'] },
      { fields: ['resource_value'] },
      { fields: ['created_at'] }
    ]
  });

  // Instance methods
  Token.prototype.isExpired = function() {
    if (this.expiryType === 'persistent') {
      return false;
    }
    if (this.expiryType === 'time') {
      return Date.now() >= this.expiresAt;
    }
    if (this.expiryType === 'use') {
      return this.usesRemaining <= 0;
    }
    return false;
  };

  Token.prototype.isValid = function() {
    const now = Date.now();

    if (this.status !== 'active') {
      return false;
    }

    if (this.notBefore && now < this.notBefore) {
      return false;
    }

    return !this.isExpired();
  };

  Token.prototype.getPermissions = function() {
    return {
      read: this.permissionRead,
      write: this.permissionWrite,
      append: this.permissionAppend,
      delete: this.permissionDelete,
      update: this.permissionUpdate
    };
  };

  Token.prototype.toTokenObject = function() {
    return {
      id: this.id,
      version: this.version,
      issuer: {
        domain: '', // To be filled by service
        certificateSerial: '' // To be filled by service
      },
      permissions: this.getPermissions(),
      resource: {
        [this.resourceType]: this.resourceValue
      },
      data: this.tokenData,
      issuedAt: this.issuedAt,
      notBefore: this.notBefore,
      expiresAt: this.expiresAt,
      expiryType: this.expiryType,
      usesRemaining: this.usesRemaining,
      useCount: this.useCount,
      lastUsedAt: this.lastUsedAt,
      checksum: this.checksum,
      signature: this.signature
    };
  };

  return Token;
};
