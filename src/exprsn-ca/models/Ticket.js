/**
 * ═══════════════════════════════════════════════════════════════════════
 * Ticket Model - Single-use authentication tickets
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = (sequelize, DataTypes) => {
  const Ticket = sequelize.define('Ticket', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    ticketCode: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: 'ticket_code'
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
    type: {
      type: DataTypes.ENUM('login', 'passwordReset', 'emailVerification', 'apiAccess', 'download'),
      allowNull: false,
      defaultValue: 'login'
    },
    purpose: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Human-readable purpose description'
    },
    maxUses: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'max_uses'
    },
    usesRemaining: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'uses_remaining'
    },
    useCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'use_count'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'used_at'
    },
    lastUsedIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'last_used_ip'
    },
    status: {
      type: DataTypes.ENUM('active', 'used', 'expired', 'revoked'),
      defaultValue: 'active',
      allowNull: false
    },
    redirectUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'redirect_url',
      comment: 'URL to redirect to after ticket use'
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
    tableName: 'tickets',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['ticket_code'], unique: true },
      { fields: ['user_id'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['expires_at'] },
      { fields: ['created_at'] }
    ]
  });

  // Class methods
  Ticket.generateTicketCode = function() {
    return crypto.randomBytes(64).toString('base64url');
  };

  // Instance methods
  Ticket.prototype.isExpired = function() {
    return new Date() > this.expiresAt;
  };

  Ticket.prototype.isValid = function() {
    return (
      this.status === 'active' &&
      !this.isExpired() &&
      this.usesRemaining > 0
    );
  };

  Ticket.prototype.use = async function(ipAddress) {
    if (!this.isValid()) {
      throw new Error('Ticket is not valid');
    }

    this.usesRemaining -= 1;
    this.useCount += 1;
    this.usedAt = new Date();
    this.lastUsedIp = ipAddress;

    if (this.usesRemaining === 0) {
      this.status = 'used';
    }

    return this.save();
  };

  Ticket.prototype.revoke = async function() {
    this.status = 'revoked';
    return this.save();
  };

  return Ticket;
};
