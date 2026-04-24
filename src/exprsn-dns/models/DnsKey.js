/**
 * Exprsn DNS - DNSSEC Key Material
 *
 * Private key material is stored only as a reference into the CA-managed
 * key store; this table holds the public metadata required to emit DNSKEY
 * and RRSIG records.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DnsKey = sequelize.define('DnsKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    zoneId: { type: DataTypes.UUID, allowNull: false },
    keyTag: { type: DataTypes.INTEGER, allowNull: false },
    flags: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 257
    },
    protocol: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    algorithm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
    role: {
      type: DataTypes.ENUM('ksk', 'zsk', 'csk'),
      allowNull: false,
      defaultValue: 'zsk'
    },
    publicKey: { type: DataTypes.TEXT, allowNull: false },
    privateKeyRef: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.ENUM('generated', 'published', 'active', 'retired', 'revoked'),
      allowNull: false,
      defaultValue: 'generated'
    },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    activatedAt: { type: DataTypes.DATE, allowNull: true },
    retiredAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'dns_keys',
    indexes: [
      { fields: ['zone_id'] },
      { fields: ['zone_id', 'status'] }
    ]
  });

  return DnsKey;
};
