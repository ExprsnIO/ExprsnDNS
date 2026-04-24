/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 *
 * See: TOKEN_SPECIFICATION_V1.0.md for complete token specification
 */

/**
 * CA Token configuration
 * Implements TOKEN_SPECIFICATION_V1.0
 */
module.exports = {
  /**
   * Token specification version
   * @type {string}
   */
  version: process.env.TOKEN_VERSION || '1.0',

  /**
   * Maximum token size (bytes)
   * @type {number} - Default: 65536 (64KB)
   */
  maxSize: parseInt(process.env.TOKEN_MAX_SIZE, 10) || 65536,

  /**
   * Checksum algorithm
   * @type {string} - Default: sha256
   */
  checksumAlgorithm: process.env.TOKEN_CHECKSUM_ALGORITHM || 'sha256',

  /**
   * Signature algorithm
   * @type {string} - Default: RSA-SHA256-PSS
   */
  signatureAlgorithm: process.env.TOKEN_SIGNATURE_ALGORITHM || 'RSA-SHA256-PSS',

  /**
   * Default token settings
   */
  defaults: {
    /**
     * Default expiry type
     * @type {string} - 'time', 'use', or 'persistent'
     */
    expiryType: process.env.DEFAULT_TOKEN_EXPIRY_TYPE || 'time',

    /**
     * Default expiry duration (seconds)
     * @type {number} - Default: 3600 seconds (1 hour)
     */
    expirySeconds: parseInt(process.env.DEFAULT_TOKEN_EXPIRY_SECONDS, 10) || 3600,

    /**
     * Default maximum uses for use-based tokens
     * @type {number} - Default: 10
     */
    maxUses: parseInt(process.env.DEFAULT_TOKEN_MAX_USES, 10) || 10
  }
};
