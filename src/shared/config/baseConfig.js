/**
 * Base Configuration for All Exprsn Services
 * Shared configuration patterns and utilities
 */

const path = require('path');
const fs = require('fs');

class BaseConfig {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.env = process.env.NODE_ENV || 'development';
    this.loadEnvironment();
  }

  /**
   * Load environment variables from .env file
   */
  loadEnvironment() {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
    }
  }

  /**
   * Get service configuration
   */
  getConfig() {
    return {
      // Service Identity
      service: {
        name: this.serviceName,
        id: process.env.SERVICE_ID || `${this.serviceName}-${this.env}`,
        version: process.env.SERVICE_VERSION || '1.0.0',
        env: this.env
      },

      // Server Configuration
      server: {
        port: parseInt(process.env.PORT) || this.getDefaultPort(),
        host: process.env.HOST || '0.0.0.0',
        cors: {
          enabled: process.env.CORS_ENABLED !== 'false',
          origin: process.env.CORS_ORIGIN || '*',
          credentials: process.env.CORS_CREDENTIALS === 'true'
        }
      },

      // Certificate Authority
      ca: {
        baseUrl: process.env.CA_BASE_URL || 'http://localhost:3000',
        serviceToken: process.env.SERVICE_TOKEN || '',
        validateTokens: process.env.CA_VALIDATE_TOKENS !== 'false',
        ocspEnabled: process.env.CA_OCSP_ENABLED !== 'false'
      },

      // Database Configuration
      database: {
        // PostgreSQL (Primary)
        postgres: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432,
          database: process.env.DB_NAME || `exprsn_${this.serviceName}`,
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          pool: {
            max: parseInt(process.env.DB_POOL_MAX) || 20,
            min: parseInt(process.env.DB_POOL_MIN) || 5,
            acquire: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 30000,
            idle: parseInt(process.env.DB_IDLE_TIMEOUT) || 10000
          },
          logging: process.env.DB_LOGGING === 'true'
        },

      },

      // Redis Configuration
      redis: {
        enabled: process.env.REDIS_ENABLED !== 'false',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || null,
        db: parseInt(process.env.REDIS_DB) || 0,
        keyPrefix: `exprsn:${this.serviceName}:`,
        ttl: parseInt(process.env.REDIS_TTL) || 3600
      },

      // Logging Configuration
      logging: {
        level: process.env.LOG_LEVEL || (this.env === 'production' ? 'info' : 'debug'),
        format: process.env.LOG_FORMAT || 'json',
        dir: process.env.LOG_DIR || './logs',
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 14,
        maxSize: process.env.LOG_MAX_SIZE || '20m'
      },

      // Security Configuration
      security: {
        rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        corsEnabled: process.env.CORS_ENABLED !== 'false',
        helmetEnabled: process.env.HELMET_ENABLED !== 'false'
      },

      // Service Discovery
      services: {
        ca: process.env.CA_BASE_URL || 'http://localhost:3000',
        auth: process.env.AUTH_BASE_URL || 'http://localhost:3001',
        spark: process.env.SPARK_BASE_URL || 'http://localhost:3002',
        sparkWs: process.env.SPARK_WS_URL || 'ws://localhost:3003',
        timeline: process.env.TIMELINE_BASE_URL || 'http://localhost:3004',
        prefetch: process.env.PREFETCH_BASE_URL || 'http://localhost:3005',
        moderator: process.env.MODERATOR_BASE_URL || 'http://localhost:3006',
        filevault: process.env.FILEVAULT_BASE_URL || 'http://localhost:3007',
        gallery: process.env.GALLERY_BASE_URL || 'http://localhost:3008',
        live: process.env.LIVE_BASE_URL || 'http://localhost:3009'
      },

      // Monitoring
      monitoring: {
        enabled: process.env.MONITORING_ENABLED === 'true',
        metricsEnabled: process.env.METRICS_ENABLED === 'true',
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
      }
    };
  }

  /**
   * Get default port for service
   */
  getDefaultPort() {
    const ports = {
      'ca': 3000,
      'auth': 3001,
      'spark': 3002,
      'timeline': 3004,
      'prefetch': 3005,
      'moderator': 3006,
      'filevault': 3007,
      'gallery': 3008,
      'live': 3009
    };
    return ports[this.serviceName] || 3100;
  }

  /**
   * Validate required environment variables
   */
  validateConfig() {
    const required = [
      'SERVICE_TOKEN'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return true;
  }

  /**
   * Get database configuration for Sequelize
   */
  getSequelizeConfig() {
    const config = this.getConfig();
    return {
      dialect: 'postgres',
      host: config.database.postgres.host,
      port: config.database.postgres.port,
      database: config.database.postgres.database,
      username: config.database.postgres.username,
      password: config.database.postgres.password,
      pool: config.database.postgres.pool,
      logging: config.database.postgres.logging ? console.log : false,
      define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true
      }
    };
  }
}

module.exports = BaseConfig;
