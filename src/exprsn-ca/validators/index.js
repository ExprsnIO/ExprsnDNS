/**
 * ═══════════════════════════════════════════════════════════════════════
 * Validation Schemas - Central Export
 * ═══════════════════════════════════════════════════════════════════════
 */

const authValidators = require('./auth');
const tokenValidators = require('./tokens');
const certificateValidators = require('./certificates');
const ticketValidators = require('./tickets');
const userValidators = require('./users');
const groupValidators = require('./groups');
const roleValidators = require('./roles');

/**
 * Validation middleware factory
 * Creates Express middleware that validates request body against a Joi schema
 *
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Source of data to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const dataToValidate = req[source];

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true  // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors
      });
    }

    // Replace request data with validated and sanitized value
    req[source] = value;
    next();
  };
}

module.exports = {
  // Auth validators
  ...authValidators,

  // Token validators
  ...tokenValidators,

  // Certificate validators
  ...certificateValidators,

  // Ticket validators
  ...ticketValidators,

  // User validators
  ...userValidators,

  // Group validators
  ...groupValidators,

  // Role validators
  ...roleValidators,

  // Middleware factory
  validate
};
