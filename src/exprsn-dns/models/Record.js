/**
 * Exprsn DNS - Resource Record Model
 *
 * Stores individual RRs. `name` is always the zone-relative form ("@" for apex).
 * `data` is JSONB so record types with structure (MX, SRV, SOA, CAA…) can be
 * stored without losing fidelity. `rdata` is the canonical text form used for
 * zone file export and fast wire encoding.
 */

const { DataTypes } = require('sequelize');

const SUPPORTED_TYPES = [
  'A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SRV', 'SOA', 'PTR',
  'CAA', 'SSHFP', 'TLSA', 'DS', 'DNSKEY', 'RRSIG', 'NSEC', 'NSEC3',
  'NAPTR', 'SPF', 'URI', 'SVCB', 'HTTPS'
];

module.exports = (sequelize) => {
  const Record = sequelize.define('Record', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    zoneId: { type: DataTypes.UUID, allowNull: false },
    name: {
      type: DataTypes.STRING(253),
      allowNull: false,
      defaultValue: '@'
    },
    type: {
      type: DataTypes.ENUM(...SUPPORTED_TYPES),
      allowNull: false
    },
    class: {
      type: DataTypes.ENUM('IN', 'CH', 'HS'),
      allowNull: false,
      defaultValue: 'IN'
    },
    ttl: { type: DataTypes.INTEGER, allowNull: true },
    priority: { type: DataTypes.INTEGER, allowNull: true },
    weight: { type: DataTypes.INTEGER, allowNull: true },
    port: { type: DataTypes.INTEGER, allowNull: true },

    rdata: { type: DataTypes.TEXT, allowNull: false },
    data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

    disabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    comment: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
  }, {
    tableName: 'records',
    indexes: [
      { fields: ['zone_id'] },
      { fields: ['zone_id', 'name', 'type'] },
      { fields: ['type'] }
    ]
  });

  Record.SUPPORTED_TYPES = SUPPORTED_TYPES;

  return Record;
};
