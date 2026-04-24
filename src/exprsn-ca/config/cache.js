/**
 * ═══════════════════════════════════════════════════════════════════════
 * Cache Configuration Module (Redis)
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Redis cache configuration
 * Used for caching tokens, certificates, and OCSP responses
 */
module.exports = {
  /**
   * Enable Redis caching
   * @type {boolean}
   */
  enabled: process.env.REDIS_ENABLED === 'true',

  /**
   * Redis server host
   * @type {string}
   */
  host: process.env.REDIS_HOST || 'localhost',

  /**
   * Redis server port
   * @type {number}
   */
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,

  /**
   * Redis password (optional)
   * @type {string|undefined}
   */
  password: process.env.REDIS_PASSWORD || undefined,

  /**
   * Redis database number
   * @type {number}
   */
  db: parseInt(process.env.REDIS_DB, 10) || 0,

  /**
   * Key prefix for all Redis keys
   * @type {string}
   */
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'exprsn:ca:',

  /**
   * TTL (time-to-live) settings in seconds
   */
  ttl: {
    /**
     * Token cache TTL
     * @type {number} - Default: 60 seconds
     */
    token: parseInt(process.env.CACHE_TOKEN_TTL, 10) || 60,

    /**
     * Certificate cache TTL
     * @type {number} - Default: 300 seconds (5 minutes)
     */
    cert: parseInt(process.env.CACHE_CERT_TTL, 10) || 300,

    /**
     * OCSP response cache TTL
     * @type {number} - Default: 300 seconds (5 minutes)
     */
    ocsp: parseInt(process.env.CACHE_OCSP_TTL, 10) || 300
  }
};
