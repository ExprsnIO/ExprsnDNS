/**
 * Exprsn DNS - Sequelize Model Registry
 */

const { Sequelize } = require('sequelize');
const config = require('../config');
const logger = require('../utils/logger');

const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    dialectOptions: config.database.dialectOptions,
    pool: config.database.pool,
    define: config.database.define,
    logging: config.database.logging ? (msg) => logger.debug(msg) : false
  }
);

const Zone = require('./Zone')(sequelize);
const Record = require('./Record')(sequelize);
const ZoneTransfer = require('./ZoneTransfer')(sequelize);
const DnsKey = require('./DnsKey')(sequelize);
const TsigKey = require('./TsigKey')(sequelize);
const QueryLog = require('./QueryLog')(sequelize);
const ApiKey = require('./ApiKey')(sequelize);

Zone.hasMany(Record, { foreignKey: 'zoneId', as: 'records', onDelete: 'CASCADE' });
Record.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

Zone.hasMany(ZoneTransfer, { foreignKey: 'zoneId', as: 'transfers', onDelete: 'CASCADE' });
ZoneTransfer.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

Zone.hasMany(DnsKey, { foreignKey: 'zoneId', as: 'keys', onDelete: 'CASCADE' });
DnsKey.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

module.exports = {
  sequelize,
  Sequelize,
  Zone,
  Record,
  ZoneTransfer,
  DnsKey,
  TsigKey,
  QueryLog,
  ApiKey
};
