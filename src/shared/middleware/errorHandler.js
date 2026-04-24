/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling Middleware
 * Centralized error handling for all Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

/**
 * Application error class
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  let { statusCode = 500, message, errorCode } = err;

  // Log error
  logger.error('Error occurred', {
    errorCode,
    message,
    statusCode,
    path: req.path,
    method: req.method,
    userId: req.userId,
    stack: err.stack
  });

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    message = 'Internal server error';
    errorCode = 'INTERNAL_ERROR';
  }

  res.status(statusCode).json({
    error: errorCode || 'ERROR',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
}

/**
 * Async handler wrapper to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
