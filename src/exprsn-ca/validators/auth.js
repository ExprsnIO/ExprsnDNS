/**
 * ═══════════════════════════════════════════════════════════════════════
 * Authentication Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * Login validation schema
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password must not exceed 128 characters',
      'any.required': 'Password is required'
    }),
  rememberMe: Joi.boolean()
    .optional()
});

/**
 * Registration validation schema
 */
const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  username: Joi.string()
    .min(3)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .required()
    .messages({
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username must not exceed 100 characters',
      'string.pattern.base': 'Username can only contain letters, numbers, underscores, and hyphens',
      'any.required': 'Username is required'
    }),
  password: Joi.string()
    .min(12)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=\-[\]{}|\\:;"'<>,.\/~`])[A-Za-z\d@$!%*?&#^()_+=\-[\]{}|\\:;"'<>,.\/~`]{12,}$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 12 characters',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must include uppercase, lowercase, number, and special character',
      'any.required': 'Password is required'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords must match',
      'any.required': 'Password confirmation is required'
    }),
  firstName: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'First name must not exceed 100 characters'
    }),
  lastName: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Last name must not exceed 100 characters'
    })
});

/**
 * Password reset request schema
 */
const passwordResetRequestSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

/**
 * Password reset completion schema
 */
const passwordResetSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Reset token is required'
    }),
  password: Joi.string()
    .min(12)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=\-[\]{}|\\:;"'<>,.\/~`])[A-Za-z\d@$!%*?&#^()_+=\-[\]{}|\\:;"'<>,.\/~`]{12,}$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 12 characters',
      'string.pattern.base': 'Password must include uppercase, lowercase, number, and special character',
      'any.required': 'Password is required'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords must match',
      'any.required': 'Password confirmation is required'
    })
});

/**
 * Email verification schema
 */
const emailVerificationSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Verification token is required'
    })
});

module.exports = {
  loginSchema,
  registerSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  emailVerificationSchema
};
