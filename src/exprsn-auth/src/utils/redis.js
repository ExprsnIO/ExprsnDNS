/**
 * ═══════════════════════════════════════════════════════════════════════
 * Redis Client Utility - Auth Service
 * Centralized Redis client for caching permissions and user data
 * ═══════════════════════════════════════════════════════════════════════
 */

const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isEnabled = process.env.REDIS_ENABLED === 'true';
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (!this.isEnabled) {
      console.log('[Redis] Caching is disabled');
      return;
    }

    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'exprsn:auth:',
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          console.warn(`[Redis] Connection retry #${times}, delay: ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false
      });

      this.client.on('connect', () => {
        console.log('[Redis] Client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('[Redis] Client ready');
      });

      this.client.on('error', (err) => {
        console.error('[Redis] Client error:', err);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.warn('[Redis] Connection closed');
        this.isConnected = false;
      });

      // Test connection
      await this.client.ping();
      console.log('[Redis] Connection established successfully');

    } catch (error) {
      console.error('[Redis] Failed to connect:', error);
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
      console.error('[Redis] GET error:', { key, error: error.message });
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
      console.error('[Redis] SET error:', { key, error: error.message });
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
      console.error('[Redis] DEL error:', { key, error: error.message });
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
      console.error('[Redis] DEL pattern error:', { pattern, error: error.message });
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
      console.error('[Redis] EXISTS error:', { key, error: error.message });
      return false;
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
      console.warn('[Redis] Database flushed');
      return true;
    } catch (error) {
      console.error('[Redis] FLUSH error:', error);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      console.log('[Redis] Client disconnected');
    }
  }
}

// Export singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
