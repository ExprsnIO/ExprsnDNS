/**
 * ═══════════════════════════════════════════════════════════════════════
 * Redis Client Utility
 * Centralized Redis client for caching tokens, certificates, and permissions
 * ═══════════════════════════════════════════════════════════════════════
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('./logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isEnabled = config.redis.enabled;
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (!this.isEnabled) {
      logger.info('Redis caching is disabled');
      return;
    }

    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`Redis connection retry #${times}, delay: ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      // Test connection
      await this.client.ping();
      logger.info('Redis connection established successfully');

    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.isEnabled = false;
      this.client = null;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    if (!this.isEnabled || !this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      return JSON.parse(value);
    } catch (error) {
      logger.error('Redis GET error:', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time-to-live in seconds (optional)
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = null) {
    if (!this.isEnabled || !this.isConnected) return false;

    try {
      const serialized = JSON.stringify(value);

      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      return true;
    } catch (error) {
      logger.error('Redis SET error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async del(key) {
    if (!this.isEnabled || !this.isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   * @param {string} pattern - Key pattern (with wildcards)
   * @returns {Promise<number>} Number of keys deleted
   */
  async delPattern(pattern) {
    if (!this.isEnabled || !this.isConnected) return 0;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;

      const deleted = await this.client.del(...keys);
      return deleted;
    } catch (error) {
      logger.error('Redis DEL pattern error:', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Exists status
   */
  async exists(key) {
    if (!this.isEnabled || !this.isConnected) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Set expiration on key
   * @param {string} key - Cache key
   * @param {number} seconds - Seconds until expiration
   * @returns {Promise<boolean>} Success status
   */
  async expire(key, seconds) {
    if (!this.isEnabled || !this.isConnected) return false;

    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Redis EXPIRE error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get time-to-live for key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds (-1 if no expiry, -2 if not exists)
   */
  async ttl(key) {
    if (!this.isEnabled || !this.isConnected) return -2;

    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Redis TTL error:', { key, error: error.message });
      return -2;
    }
  }

  /**
   * Increment counter
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment (default: 1)
   * @returns {Promise<number>} New value
   */
  async incr(key, amount = 1) {
    if (!this.isEnabled || !this.isConnected) return 0;

    try {
      return await this.client.incrby(key, amount);
    } catch (error) {
      logger.error('Redis INCR error:', { key, error: error.message });
      return 0;
    }
  }

  /**
   * Flush all keys (DANGEROUS - use with caution)
   * @returns {Promise<boolean>} Success status
   */
  async flushAll() {
    if (!this.isEnabled || !this.isConnected) return false;

    try {
      await this.client.flushdb();
      logger.warn('Redis database flushed');
      return true;
    } catch (error) {
      logger.error('Redis FLUSH error:', error);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis client disconnected');
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache stats
   */
  async getStats() {
    if (!this.isEnabled || !this.isConnected) {
      return { enabled: false, connected: false };
    }

    try {
      const info = await this.client.info('stats');
      const memory = await this.client.info('memory');

      return {
        enabled: true,
        connected: this.isConnected,
        info,
        memory
      };
    } catch (error) {
      logger.error('Redis STATS error:', error);
      return { enabled: true, connected: false, error: error.message };
    }
  }
}

// Export singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
