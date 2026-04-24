/**
 * ═══════════════════════════════════════════════════════════════════════
 * Logging Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Winston logging configuration
 * Defines log levels, file paths, and rotation settings
 */
module.exports = {
  /**
   * Log level
   * @type {string} - 'error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'
   */
  level: process.env.LOG_LEVEL || 'info',

  /**
   * File logging configuration
   */
  file: {
    /**
     * Enable file logging
     * @type {boolean}
     */
    enabled: process.env.LOG_FILE_ENABLED === 'true',

    /**
     * Log file path
     * @type {string}
     */
    path: process.env.LOG_FILE_PATH || './logs/exprsn-ca.log',

    /**
     * Maximum log file size before rotation
     * @type {string} - Supports 'k', 'm', 'g' suffixes
     */
    maxSize: process.env.LOG_MAX_SIZE || '10m',

    /**
     * Maximum number of log files to keep
     * @type {number}
     */
    maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 10,

    /**
     * Compress rotated log files
     * @type {boolean}
     */
    compress: process.env.LOG_COMPRESS === 'true'
  }
};
