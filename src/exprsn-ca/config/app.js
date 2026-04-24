/**
 * ═══════════════════════════════════════════════════════════════════════
 * Application Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Application-level configuration settings
 * Handles environment, server port/host, and clustering options
 */
module.exports = {
  /**
   * Application environment
   * @type {string} - 'development', 'production', 'test'
   */
  env: process.env.NODE_ENV || 'development',

  /**
   * Server port
   * @type {number}
   */
  port: parseInt(process.env.PORT, 10) || 3000,

  /**
   * Server host address
   * @type {string}
   */
  host: process.env.HOST || '0.0.0.0',

  /**
   * Cluster mode configuration
   */
  cluster: {
    /**
     * Enable cluster mode for high availability
     * @type {boolean}
     */
    enabled: process.env.CLUSTER_ENABLED === 'true',

    /**
     * Number of worker processes
     * @type {number}
     */
    workers: parseInt(process.env.CLUSTER_WORKERS, 10) || 4
  }
};
