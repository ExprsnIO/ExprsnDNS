/**
 * ═══════════════════════════════════════════════════════════════════════
 * Permissions Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 *
 * See: TOKEN_SPECIFICATION_V1.0.md Section 4 for permissions system details
 */

/**
 * Permissions system configuration
 * Defines permission scopes and bit flags for efficient permission checking
 */
module.exports = {
  /**
   * Permission scope names
   * Used for human-readable permission identifiers
   */
  scopes: {
    READ: 'read',
    WRITE: 'write',
    APPEND: 'append',
    SHARE: 'share',
    DELETE: 'delete',
    MODERATE: 'moderate',
    LINK: 'link'
  },

  /**
   * Permission bit flags
   * Used for efficient bitwise permission operations
   *
   * @example
   * // Check if user has READ permission
   * if (userPerms & permissions.flags.READ) {
   *   // User has read permission
   * }
   *
   * @example
   * // Grant multiple permissions
   * const perms = permissions.flags.READ | permissions.flags.WRITE;
   */
  flags: {
    READ: 0b0000001,    // 1
    WRITE: 0b0000010,   // 2
    APPEND: 0b0000100,  // 4
    SHARE: 0b0001000,   // 8
    DELETE: 0b0010000,  // 16
    MODERATE: 0b0100000, // 32
    LINK: 0b1000000     // 64
  }
};
