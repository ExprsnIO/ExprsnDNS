/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup Check Middleware
 * Redirects to setup wizard if first-run setup is not complete
 * ═══════════════════════════════════════════════════════════════════════
 */

const setupService = require('../services/setup');
const logger = require('../utils/logger');

// Paths that should be accessible even when setup is not complete
const ALLOWED_PATHS = [
  '/setup',
  '/setup/status',
  '/setup/test-database',
  '/setup/test-redis',
  '/setup/validate',
  '/setup/run',
  '/static',
  '/bootstrap'
];

/**
 * Middleware to check if setup is complete
 * Redirects to /setup if not complete
 */
async function setupCheckMiddleware(req, res, next) {
  try {
    // Check if the requested path is allowed during setup
    const isAllowedPath = ALLOWED_PATHS.some(path =>
      req.path.startsWith(path)
    );

    if (isAllowedPath) {
      return next();
    }

    // Check if setup is complete
    const isComplete = await setupService.isSetupComplete();

    if (!isComplete) {
      // Redirect to setup wizard
      if (req.accepts('html')) {
        return res.redirect('/setup');
      } else {
        return res.status(503).json({
          error: 'Setup Required',
          message: 'The system needs to be configured. Please complete the setup wizard.',
          setupUrl: '/setup'
        });
      }
    }

    // Setup is complete, continue to next middleware
    next();
  } catch (error) {
    logger.error('Error in setup check middleware:', error);

    // On error, allow the request to proceed
    // This prevents the application from being completely broken
    next();
  }
}

module.exports = setupCheckMiddleware;
