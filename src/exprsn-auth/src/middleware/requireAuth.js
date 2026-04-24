/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Middleware
 * Require user to be authenticated via Passport session
 * ═══════════════════════════════════════════════════════════
 */

const { AppError } = require('@exprsn/shared');

/**
 * Require user to be authenticated
 */
function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
  }

  // Check if user account is active
  if (req.user.status !== 'active') {
    throw new AppError('Account is inactive or suspended', 403, 'ACCOUNT_INACTIVE');
  }

  next();
}

/**
 * Require user to have verified email
 */
function requireEmailVerified(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
  }

  if (!req.user.emailVerified) {
    throw new AppError('Email verification required', 403, 'EMAIL_NOT_VERIFIED');
  }

  next();
}

/**
 * Require MFA verification if enabled for user
 */
function requireMFA(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
  }

  if (req.user.mfaEnabled && !req.session.mfaVerified) {
    throw new AppError('MFA verification required', 403, 'MFA_REQUIRED');
  }

  next();
}

/**
 * Optional authentication (doesn't throw error if not authenticated)
 */
function optionalAuth(req, res, next) {
  // Just pass through, user info will be in req.user if authenticated
  next();
}

module.exports = {
  requireAuth,
  requireEmailVerified,
  requireMFA,
  optionalAuth
};
