/**
 * ═══════════════════════════════════════════════════════════════════════
 * Ticket Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * Ticket generation schema
 */
const generateTicketSchema = Joi.object({
  type: Joi.string()
    .valid('login', 'password_reset', 'email_verification', 'mfa', 'api_access')
    .default('login')
    .messages({
      'any.only': 'Type must be one of: login, password_reset, email_verification, mfa, api_access'
    }),
  maxUses: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(1)
    .messages({
      'number.min': 'Max uses must be at least 1',
      'number.max': 'Max uses must not exceed 100',
      'number.base': 'Max uses must be a number'
    }),
  expiresIn: Joi.number()
    .integer()
    .min(60)
    .max(86400 * 7)
    .default(900)
    .messages({
      'number.min': 'Expiration must be at least 60 seconds',
      'number.max': 'Expiration must not exceed 7 days',
      'number.base': 'Expiration must be a number'
    }),
  metadata: Joi.object()
    .optional()
    .messages({
      'object.base': 'Metadata must be a valid JSON object'
    })
});

/**
 * Ticket validation schema
 */
const validateTicketSchema = Joi.object({
  code: Joi.string()
    .required()
    .messages({
      'any.required': 'Ticket code is required',
      'string.base': 'Ticket code must be a string'
    }),
  type: Joi.string()
    .valid('login', 'password_reset', 'email_verification', 'mfa', 'api_access')
    .optional()
    .messages({
      'any.only': 'Type must be one of: login, password_reset, email_verification, mfa, api_access'
    })
});

/**
 * Ticket revocation schema
 */
const revokeTicketSchema = Joi.object({
  ticketId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Invalid ticket ID format'
    }),
  code: Joi.string()
    .optional(),
  reason: Joi.string()
    .max(255)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Reason must not exceed 255 characters'
    })
}).or('ticketId', 'code')
  .messages({
    'object.missing': 'Either ticketId or code must be provided'
  });

module.exports = {
  generateTicketSchema,
  validateTicketSchema,
  revokeTicketSchema
};
