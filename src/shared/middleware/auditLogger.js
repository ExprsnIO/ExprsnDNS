/**
 * ═══════════════════════════════════════════════════════════
 * Audit Logging Middleware
 * Comprehensive logging of all state-changing operations
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

/**
 * Action types for audit logging
 */
const ActionTypes = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  REVOKE: 'REVOKE',
  GRANT: 'GRANT',
  MODERATE: 'MODERATE',
  UPLOAD: 'UPLOAD',
  DOWNLOAD: 'DOWNLOAD',
  SHARE: 'SHARE',
  CUSTOM: 'CUSTOM'
};

/**
 * Creates an audit log entry
 * @param {Object} options - Audit log options
 * @param {string} options.action - Action type (from ActionTypes)
 * @param {string} options.resourceType - Type of resource affected
 * @param {string} options.resourceId - ID of resource affected
 * @param {Object} options.metadata - Additional metadata
 * @param {boolean} options.sensitive - Whether action is sensitive
 * @returns {Function} Express middleware
 */
function logAction(options = {}) {
  const {
    action = ActionTypes.CUSTOM,
    resourceType = 'unknown',
    getResourceId = null,
    metadata = {},
    sensitive = false
  } = options;

  return async (req, res, next) => {
    // Store original res.json to capture response
    const originalJson = res.json.bind(res);

    // Extract resource ID if function provided
    let resourceId = options.resourceId;
    if (getResourceId && typeof getResourceId === 'function') {
      try {
        resourceId = await getResourceId(req);
      } catch (error) {
        logger.warn('Failed to extract resource ID for audit', {
          error: error.message
        });
      }
    }

    // Create audit log entry
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      resourceType,
      resourceId: resourceId || req.params.id || 'unknown',
      userId: req.userId || 'anonymous',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
      query: req.query,
      ...(sensitive ? {} : { body: sanitizeBody(req.body) }),
      metadata
    };

    // Override res.json to capture response status
    res.json = function (data) {
      auditEntry.statusCode = res.statusCode;
      auditEntry.success = res.statusCode >= 200 && res.statusCode < 300;

      // Log audit entry
      if (auditEntry.success) {
        logger.info('Audit: Action completed', auditEntry);
      } else {
        logger.warn('Audit: Action failed', auditEntry);
      }

      // Call original res.json
      return originalJson(data);
    };

    next();
  };
}

/**
 * Automatic audit logging for state-changing HTTP methods
 * @param {Object} options - Options for auto audit
 * @returns {Function} Express middleware
 */
function autoAudit(options = {}) {
  const {
    resourceType = 'resource',
    excludePaths = [],
    includeBody = false
  } = options;

  return (req, res, next) => {
    // Only audit state-changing methods
    const auditableMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!auditableMethods.includes(req.method)) {
      return next();
    }

    // Skip excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Determine action type from HTTP method
    const actionMap = {
      'POST': ActionTypes.CREATE,
      'PUT': ActionTypes.UPDATE,
      'PATCH': ActionTypes.UPDATE,
      'DELETE': ActionTypes.DELETE
    };

    const action = actionMap[req.method] || ActionTypes.CUSTOM;

    // Store original res.json
    const originalJson = res.json.bind(res);

    // Create audit entry
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      resourceType,
      resourceId: req.params.id || 'batch',
      userId: req.userId || 'anonymous',
      ipAddress: req.ip || req.connection.remoteAddress,
      method: req.method,
      path: req.path,
      ...(includeBody ? { body: sanitizeBody(req.body) } : {})
    };

    // Override res.json
    res.json = function (data) {
      auditEntry.statusCode = res.statusCode;
      auditEntry.success = res.statusCode >= 200 && res.statusCode < 300;

      // Log based on success/failure
      if (auditEntry.success) {
        logger.info('Auto-audit: Action completed', auditEntry);
      } else {
        logger.warn('Auto-audit: Action failed', auditEntry);
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Audit login attempts
 * @returns {Function} Express middleware
 */
function auditLogin() {
  return logAction({
    action: ActionTypes.LOGIN,
    resourceType: 'user',
    getResourceId: (req) => req.body.username || req.body.email || 'unknown',
    sensitive: true
  });
}

/**
 * Audit logout actions
 * @returns {Function} Express middleware
 */
function auditLogout() {
  return logAction({
    action: ActionTypes.LOGOUT,
    resourceType: 'user',
    getResourceId: (req) => req.userId || 'unknown'
  });
}

/**
 * Audit moderation actions
 * @param {string} moderationType - Type of moderation (warn, ban, hide, remove)
 * @returns {Function} Express middleware
 */
function auditModeration(moderationType) {
  return logAction({
    action: ActionTypes.MODERATE,
    resourceType: 'content',
    metadata: { moderationType },
    sensitive: false
  });
}

/**
 * Audit file operations
 * @param {string} operation - Type of file operation (upload, download)
 * @returns {Function} Express middleware
 */
function auditFileOperation(operation) {
  const action = operation === 'upload' ? ActionTypes.UPLOAD : ActionTypes.DOWNLOAD;

  return logAction({
    action,
    resourceType: 'file',
    metadata: { operation },
    getResourceId: (req) => req.params.id || req.body.filename || 'unknown'
  });
}

/**
 * Sanitize request body for logging (remove sensitive fields)
 * @param {Object} body - Request body
 * @returns {Object} Sanitized body
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = [
    'password',
    'passwordConfirm',
    'currentPassword',
    'newPassword',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'secret',
    'privateKey',
    'ssn',
    'creditCard'
  ];

  const sanitized = { ...body };

  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

module.exports = {
  logAction,
  autoAudit,
  auditLogin,
  auditLogout,
  auditModeration,
  auditFileOperation,
  ActionTypes
};
