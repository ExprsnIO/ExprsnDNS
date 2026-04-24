/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * Token generation schema
 */
const generateTokenSchema = Joi.object({
  certificateId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid certificate ID format',
      'any.required': 'Certificate ID is required'
    }),
  permissions: Joi.object({
    read: Joi.boolean().default(false),
    write: Joi.boolean().default(false),
    append: Joi.boolean().default(false),
    delete: Joi.boolean().default(false),
    update: Joi.boolean().default(false)
  }).required()
    .messages({
      'any.required': 'Permissions object is required'
    }),
  resource: Joi.object({
    type: Joi.string()
      .valid('url', 'did', 'cid')
      .required()
      .messages({
        'any.only': 'Resource type must be one of: url, did, cid',
        'any.required': 'Resource type is required'
      }),
    value: Joi.string()
      .max(1000)
      .required()
      .messages({
        'string.max': 'Resource value must not exceed 1000 characters',
        'any.required': 'Resource value is required'
      })
  }).required(),
  expiryType: Joi.string()
    .valid('time', 'use', 'persistent')
    .default('time')
    .messages({
      'any.only': 'Expiry type must be one of: time, use, persistent'
    }),
  expiresAt: Joi.when('expiryType', {
    is: 'time',
    then: Joi.number()
      .integer()
      .min(Date.now())
      .required()
      .messages({
        'number.min': 'Expiration time must be in the future',
        'any.required': 'Expiration time is required for time-based tokens'
      }),
    otherwise: Joi.number().optional().allow(null)
  }),
  maxUses: Joi.when('expiryType', {
    is: 'use',
    then: Joi.number()
      .integer()
      .min(1)
      .max(1000000)
      .required()
      .messages({
        'number.min': 'Max uses must be at least 1',
        'number.max': 'Max uses must not exceed 1,000,000',
        'any.required': 'Max uses is required for use-based tokens'
      }),
    otherwise: Joi.number().optional().allow(null)
  }),
  notBefore: Joi.number()
    .integer()
    .min(Date.now())
    .optional()
    .messages({
      'number.min': 'Not-before time must be in the future or present'
    }),
  data: Joi.object()
    .optional()
    .messages({
      'object.base': 'Token data must be a valid JSON object'
    })
});

/**
 * Token validation schema
 */
const validateTokenSchema = Joi.object({
  token: Joi.string()
    .optional()
    .messages({
      'string.base': 'Token must be a string'
    }),
  tokenId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Invalid token ID format'
    }),
  requiredPermissions: Joi.object({
    read: Joi.boolean().optional(),
    write: Joi.boolean().optional(),
    append: Joi.boolean().optional(),
    delete: Joi.boolean().optional(),
    update: Joi.boolean().optional()
  }).optional(),
  resource: Joi.string()
    .max(1000)
    .optional()
    .messages({
      'string.max': 'Resource must not exceed 1000 characters'
    }),
  resourceValue: Joi.string()
    .max(1000)
    .optional()
    .messages({
      'string.max': 'Resource value must not exceed 1000 characters'
    })
}).or('token', 'tokenId')
  .messages({
    'object.missing': 'Either token or tokenId must be provided'
  });

/**
 * Token revocation schema
 */
const revokeTokenSchema = Joi.object({
  tokenId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid token ID format',
      'any.required': 'Token ID is required'
    }),
  reason: Joi.string()
    .max(255)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Reason must not exceed 255 characters'
    })
});

/**
 * Token refresh schema
 */
const refreshTokenSchema = Joi.object({
  tokenId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid token ID format',
      'any.required': 'Token ID is required'
    }),
  expiresAt: Joi.number()
    .integer()
    .min(Date.now())
    .required()
    .messages({
      'number.min': 'New expiration time must be in the future',
      'any.required': 'New expiration time is required'
    })
});

module.exports = {
  generateTokenSchema,
  validateTokenSchema,
  revokeTokenSchema,
  refreshTokenSchema
};
