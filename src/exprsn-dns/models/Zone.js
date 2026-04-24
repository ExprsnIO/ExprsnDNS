/**
 * Exprsn DNS - Zone Model
 *
 * Represents a DNS zone (e.g. "exprsn.io"). Stores SOA metadata and
 * zone-level flags. Authoritative records are stored separately in Record.
 */

const { DataTypes } = require('sequelize');
const dnsName = require('../utils/dnsName');

module.exports = (sequelize) => {
  const Zone = sequelize.define('Zone', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(253),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('name', dnsName.normalize(value));
      },
      validate: {
        isValidName(value) {
          if (!dnsName.isValid(value)) {
            throw new Error(`Invalid zone name: ${value}`);
          }
        }
      }
    },
    kind: {
      type: DataTypes.ENUM('primary', 'secondary', 'forward'),
      allowNull: false,
      defaultValue: 'primary'
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled', 'pending'),
      allowNull: false,
      defaultValue: 'active'
    },
    serial: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: () => Math.floor(Date.now() / 1000)
    },
    refresh: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3600 },
    retry: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1800 },
    expire: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 604800 },
    minimum: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 300 },
    defaultTtl: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3600 },

    primaryNs: { type: DataTypes.STRING(253), allowNull: false },
    adminEmail: { type: DataTypes.STRING(253), allowNull: false },

    masters: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    allowTransfer: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    allowUpdate: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },
    notify: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: []
    },

    dnssecEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ownerId: { type: DataTypes.UUID, allowNull: true },
    organizationId: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, {
    tableName: 'zones',
    indexes: [
      { unique: true, fields: ['name'] },
      { fields: ['status'] },
      { fields: ['organization_id'] }
    ]
  });

  Zone.prototype.bumpSerial = function bumpSerial() {
    const now = Math.floor(Date.now() / 1000);
    const next = BigInt(this.serial) + 1n;
    this.serial = Number(next) > now ? Number(next) : now;
    return this.serial;
  };

  return Zone;
};
