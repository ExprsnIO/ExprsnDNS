/**
 * ═══════════════════════════════════════════════════════════
 * OAuth2Token Model
 * OAuth2 access and refresh tokens
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const OAuth2Token = sequelize.define('OAuth2Token', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    accessToken: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true
    },

    accessTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },

    refreshToken: {
      type: DataTypes.STRING(512),
      allowNull: true,
      unique: true
    },

    refreshTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    scope: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'oauth2_clients',
        key: 'id'
      }
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Status
    revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'oauth2_tokens',
    timestamps: true,
    indexes: [
      { fields: ['accessToken'] },
      { fields: ['refreshToken'] },
      { fields: ['clientId'] },
      { fields: ['userId'] },
      { fields: ['revoked'] }
    ]
  });

  return OAuth2Token;
};
