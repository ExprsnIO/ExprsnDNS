/**
 * ═══════════════════════════════════════════════════════════
 * Middleware Index
 * ═══════════════════════════════════════════════════════════
 */

const auth = require('./auth');
const validation = require('./validation');
const errorHandler = require('./errorHandler');
const socketAuth = require('./socketAuth');
const rateLimit = require('./rateLimit');
const permissionCache = require('./permissionCache');

module.exports = {
  // Authentication & Authorization
  ...auth,

  // Validation
  ...validation,

  // Error Handling
  ...errorHandler,

  // Socket.IO Authentication
  ...socketAuth,

  // Rate Limiting
  rateLimiter: rateLimit.rateLimiter,
  getRateLimitConfig: rateLimit.getRateLimitConfig,
  checkRateLimit: rateLimit.checkRateLimit,
  createDefaultRateLimits: rateLimit.createDefaultRateLimits,

  // Permission Caching
  getUserPermissions: permissionCache.getUserPermissions,
  invalidateUserPermissionCache: permissionCache.invalidateUserPermissionCache,
  invalidateGroupPermissionCache: permissionCache.invalidateGroupPermissionCache,
  invalidateRolePermissionCache: permissionCache.invalidateRolePermissionCache,
  hasPermissions: permissionCache.hasPermissions,
  requirePermissions: permissionCache.requirePermissions,
  requireAdmin: permissionCache.requireAdmin,
  requireModerator: permissionCache.requireModerator
};
