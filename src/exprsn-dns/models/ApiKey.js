/**
 * Exprsn DNS - API Key Model
 *
 * Issued API keys for management-plane access when not using a JWT from
 * exprsn-auth. The key itself is stored hashed.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApiKey = sequelize.define('ApiKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false },
    keyHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    keyPrefix: { type: DataTypes.STRING(12), allowNull: false },
    scopes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: ['zones:read']
    },
    ownerId: { type: DataTypes.UUID, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'api_keys',
    indexes: [
      { unique: true, fields: ['key_hash'] },
      { fields: ['key_prefix'] }
    ]
  });

  return ApiKey;
};
