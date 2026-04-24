/**
 * ═══════════════════════════════════════════════════════════
 * Request Validation Utilities
 * Input validation helpers for Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const { AppError } = require('../middleware/errorHandler');

/**
 * Validate required fields in request body
 * @param {Object} data - Request data
 * @param {Array<string>} requiredFields - Required field names
 * @throws {AppError} If validation fails
 */
function validateRequired(data, requiredFields) {
  const missing = requiredFields.filter(field => {
    return data[field] === undefined || data[field] === null || data[field] === '';
  });

  if (missing.length > 0) {
    throw new AppError(
      `Missing required fields: ${missing.join(', ')}`,
      400,
      'VALIDATION_ERROR'
    );
  }
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean}
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function isValidURL(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize string input
 * @param {string} str - String to sanitize
 * @returns {string}
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
}

/**
 * Validate pagination parameters
 * @param {Object} query - Request query parameters
 * @returns {Object} Validated pagination params
 */
function validatePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Validate date range
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @throws {AppError} If validation fails
 */
function validateDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    throw new AppError('Invalid start date', 400, 'VALIDATION_ERROR');
  }

  if (isNaN(end.getTime())) {
    throw new AppError('Invalid end date', 400, 'VALIDATION_ERROR');
  }

  if (start > end) {
    throw new AppError('Start date must be before end date', 400, 'VALIDATION_ERROR');
  }
}

module.exports = {
  validateRequired,
  isValidUUID,
  isValidEmail,
  isValidURL,
  sanitizeString,
  validatePagination,
  validateDateRange
};
