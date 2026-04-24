/**
 * ═══════════════════════════════════════════════════════════
 * Token Validation Middleware
 * Validates CA tokens for all Exprsn services
 * See: TOKEN_SPECIFICATION_V1.0.md Section 9
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Validates CA token against the Certificate Authority
 * @param {Object} options - Validation options
 * @param {Array<string>} options.requiredPermissions - Required permissions (e.g., ['read', 'write'])
 * @param {string} options.resourceType - Expected resource type (optional)
 * @returns {Function} Express middleware
 */
function validateCAToken(options = {}) {
  const {
    requiredPermissions = [],
    resourceType = null,
    caUrl = process.env.CA_URL || 'http://localhost:3000'
  } = options;

  return async (req, res, next) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authorization token required'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Validate token with CA
      const validationResponse = await axios.post(
        `${caUrl}/api/tokens/validate`,
        {
          token,
          requiredPermissions,
          resource: req.path,
          resourceType
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!validationResponse.data.valid) {
        logger.warn('Token validation failed', {
          reason: validationResponse.data.reason,
          path: req.path
        });

        return res.status(403).json({
          error: 'INVALID_TOKEN',
          message: validationResponse.data.reason || 'Token validation failed'
        });
      }

      // Attach token data to request
      req.tokenData = validationResponse.data.tokenData;
      req.userId = validationResponse.data.userId;
      req.permissions = validationResponse.data.permissions;

      logger.info('Token validated successfully', {
        userId: req.userId,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Token validation error', {
        error: error.message,
        path: req.path
      });

      // Handle CA unavailability
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return res.status(503).json({
          error: 'CA_UNAVAILABLE',
          message: 'Certificate Authority is currently unavailable'
        });
      }

      return res.status(500).json({
        error: 'VALIDATION_ERROR',
        message: 'Failed to validate token'
      });
    }
  };
}

/**
 * Validates token permissions
 * @param {Array<string>} permissions - Required permissions
 * @returns {Function} Express middleware
 */
function requirePermissions(permissions) {
  return (req, res, next) => {
    if (!req.permissions) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'No permissions found'
      });
    }

    const hasPermissions = permissions.every(perm =>
      req.permissions[perm] === true
    );

    if (!hasPermissions) {
      logger.warn('Insufficient permissions', {
        required: permissions,
        actual: req.permissions,
        userId: req.userId
      });

      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Required permissions: ${permissions.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Optional token validation (doesn't fail if no token)
 */
function optionalToken(options = {}) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    return validateCAToken(options)(req, res, next);
  };
}

module.exports = {
  validateCAToken,
  requirePermissions,
  optionalToken
};
