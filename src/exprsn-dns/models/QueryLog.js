/**
 * Exprsn DNS - Query Log (sampled)
 *
 * Optional observability table. In production, forward to a TSDB or OTEL
 * collector instead of persisting every query here.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const QueryLog = sequelize.define('QueryLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    clientIp: { type: DataTypes.STRING, allowNull: true },
    protocol: {
      type: DataTypes.ENUM('udp', 'tcp', 'doh', 'dot'),
      allowNull: false,
      defaultValue: 'udp'
    },
    qname: { type: DataTypes.STRING(253), allowNull: false },
    qtype: { type: DataTypes.STRING(16), allowNull: false },
    qclass: { type: DataTypes.STRING(4), allowNull: false, defaultValue: 'IN' },
    rcode: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'NOERROR' },
    answers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    cached: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    durationUs: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    tableName: 'query_logs',
    indexes: [
      { fields: ['qname'] },
      { fields: ['created_at'] }
    ]
  });

  return QueryLog;
};
