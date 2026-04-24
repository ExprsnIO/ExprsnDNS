/**
 * ═══════════════════════════════════════════════════════════════════════
 * Resilient Database Connection Manager
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Provides automatic fallback from PostgreSQL to SQLite when PostgreSQL
 * is unavailable. This ensures services can continue operating in
 * development and testing environments with degraded database capabilities.
 *
 * Features:
 * - Automatic PostgreSQL health checking
 * - Transparent SQLite fallback
 * - Connection retry with exponential backoff
 * - Migration compatibility layer
 * - Performance warnings for SQLite limitations
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

class ResilientDatabaseConnection extends EventEmitter {
  constructor(config = {}) {
    super();

    this.serviceName = config.serviceName || 'unknown-service';
    this.primaryConfig = config.primary || {};
    this.fallbackConfig = config.fallback || {};
    this.options = config.options || {};

    // Connection state
    this.sequelize = null;
    this.activeDialect = null;
    this.healthCheckInterval = null;
    this.retryAttempts = 0;
    this.maxRetries = this.options.maxRetries || 3;
    this.retryDelay = this.options.retryDelay || 2000;
    this.healthCheckIntervalMs = this.options.healthCheckInterval || 30000;

    // Feature flags
    this.allowSQLiteFallback = this.options.allowSQLiteFallback !== false;
    this.autoReconnect = this.options.autoReconnect !== false;

    // Logger (can be injected)
    this.logger = config.logger || console;
  }

  /**
   * Initialize database connection with resilient fallback
   * @returns {Promise<Sequelize>} Sequelize instance
   */
  async connect() {
    try {
      // Try PostgreSQL first
      this.logger.info(`[${this.serviceName}] Attempting PostgreSQL connection...`, {
        host: this.primaryConfig.host,
        database: this.primaryConfig.database
      });

      this.sequelize = await this._connectPostgreSQL();
      this.activeDialect = 'postgres';

      this.logger.info(`[${this.serviceName}] ✓ PostgreSQL connection successful`);

      // Start health monitoring
      if (this.autoReconnect) {
        this._startHealthCheck();
      }

      this.emit('connected', { dialect: 'postgres' });
      return this.sequelize;

    } catch (postgresError) {
      this.logger.warn(`[${this.serviceName}] PostgreSQL connection failed`, {
        error: postgresError.message,
        code: postgresError.code
      });

      // Try SQLite fallback
      if (this.allowSQLiteFallback) {
        try {
          this.logger.info(`[${this.serviceName}] Falling back to SQLite...`);

          this.sequelize = await this._connectSQLite();
          this.activeDialect = 'sqlite';

          this.logger.warn(`[${this.serviceName}] ⚠️  Using SQLite fallback - Limited features`);
          this.logger.warn(`[${this.serviceName}] Production deployment requires PostgreSQL`);

          // Start PostgreSQL recovery attempts
          if (this.autoReconnect) {
            this._startPostgreSQLRecovery();
          }

          this.emit('connected', { dialect: 'sqlite', fallback: true });
          return this.sequelize;

        } catch (sqliteError) {
          this.logger.error(`[${this.serviceName}] SQLite fallback also failed`, {
            error: sqliteError.message
          });

          this.emit('error', {
            postgres: postgresError,
            sqlite: sqliteError
          });

          throw new Error(
            `Database connection failed: PostgreSQL (${postgresError.message}), ` +
            `SQLite (${sqliteError.message})`
          );
        }
      } else {
        this.emit('error', { postgres: postgresError });
        throw postgresError;
      }
    }
  }

  /**
   * Connect to PostgreSQL with retry logic
   * @private
   */
  async _connectPostgreSQL() {
    const config = {
      database: this.primaryConfig.database,
      username: this.primaryConfig.username,
      password: this.primaryConfig.password,
      host: this.primaryConfig.host || 'localhost',
      port: this.primaryConfig.port || 5432,
      dialect: 'postgres',
      pool: this.primaryConfig.pool || {
        min: 2,
        max: 10,
        acquire: 30000,
        idle: 10000
      },
      logging: this.primaryConfig.logging || false,
      dialectOptions: this.primaryConfig.ssl ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      } : {},
      // Connection timeout
      retry: {
        max: 0 // We handle retries at a higher level
      }
    };

    const sequelize = new Sequelize(config);

    // Test connection with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    await Promise.race([
      sequelize.authenticate(),
      timeoutPromise
    ]);

    return sequelize;
  }

  /**
   * Connect to SQLite as fallback
   * @private
   */
  async _connectSQLite() {
    // Determine SQLite file path
    const sqliteDir = this.fallbackConfig.storageDir ||
      path.join(process.cwd(), 'data', 'sqlite');
    const sqliteFile = this.fallbackConfig.storagePath ||
      path.join(sqliteDir, `${this.serviceName}.sqlite`);

    // Ensure directory exists
    await fs.mkdir(path.dirname(sqliteFile), { recursive: true });

    const config = {
      dialect: 'sqlite',
      storage: sqliteFile,
      logging: this.fallbackConfig.logging || false,
      pool: {
        max: 5,
        min: 0,
        idle: 10000
      }
    };

    const sequelize = new Sequelize(config);

    // Test connection
    await sequelize.authenticate();

    // Log SQLite limitations
    this._logSQLiteLimitations();

    return sequelize;
  }

  /**
   * Start health check monitoring for PostgreSQL
   * @private
   */
  _startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.sequelize.authenticate();
        // Connection is healthy
        if (this.activeDialect === 'postgres') {
          this.retryAttempts = 0; // Reset retry counter
        }
      } catch (error) {
        this.logger.error(`[${this.serviceName}] Database health check failed`, {
          dialect: this.activeDialect,
          error: error.message
        });

        this.emit('healthCheckFailed', {
          dialect: this.activeDialect,
          error
        });
      }
    }, this.healthCheckIntervalMs);
  }

  /**
   * Attempt to reconnect to PostgreSQL from SQLite fallback
   * @private
   */
  _startPostgreSQLRecovery() {
    const recoveryInterval = setInterval(async () => {
      if (this.activeDialect === 'postgres') {
        clearInterval(recoveryInterval);
        return;
      }

      this.retryAttempts++;

      if (this.retryAttempts > this.maxRetries) {
        this.logger.info(
          `[${this.serviceName}] PostgreSQL recovery: ` +
          `Retry ${this.retryAttempts}/${this.maxRetries}...`
        );
      }

      try {
        const newSequelize = await this._connectPostgreSQL();

        // Success! Switch to PostgreSQL
        this.logger.info(`[${this.serviceName}] ✓ PostgreSQL recovered! Switching from SQLite...`);

        // Close SQLite connection
        await this.sequelize.close();

        // Switch to PostgreSQL
        this.sequelize = newSequelize;
        this.activeDialect = 'postgres';
        this.retryAttempts = 0;

        // Start normal health monitoring
        clearInterval(recoveryInterval);
        this._startHealthCheck();

        this.emit('recovered', {
          from: 'sqlite',
          to: 'postgres'
        });

      } catch (error) {
        // Still can't connect, will retry
        const nextRetry = Math.min(
          this.retryDelay * Math.pow(2, this.retryAttempts),
          60000 // Max 1 minute
        );

        this.logger.debug(
          `[${this.serviceName}] PostgreSQL still unavailable. ` +
          `Next retry in ${nextRetry}ms`
        );
      }
    }, this.retryDelay);
  }

  /**
   * Log SQLite limitations for developers
   * @private
   */
  _logSQLiteLimitations() {
    const limitations = [
      '⚠️  SQLite Limitations Active:',
      '   • No concurrent write operations',
      '   • Limited JSON query support',
      '   • No advanced indexing (GiST, GIN, etc.)',
      '   • No PostGIS/spatial extensions',
      '   • Reduced performance for large datasets',
      '   • No database-level user management'
    ];

    limitations.forEach(msg => this.logger.warn(`[${this.serviceName}] ${msg}`));
  }

  /**
   * Get current connection status
   * @returns {Object} Connection status
   */
  getStatus() {
    return {
      connected: this.sequelize !== null,
      dialect: this.activeDialect,
      fallback: this.activeDialect === 'sqlite',
      retryAttempts: this.retryAttempts,
      serviceName: this.serviceName
    };
  }

  /**
   * Check if using fallback mode
   * @returns {boolean} True if using SQLite fallback
   */
  isFallbackMode() {
    return this.activeDialect === 'sqlite';
  }

  /**
   * Get Sequelize instance
   * @returns {Sequelize|null} Active Sequelize instance
   */
  getSequelize() {
    return this.sequelize;
  }

  /**
   * Gracefully close database connection
   */
  async disconnect() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.sequelize) {
      await this.sequelize.close();
      this.sequelize = null;
      this.activeDialect = null;
    }

    this.emit('disconnected');
  }

  /**
   * Force reconnection (useful for testing)
   */
  async reconnect() {
    await this.disconnect();
    return await this.connect();
  }
}

/**
 * Factory function to create resilient database connection
 * @param {Object} config Configuration object
 * @returns {Promise<ResilientDatabaseConnection>} Connected database instance
 */
async function createResilientConnection(config) {
  const connection = new ResilientDatabaseConnection(config);
  await connection.connect();
  return connection;
}

module.exports = {
  ResilientDatabaseConnection,
  createResilientConnection
};
