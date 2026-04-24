/**
 * ═══════════════════════════════════════════════════════════
 * OAuth2AuthorizationCode Model
 * OAuth2 authorization codes for authorization code flow
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const OAuth2AuthorizationCode = sequelize.define('OAuth2AuthorizationCode', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },

    redirectUri: {
      type: DataTypes.STRING,
      allowNull: false
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

    // PKCE support
    codeChallenge: {
      type: DataTypes.STRING,
      allowNull: true
    },

    codeChallengeMethod: {
      type: DataTypes.ENUM('plain', 'S256'),
      allowNull: true
    },

    // Status
    used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    usedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'oauth2_authorization_codes',
    timestamps: true,
    indexes: [
      { fields: ['code'] },
      { fields: ['clientId'] },
      { fields: ['userId'] },
      { fields: ['used'] }
    ]
  });

  return OAuth2AuthorizationCode;
};
