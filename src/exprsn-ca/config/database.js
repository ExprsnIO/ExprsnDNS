/**
 * ═══════════════════════════════════════════════════════════════════════
 * Database Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

const appConfig = require('./app');

/**
 * PostgreSQL database configuration
 * Used by Sequelize ORM for database operations
 */
module.exports = {
  /**
   * Database host
   * @type {string}
   */
  host: process.env.DB_HOST || 'localhost',

  /**
   * Database port
   * @type {number}
   */
  port: parseInt(process.env.DB_PORT, 10) || 5432,

  /**
   * Database name
   * @type {string}
   */
  database: process.env.DB_NAME || 'exprsn_ca',

  /**
   * Database username
   * @type {string}
   */
  username: process.env.DB_USER || 'exprsn_ca_user',

  /**
   * Database password
   * @type {string}
   */
  password: process.env.DB_PASSWORD || '',

  /**
   * Database dialect
   * @type {string}
   */
  dialect: 'postgres',

  /**
   * Enable SSL/TLS for database connections
   * @type {boolean}
   */
  ssl: process.env.DB_SSL === 'true',

  /**
   * Connection pool settings
   */
  pool: {
    /**
     * Minimum number of connections in pool
     * @type {number}
     */
    min: parseInt(process.env.DB_POOL_MIN, 10) || 2,

    /**
     * Maximum number of connections in pool
     * @type {number}
     */
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,

    /**
     * Maximum time (ms) to try getting a connection before throwing error
     * @type {number}
     */
    acquire: 30000,

    /**
     * Maximum time (ms) a connection can be idle before being released
     * @type {number}
     */
    idle: 10000
  },

  /**
   * Enable SQL query logging
   * @type {boolean|Function}
   */
  logging: appConfig.env === 'development' ? console.log : false
};
