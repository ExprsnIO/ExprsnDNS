/**
 * ═══════════════════════════════════════════════════════════════════════
 * Certificate Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════
 */

const Joi = require('joi');

/**
 * Common subject fields schema
 */
const subjectSchema = {
  commonName: Joi.string()
    .min(1)
    .max(255)
    .required()
    .messages({
      'string.min': 'Common name is required',
      'string.max': 'Common name must not exceed 255 characters',
      'any.required': 'Common name is required'
    }),
  organization: Joi.string()
    .max(255)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Organization must not exceed 255 characters'
    }),
  organizationalUnit: Joi.string()
    .max(255)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Organizational unit must not exceed 255 characters'
    }),
  country: Joi.string()
    .length(2)
    .uppercase()
    .optional()
    .allow('')
    .messages({
      'string.length': 'Country code must be exactly 2 characters',
      'string.uppercase': 'Country code must be uppercase'
    }),
  state: Joi.string()
    .max(255)
    .optional()
    .allow('')
    .messages({
      'string.max': 'State must not exceed 255 characters'
    }),
  locality: Joi.string()
    .max(255)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Locality must not exceed 255 characters'
    }),
  email: Joi.string()
    .email()
    .optional()
    .allow('')
    .messages({
      'string.email': 'Please provide a valid email address'
    })
};

/**
 * Root certificate generation schema
 */
const generateRootCertificateSchema = Joi.object({
  ...subjectSchema,
  keySize: Joi.number()
    .valid(2048, 4096, 8192)
    .default(4096)
    .messages({
      'any.only': 'Key size must be 2048, 4096, or 8192 bits'
    }),
  validityYears: Joi.number()
    .integer()
    .min(1)
    .max(30)
    .default(10)
    .messages({
      'number.min': 'Validity period must be at least 1 year',
      'number.max': 'Validity period must not exceed 30 years'
    }),
  algorithm: Joi.string()
    .valid('RSA-SHA256', 'RSA-SHA384', 'RSA-SHA512')
    .default('RSA-SHA256')
    .messages({
      'any.only': 'Algorithm must be RSA-SHA256, RSA-SHA384, or RSA-SHA512'
    })
});

/**
 * Intermediate certificate generation schema
 */
const generateIntermediateCertificateSchema = Joi.object({
  ...subjectSchema,
  issuerId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid issuer certificate ID format',
      'any.required': 'Issuer certificate ID is required'
    }),
  keySize: Joi.number()
    .valid(2048, 4096)
    .default(4096)
    .messages({
      'any.only': 'Key size must be 2048 or 4096 bits'
    }),
  validityYears: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(5)
    .messages({
      'number.min': 'Validity period must be at least 1 year',
      'number.max': 'Validity period must not exceed 20 years'
    }),
  algorithm: Joi.string()
    .valid('RSA-SHA256', 'RSA-SHA384', 'RSA-SHA512')
    .default('RSA-SHA256')
    .messages({
      'any.only': 'Algorithm must be RSA-SHA256, RSA-SHA384, or RSA-SHA512'
    })
});

/**
 * Entity/server certificate generation schema
 */
const generateCertificateSchema = Joi.object({
  ...subjectSchema,
  type: Joi.string()
    .valid('entity', 'san', 'code_signing', 'client', 'server')
    .default('entity')
    .messages({
      'any.only': 'Type must be entity, san, code_signing, client, or server'
    }),
  subjectAlternativeNames: Joi.array()
    .items(Joi.string().max(255))
    .max(100)
    .optional()
    .messages({
      'array.max': 'Maximum 100 subject alternative names allowed',
      'string.max': 'Each SAN must not exceed 255 characters'
    }),
  issuerId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Invalid issuer certificate ID format'
    }),
  keySize: Joi.number()
    .valid(2048, 4096)
    .default(2048)
    .messages({
      'any.only': 'Key size must be 2048 or 4096 bits'
    }),
  validityDays: Joi.number()
    .integer()
    .min(1)
    .max(825)
    .default(365)
    .messages({
      'number.min': 'Validity period must be at least 1 day',
      'number.max': 'Validity period must not exceed 825 days (per CA/Browser Forum baseline)'
    }),
  algorithm: Joi.string()
    .valid('RSA-SHA256', 'RSA-SHA384', 'RSA-SHA512')
    .default('RSA-SHA256')
    .messages({
      'any.only': 'Algorithm must be RSA-SHA256, RSA-SHA384, or RSA-SHA512'
    })
});

/**
 * Certificate revocation schema
 */
const revokeCertificateSchema = Joi.object({
  certificateId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid certificate ID format',
      'any.required': 'Certificate ID is required'
    }),
  reason: Joi.string()
    .valid(
      'unspecified',
      'keyCompromise',
      'caCompromise',
      'affiliationChanged',
      'superseded',
      'cessationOfOperation',
      'certificateHold',
      'removeFromCRL',
      'privilegeWithdrawn',
      'aaCompromise'
    )
    .default('unspecified')
    .messages({
      'any.only': 'Invalid revocation reason'
    })
});

/**
 * Certificate signing request (CSR) schema
 */
const certificateSigningRequestSchema = Joi.object({
  csr: Joi.string()
    .pattern(/^-----BEGIN CERTIFICATE REQUEST-----[\s\S]+-----END CERTIFICATE REQUEST-----$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid CSR format. Must be PEM-encoded',
      'any.required': 'CSR is required'
    }),
  validityDays: Joi.number()
    .integer()
    .min(1)
    .max(825)
    .default(365)
    .messages({
      'number.min': 'Validity period must be at least 1 day',
      'number.max': 'Validity period must not exceed 825 days'
    }),
  type: Joi.string()
    .valid('entity', 'san', 'code_signing', 'client', 'server')
    .default('entity')
    .messages({
      'any.only': 'Type must be entity, san, code_signing, client, or server'
    })
});

/**
 * Certificate renewal schema
 */
const renewCertificateSchema = Joi.object({
  certificateId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Invalid certificate ID format',
      'any.required': 'Certificate ID is required'
    }),
  validityDays: Joi.number()
    .integer()
    .min(1)
    .max(825)
    .optional()
    .messages({
      'number.min': 'Validity period must be at least 1 day',
      'number.max': 'Validity period must not exceed 825 days'
    }),
  keySize: Joi.number()
    .valid(2048, 4096)
    .optional()
    .messages({
      'any.only': 'Key size must be 2048 or 4096 bits'
    })
});

module.exports = {
  generateRootCertificateSchema,
  generateIntermediateCertificateSchema,
  generateCertificateSchema,
  revokeCertificateSchema,
  certificateSigningRequestSchema,
  renewCertificateSchema
};
