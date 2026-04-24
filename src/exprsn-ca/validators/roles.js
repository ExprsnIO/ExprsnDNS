/**
 * ═══════════════════════════════════════════════════════════════════════
 * Role Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * Create role schema
 */
const createRoleSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Role name is required',
      'string.max': 'Role name must not exceed 100 characters',
      'any.required': 'Role name is required'
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
  priority: Joi.number()
    .integer()
    .min(0)
    .max(1000)
    .default(0)
    .messages({
      'number.min': 'Priority must be at least 0',
      'number.max': 'Priority must not exceed 1000'
    }),
  permissions: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[a-z0-9:*]+$/)
        .max(200)
    )
    .min(0)
    .max(1000)
    .default([])
    .messages({
      'array.max': 'Maximum 1000 permissions allowed',
      'string.pattern.base': 'Invalid permission format. Use pattern like "resource:action" or "*"',
      'string.max': 'Each permission must not exceed 200 characters'
    }),
  serviceAccess: Joi.object({
    allowedServices: Joi.array()
      .items(Joi.string().max(100))
      .max(100)
      .default([])
      .messages({
        'array.max': 'Maximum 100 allowed services',
        'string.max': 'Service name must not exceed 100 characters'
      }),
    deniedServices: Joi.array()
      .items(Joi.string().max(100))
      .max(100)
      .default([])
      .messages({
        'array.max': 'Maximum 100 denied services',
        'string.max': 'Service name must not exceed 100 characters'
      })
  }).default({ allowedServices: [], deniedServices: [] })
    .messages({
      'object.base': 'Service access must be a valid object'
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
 * Update role schema
 */
const updateRoleSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Role name cannot be empty',
      'string.max': 'Role name must not exceed 100 characters'
    }),
  description: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),
  priority: Joi.number()
    .integer()
    .min(0)
    .max(1000)
    .optional()
    .messages({
      'number.min': 'Priority must be at least 0',
      'number.max': 'Priority must not exceed 1000'
    }),
  permissions: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[a-z0-9:*]+$/)
        .max(200)
    )
    .min(0)
    .max(1000)
    .optional()
    .messages({
      'array.max': 'Maximum 1000 permissions allowed',
      'string.pattern.base': 'Invalid permission format',
      'string.max': 'Each permission must not exceed 200 characters'
    }),
  serviceAccess: Joi.object({
    allowedServices: Joi.array()
      .items(Joi.string().max(100))
      .max(100),
    deniedServices: Joi.array()
      .items(Joi.string().max(100))
      .max(100)
  }).optional()
    .messages({
      'object.base': 'Service access must be a valid object'
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
 * Assign role schema
 */
const assignRoleSchema = Joi.object({
  userId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Invalid user ID format'
    }),
  groupId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Invalid group ID format'
    })
}).xor('userId', 'groupId')
  .messages({
    'object.xor': 'Either userId or groupId must be provided (but not both)'
  });

/**
 * UUID parameter schema
 */
const roleIdParamSchema = Joi.object({
  roleId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid role ID format',
      'any.required': 'Role ID is required'
    })
});

module.exports = {
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
  roleIdParamSchema
};
