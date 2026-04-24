/**
 * ═══════════════════════════════════════════════════════════════════════
 * OCSP Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * OCSP (Online Certificate Status Protocol) configuration
 * RFC 6960 - X.509 Internet Public Key Infrastructure
 */
module.exports = {
  /**
   * Enable OCSP responder
   * @type {boolean}
   */
  enabled: process.env.OCSP_ENABLED === 'true',

  /**
   * OCSP responder port
   * @type {number} - Default: 2560 (standard OCSP port)
   */
  port: parseInt(process.env.OCSP_PORT, 10) || 2560,

  /**
   * OCSP responder URL
   * @type {string}
   */
  url: process.env.OCSP_URL || 'http://ocsp.exprsn.io:2560',

  /**
   * Batch OCSP request configuration
   */
  batch: {
    /**
     * Enable batch OCSP requests
     * @type {boolean}
     */
    enabled: process.env.OCSP_BATCH_ENABLED === 'true',

    /**
     * Batch timeout (milliseconds)
     * @type {number} - Default: 100ms
     */
    timeout: parseInt(process.env.OCSP_BATCH_TIMEOUT, 10) || 100
  },

  /**
   * OCSP response caching configuration
   */
  cache: {
    /**
     * Enable OCSP response caching
     * @type {boolean}
     */
    enabled: process.env.OCSP_CACHE_ENABLED === 'true',

    /**
     * Cache TTL (seconds)
     * @type {number} - Default: 300 seconds (5 minutes)
     */
    ttl: parseInt(process.env.OCSP_CACHE_TTL, 10) || 300
  }
};
