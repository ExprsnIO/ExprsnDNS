/**
 * ═══════════════════════════════════════════════════════════════════════
 * User Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * Create user schema
 */
const createUserSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': 'Username must only contain letters and numbers',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username must not exceed 30 characters',
      'any.required': 'Username is required'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
  firstName: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'First name must not exceed 100 characters'
    }),
  lastName: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Last name must not exceed 100 characters'
    }),
  isAdmin: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'isAdmin must be a boolean value'
    })
});

/**
 * Update user schema
 */
const updateUserSchema = Joi.object({
  email: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'Please provide a valid email address'
    }),
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .optional()
    .messages({
      'string.alphanum': 'Username must only contain letters and numbers',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username must not exceed 30 characters'
    }),
  firstName: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'First name must not exceed 100 characters'
    }),
  lastName: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Last name must not exceed 100 characters'
    }),
  isAdmin: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'isAdmin must be a boolean value'
    }),
  isActive: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'isActive must be a boolean value'
    })
}).min(1)
  .messages({
    'object.min': 'At least one field must be provided for update'
  });

/**
 * Change password schema
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters',
      'string.max': 'New password must not exceed 128 characters',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'New password is required'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'any.required': 'Password confirmation is required'
    })
});

/**
 * UUID parameter schema
 */
const userIdParamSchema = Joi.object({
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid user ID format',
      'any.required': 'User ID is required'
    })
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  userIdParamSchema
};
