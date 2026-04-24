/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling Middleware
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../config/logging');

/**
 * Async route handler wrapper to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not Found (404) handler
 */
function notFoundHandler(req, res, next) {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  error.code = 'NOT_FOUND';
  next(error);
}

/**
 * Global error handler
 */
function globalErrorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    status,
    code,
    path: req.path,
    method: req.method,
    userId: req.session?.user?.id,
    requestId: req.id
  });

  // API error response
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      success: false,
      error: code,
      message: err.message || 'An error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Web error response
  res.status(status).render('error', {
    title: 'Error',
    message: err.message || 'An error occurred',
    error: {
      status,
      code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }
  });
}

/**
 * Database error handler
 */
function handleDatabaseError(error) {
  // Sequelize validation error
  if (error.name === 'SequelizeValidationError') {
    const err = new Error('Validation failed');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = error.errors.map(e => ({
      field: e.path,
      message: e.message
    }));
    return err;
  }

  // Sequelize unique constraint error
  if (error.name === 'SequelizeUniqueConstraintError') {
    const err = new Error('Resource already exists');
    err.status = 409;
    err.code = 'DUPLICATE_RESOURCE';
    err.details = error.errors.map(e => ({
      field: e.path,
      message: e.message
    }));
    return err;
  }

  // Sequelize foreign key constraint error
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    const err = new Error('Invalid reference to related resource');
    err.status = 400;
    err.code = 'INVALID_REFERENCE';
    return err;
  }

  // Other database errors
  const err = new Error('Database error occurred');
  err.status = 500;
  err.code = 'DATABASE_ERROR';
  err.originalError = error;
  return err;
}

/**
 * Create custom error
 */
function createError(message, status = 500, code = 'ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Error types
 */
const ErrorTypes = {
  BAD_REQUEST: (message = 'Bad request') => createError(message, 400, 'BAD_REQUEST'),
  UNAUTHORIZED: (message = 'Unauthorized') => createError(message, 401, 'UNAUTHORIZED'),
  FORBIDDEN: (message = 'Forbidden') => createError(message, 403, 'FORBIDDEN'),
  NOT_FOUND: (message = 'Resource not found') => createError(message, 404, 'NOT_FOUND'),
  CONFLICT: (message = 'Resource conflict') => createError(message, 409, 'CONFLICT'),
  VALIDATION_ERROR: (message = 'Validation failed') => createError(message, 400, 'VALIDATION_ERROR'),
  INTERNAL_ERROR: (message = 'Internal server error') => createError(message, 500, 'INTERNAL_SERVER_ERROR'),
  TOKEN_EXPIRED: (message = 'Token has expired') => createError(message, 401, 'TOKEN_EXPIRED'),
  TOKEN_INVALID: (message = 'Invalid token') => createError(message, 401, 'TOKEN_INVALID'),
  CERTIFICATE_REVOKED: (message = 'Certificate has been revoked') => createError(message, 401, 'CERTIFICATE_REVOKED'),
  INVALID_SIGNATURE: (message = 'Invalid signature') => createError(message, 401, 'INVALID_SIGNATURE')
};

module.exports = {
  asyncHandler,
  notFoundHandler,
  globalErrorHandler,
  handleDatabaseError,
  createError,
  ErrorTypes
};
