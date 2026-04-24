/**
 * ═══════════════════════════════════════════════════════════
 * Request Validation Middleware
 * ═══════════════════════════════════════════════════════════
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));

    // For API requests, return JSON
    if (req.path.startsWith('/api/')) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors: formattedErrors
      });
    }

    // For web requests, flash errors and redirect back
    req.session.errors = formattedErrors;
    req.session.oldInput = req.body;
    return res.redirect('back');
  }

  next();
}

/**
 * Token generation validation rules
 */
const validateTokenGeneration = [
  body('certificateId').notEmpty().withMessage('Certificate ID is required').isUUID().withMessage('Invalid certificate ID'),
  body('permissions').isObject().withMessage('Permissions must be an object'),
  body('permissions.read').optional().isBoolean().withMessage('Read permission must be boolean'),
  body('permissions.write').optional().isBoolean().withMessage('Write permission must be boolean'),
  body('permissions.append').optional().isBoolean().withMessage('Append permission must be boolean'),
  body('permissions.delete').optional().isBoolean().withMessage('Delete permission must be boolean'),
  body('permissions.update').optional().isBoolean().withMessage('Update permission must be boolean'),
  body('resourceType').isIn(['url', 'did', 'cid']).withMessage('Resource type must be url, did, or cid'),
  body('resourceValue').notEmpty().withMessage('Resource value is required'),
  body('expiryType').isIn(['time', 'use', 'persistent']).withMessage('Expiry type must be time, use, or persistent'),
  body('expirySeconds').optional().isInt({ min: 1 }).withMessage('Expiry seconds must be positive integer'),
  body('maxUses').optional().isInt({ min: 1 }).withMessage('Max uses must be positive integer'),
  handleValidationErrors
];

/**
 * Certificate generation validation rules
 */
const validateCertificateGeneration = [
  body('commonName').notEmpty().withMessage('Common name is required').trim(),
  body('type').isIn(['entity', 'intermediate']).withMessage('Type must be entity or intermediate'),
  body('validityDays').optional().isInt({ min: 1, max: 36500 }).withMessage('Validity must be between 1 and 36500 days'),
  body('parentCertificateId').optional().isUUID().withMessage('Invalid parent certificate ID'),
  body('keySize').optional().isInt().isIn([2048, 3072, 4096]).withMessage('Key size must be 2048, 3072, or 4096'),
  handleValidationErrors
];

/**
 * User registration validation rules
 */
const validateUserRegistration = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('passwordConfirm').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  }),
  body('firstName').optional().trim().isLength({ max: 100 }).withMessage('First name too long'),
  body('lastName').optional().trim().isLength({ max: 100 }).withMessage('Last name too long'),
  handleValidationErrors
];

/**
 * Login validation rules
 */
const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

/**
 * UUID parameter validation
 */
const validateUUIDParam = (paramName = 'id') => [
  param(paramName).isUUID().withMessage(`Invalid ${paramName}`),
  handleValidationErrors
];

/**
 * Pagination validation
 */
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

/**
 * Group creation validation
 */
const validateGroupCreation = [
  body('name').notEmpty().withMessage('Group name is required').trim().isLength({ max: 255 }).withMessage('Name too long'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long'),
  body('parentGroupId').optional().isUUID().withMessage('Invalid parent group ID'),
  handleValidationErrors
];

/**
 * Role creation validation
 */
const validateRoleCreation = [
  body('name').notEmpty().withMessage('Role name is required').trim().isLength({ max: 255 }).withMessage('Name too long'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long'),
  body('permissions').isArray().withMessage('Permissions must be an array'),
  body('permissions.*').isString().withMessage('Each permission must be a string'),
  handleValidationErrors
];

/**
 * Ticket generation validation
 */
const validateTicketGeneration = [
  body('usageLimit').optional().isInt({ min: 1 }).withMessage('Usage limit must be positive integer'),
  body('expirySeconds').optional().isInt({ min: 60 }).withMessage('Expiry must be at least 60 seconds'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  handleValidationErrors
];

/**
 * Certificate revocation validation
 */
const validateCertificateRevocation = [
  body('reason').optional().isIn([
    'unspecified',
    'keyCompromise',
    'cACompromise',
    'affiliationChanged',
    'superseded',
    'cessationOfOperation',
    'certificateHold',
    'removeFromCRL',
    'privilegeWithdrawn',
    'aACompromise'
  ]).withMessage('Invalid revocation reason'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateTokenGeneration,
  validateCertificateGeneration,
  validateUserRegistration,
  validateLogin,
  validateUUIDParam,
  validatePagination,
  validateGroupCreation,
  validateRoleCreation,
  validateTicketGeneration,
  validateCertificateRevocation
};
