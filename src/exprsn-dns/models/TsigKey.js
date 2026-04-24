/**
 * Exprsn DNS - TSIG Key Model
 *
 * Shared secret used to authenticate dynamic DNS updates and zone transfers.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TsigKey = sequelize.define('TsigKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(253),
      allowNull: false,
      unique: true
    },
    algorithm: {
      type: DataTypes.ENUM('hmac-md5', 'hmac-sha1', 'hmac-sha256', 'hmac-sha512'),
      allowNull: false,
      defaultValue: 'hmac-sha256'
    },
    secret: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'tsig_keys',
    indexes: [{ unique: true, fields: ['name'] }]
  });

  return TsigKey;
};
