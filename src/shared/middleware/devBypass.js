/**
 * ═══════════════════════════════════════════════════════════════════════
 * Development Mode Bypass Middleware
 *
 * In development mode:
 * - Bypasses CA token validation
 * - Bypasses Auth requirements
 * - Still logs requests for debugging
 * - Can be disabled with DEV_BYPASS=false
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

/**
 * Check if request should bypass authentication
 */
function shouldBypass(req) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const bypassEnabled = process.env.DEV_BYPASS !== 'false';
  const isBrokerToken = req.headers['x-broker-token'] === 'true';
  const isIPCRequest = req.headers['x-ipc-request'] === 'true';

  return isDevelopment && bypassEnabled && (isBrokerToken || isIPCRequest);
}

/**
 * Development bypass middleware for CA validation
 */
function bypassCA(req, res, next) {
  if (shouldBypass(req)) {
    logger.debug('CA validation bypassed (development mode)', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    // Inject mock CA token data
    req.caToken = {
      id: 'dev-bypass-token',
      version: '1.0',
      permissions: { read: true, write: true, append: true, delete: true, update: true },
      resource: { type: 'url', value: '*' },
      bypass: true,
      development: true
    };

    return next();
  }

  // Continue to normal CA validation
  return next();
}

/**
 * Development bypass middleware for Auth
 */
function bypassAuth(req, res, next) {
  if (shouldBypass(req)) {
    logger.debug('Auth validation bypassed (development mode)', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    // Inject mock user data
    req.user = {
      id: 'dev-bypass-user',
      username: 'developer',
      email: 'dev@localhost',
      roles: ['admin', 'developer'],
      bypass: true,
      development: true
    };

    req.isAuthenticated = () => true;

    return next();
  }

  // Continue to normal auth validation
  return next();
}

/**
 * Combined bypass middleware
 */
function bypassAll(req, res, next) {
  if (shouldBypass(req)) {
    bypassCA(req, res, () => {
      bypassAuth(req, res, next);
    });
  } else {
    next();
  }
}

/**
 * Log bypass status on startup
 */
function logBypassStatus() {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const bypassEnabled = process.env.DEV_BYPASS !== 'false';

  if (isDevelopment && bypassEnabled) {
    logger.warn('⚠️  DEVELOPMENT MODE: CA/Auth bypass ENABLED', {
      environment: process.env.NODE_ENV,
      bypassCA: true,
      bypassAuth: true,
      disable: 'Set DEV_BYPASS=false to disable'
    });
  } else if (isDevelopment) {
    logger.info('Development mode: CA/Auth bypass DISABLED', {
      environment: process.env.NODE_ENV
    });
  }
}

module.exports = {
  bypassCA,
  bypassAuth,
  bypassAll,
  shouldBypass,
  logBypassStatus
};
