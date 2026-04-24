/**
 * ═══════════════════════════════════════════════════════════════════════
 * Session Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Express session configuration
 * Used for web interface session management
 */
module.exports = {
  /**
   * Session secret for signing session IDs
   * IMPORTANT: Change this in production!
   * @type {string}
   */
  secret: process.env.SESSION_SECRET || 'exprsn-ca-secret-change-me',

  /**
   * Session cookie maximum age (milliseconds)
   * @type {number} - Default: 86400000ms (24 hours)
   */
  maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000,

  /**
   * Enable secure cookies (HTTPS only)
   * @type {boolean}
   */
  secure: process.env.SESSION_SECURE === 'true',

  /**
   * SameSite cookie attribute
   * @type {string} - 'strict', 'lax', or 'none'
   */
  sameSite: process.env.SESSION_SAME_SITE || 'lax'
};
