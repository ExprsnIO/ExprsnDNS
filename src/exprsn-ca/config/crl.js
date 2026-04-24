/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRL Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * CRL (Certificate Revocation List) configuration
 * RFC 5280 - X.509 Public Key Infrastructure
 */
module.exports = {
  /**
   * Enable CRL distribution
   * @type {boolean}
   */
  enabled: process.env.CRL_ENABLED === 'true',

  /**
   * CRL distribution URL
   * @type {string}
   */
  url: process.env.CRL_URL || 'http://crl.exprsn.io/crl',

  /**
   * CRL update interval (seconds)
   * @type {number} - Default: 3600 seconds (1 hour)
   */
  updateInterval: parseInt(process.env.CRL_UPDATE_INTERVAL, 10) || 3600,

  /**
   * Days until next CRL update
   * @type {number} - Default: 7 days
   */
  nextUpdateDays: parseInt(process.env.CRL_NEXT_UPDATE_DAYS, 10) || 7
};
