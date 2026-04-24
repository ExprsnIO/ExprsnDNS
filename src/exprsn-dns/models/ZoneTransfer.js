/**
 * Exprsn DNS - Zone Transfer Log Model
 *
 * Tracks AXFR/IXFR activity for secondary zones and outbound notifies.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ZoneTransfer = sequelize.define('ZoneTransfer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    zoneId: { type: DataTypes.UUID, allowNull: false },
    direction: {
      type: DataTypes.ENUM('inbound', 'outbound'),
      allowNull: false
    },
    kind: {
      type: DataTypes.ENUM('axfr', 'ixfr', 'notify'),
      allowNull: false
    },
    peer: { type: DataTypes.STRING, allowNull: false },
    serialBefore: { type: DataTypes.BIGINT, allowNull: true },
    serialAfter: { type: DataTypes.BIGINT, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'success', 'failed'),
      allowNull: false,
      defaultValue: 'pending'
    },
    message: { type: DataTypes.TEXT, allowNull: true },
    durationMs: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    tableName: 'zone_transfers',
    indexes: [
      { fields: ['zone_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ]
  });

  return ZoneTransfer;
};
