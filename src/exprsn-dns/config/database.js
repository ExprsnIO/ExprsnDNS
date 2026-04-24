/**
 * Exprsn DNS - Database Configuration (PostgreSQL via Sequelize)
 */

module.exports = {
  dialect: 'postgres',
  host: process.env.DNS_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DNS_DB_PORT || process.env.DB_PORT || '5432', 10),
  database: process.env.DNS_DB_NAME || 'exprsn_dns',
  username: process.env.DNS_DB_USER || process.env.DB_USER || 'exprsn',
  password: process.env.DNS_DB_PASSWORD || process.env.DB_PASSWORD || 'exprsn',

  logging: process.env.DNS_DB_LOGGING === 'true',

  pool: {
    max: parseInt(process.env.DNS_DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DNS_DB_POOL_MIN || '0', 10),
    acquire: parseInt(process.env.DNS_DB_POOL_ACQUIRE || '30000', 10),
    idle: parseInt(process.env.DNS_DB_POOL_IDLE || '10000', 10)
  },

  dialectOptions: {
    ssl: process.env.DNS_DB_SSL === 'true'
      ? { require: true, rejectUnauthorized: false }
      : false
  },

  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: false
  }
};
