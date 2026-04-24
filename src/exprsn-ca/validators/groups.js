/**
 * ═══════════════════════════════════════════════════════════════════════
 * Group Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * Create group schema
 */
const createGroupSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Group name is required',
      'string.max': 'Group name must not exceed 100 characters',
      'any.required': 'Group name is required'
    }),
  slug: Joi.string()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'Slug must be lowercase alphanumeric with hyphens',
      'string.max': 'Slug must not exceed 100 characters',
      'any.required': 'Slug is required'
    }),
  description: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),
  parentId: Joi.string()
    .uuid()
    .optional()
    .allow(null)
    .messages({
      'string.guid': 'Invalid parent group ID format'
    }),
  isSystem: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'isSystem must be a boolean value'
    }),
  metadata: Joi.object()
    .optional()
    .messages({
      'object.base': 'Metadata must be a valid JSON object'
    })
});

/**
 * Update group schema
 */
const updateGroupSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Group name cannot be empty',
      'string.max': 'Group name must not exceed 100 characters'
    }),
  description: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),
  parentId: Joi.string()
    .uuid()
    .optional()
    .allow(null)
    .messages({
      'string.guid': 'Invalid parent group ID format'
    }),
  metadata: Joi.object()
    .optional()
    .messages({
      'object.base': 'Metadata must be a valid JSON object'
    })
}).min(1)
  .messages({
    'object.min': 'At least one field must be provided for update'
  });

/**
 * Add member to group schema
 */
const addMemberSchema = Joi.object({
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid user ID format',
      'any.required': 'User ID is required'
    }),
  role: Joi.string()
    .valid('member', 'moderator', 'admin')
    .default('member')
    .messages({
      'any.only': 'Role must be one of: member, moderator, admin'
    })
});

/**
 * UUID parameter schema
 */
const groupIdParamSchema = Joi.object({
  groupId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid group ID format',
      'any.required': 'Group ID is required'
    })
});

module.exports = {
  createGroupSchema,
  updateGroupSchema,
  addMemberSchema,
  groupIdParamSchema
};
