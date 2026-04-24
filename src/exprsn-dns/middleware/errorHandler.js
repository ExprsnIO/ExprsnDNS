/**
 * Exprsn DNS - Express error handler
 */

const logger = require('../utils/logger');

function notFound(req, res, _next) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error('API error', { error: err.message, stack: err.stack, path: req.originalUrl });
  } else {
    logger.debug('API client error', { error: err.message, path: req.originalUrl });
  }

  res.status(status).json({
    error: err.code || (status >= 500 ? 'internal_error' : 'bad_request'),
    message: err.message,
    details: err.details || undefined
  });
}

module.exports = { notFound, errorHandler };
