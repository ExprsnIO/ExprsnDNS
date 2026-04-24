/**
 * ═══════════════════════════════════════════════════════════════════════
 * JWT Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * JWT (JSON Web Token) configuration
 * Used for API authentication and authorization
 */
module.exports = {
  /**
   * RSA private key for signing JWTs (base64-encoded PEM)
   * @type {string|null}
   */
  privateKey: process.env.JWT_PRIVATE_KEY
    ? Buffer.from(process.env.JWT_PRIVATE_KEY, 'base64').toString('utf-8')
    : null,

  /**
   * RSA public key for verifying JWTs (base64-encoded PEM)
   * @type {string|null}
   */
  publicKey: process.env.JWT_PUBLIC_KEY
    ? Buffer.from(process.env.JWT_PUBLIC_KEY, 'base64').toString('utf-8')
    : null,

  /**
   * JWT issuer identifier
   * @type {string}
   */
  issuer: process.env.JWT_ISSUER || 'exprsn-ca',

  /**
   * JWT signing algorithm
   * @type {string} - Default: RS256 (RSA with SHA-256)
   */
  algorithm: process.env.JWT_ALGORITHM || 'RS256',

  /**
   * Access token expiration time (seconds)
   * @type {number} - Default: 3600 seconds (1 hour)
   */
  accessTokenExpiry: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRY, 10) || 3600,

  /**
   * Refresh token expiration time (seconds)
   * @type {number} - Default: 2592000 seconds (30 days)
   */
  refreshTokenExpiry: parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRY, 10) || 2592000
};
