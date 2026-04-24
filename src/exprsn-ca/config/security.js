/**
 * ═══════════════════════════════════════════════════════════════════════
 * Security Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Security-related configuration
 * Covers password hashing, rate limiting, and ticket authentication
 */
module.exports = {
  /**
   * BCrypt hashing rounds
   * Higher values = more secure but slower
   * @type {number} - Default: 12
   */
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,

  /**
   * Rate limiting configuration
   */
  rateLimit: {
    /**
     * Time window for rate limiting (milliseconds)
     * @type {number} - Default: 900000ms (15 minutes)
     */
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,

    /**
     * Maximum requests per window
     * @type {number} - Default: 100 requests
     */
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
  },

  /**
   * Ticket-based authentication configuration
   */
  ticket: {
    /**
     * Ticket expiration time (seconds)
     * @type {number} - Default: 300 seconds (5 minutes)
     */
    expiry: parseInt(process.env.TICKET_EXPIRY_SECONDS, 10) || 300,

    /**
     * Maximum number of times a ticket can be used
     * @type {number} - Default: 1 (single-use)
     */
    maxUses: parseInt(process.env.TICKET_MAX_USES, 10) || 1
  }
};
