/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Shared Package
 * Common utilities and middleware for all Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

// Middleware - Authentication & Authorization
const {
  validateCAToken,
  requirePermissions,
  optionalToken
} = require('./middleware/tokenValidation');

const {
  requireRole,
  requireModerator,
  requireAdmin,
  requirePermission,
  requireOwnerOrAdmin
} = require('./middleware/roleValidator');

// Middleware - Error Handling
const {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler
} = require('./middleware/errorHandler');

// Middleware - Rate Limiting
const {
  initRedisClient,
  createRateLimiter,
  strictLimiter,
  standardLimiter,
  relaxedLimiter
} = require('./middleware/rateLimiter');

// Middleware - Audit Logging
const {
  logAction,
  autoAudit,
  auditLogin,
  auditLogout,
  auditModeration,
  auditFileOperation,
  ActionTypes
} = require('./middleware/auditLogger');

// Middleware - Socket.IO Authentication
const {
  authenticateSocket,
  requireSocketPermission,
  requireRoomMembership,
  requireSocketOwner,
  socketRateLimit
} = require('./middleware/socketAuth');

// Middleware - File Upload & Media Handling
const {
  createUploadMiddleware,
  validateUploadedFile,
  handleMulterError,
  sanitizeFilename: sanitizeUploadFilename,
  generateSecureFilename,
  MIME_TYPES,
  SIZE_LIMITS
} = require('./middleware/mediaHandler');

// Middleware - Idempotency
const {
  idempotencyKey,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  createRedisStorage,
  cleanupExpiredKeys,
  deduplicateRequests
} = require('./middleware/idempotencyHandler');

// Middleware - Tier Validation
const {
  requireFeature,
  checkUsageLimit,
  requireMinTier,
  hasFeatureAccess,
  getFeatureLimitForUser,
  clearCaches: clearTierCaches
} = require('./middleware/tierValidator');

// Utilities - Logging
const logger = require('./utils/logger');
const { createLogger } = require('./utils/logger');

// Utilities - Validation
const {
  validateRequired,
  isValidUUID,
  isValidEmail,
  isValidURL,
  sanitizeString,
  validatePagination,
  validateDateRange
} = require('./utils/validation');

// Utilities - Media Validation
const {
  validateFileSize,
  validateImageDimensions,
  validateVideoFormat,
  validateMediaType,
  validateFileExtension,
  validateMediaFile,
  sanitizeFilename,
  getMediaCategory,
  isImage,
  isVideo,
  isAudio,
  formatFileSize,
  ALLOWED_EXTENSIONS,
  MEDIA_CATEGORIES
} = require('./utils/mediaValidation');

// Utilities - Service-to-Service Tokens
const {
  generateServiceToken,
  serviceRequest,
  generateEndpointToken,
  generateServiceWildcardToken,
  tokenCache,
  ServiceTokenCache
} = require('./utils/serviceToken');

// Utilities - Stripe Integration
const StripeService = require('./utils/stripeService');

// Middleware - WebDAV Support
const {
  WEBDAV_METHODS,
  parseXmlBody,
  optionsHandler,
  generateETag,
  generateMultistatusXml,
  generateCollectionResponse,
  generateResourceResponse,
  parseDepth,
  parseDestination,
  parseOverwrite,
  generateLockResponse,
  parseLockRequest,
  generateProppatchResponse,
  sendWebDAVError
} = require('./middleware/webdav');

// Utilities - WebDAV Lock Manager
const WebDAVLockManager = require('./utils/webdavLockManager');

// Utilities - Expression Engine (JSONLex + Formula Engine)
const expressionEngine = require('./utils/expressionEngine');
const { ExpressionEngine } = require('./utils/expressionEngine');

// Services - File Attachments
const {
  AttachmentService,
  createAttachmentService
} = require('./services/attachmentService');

// Models - Generic Attachment Model
const createAttachmentModel = require('./models/Attachment');

module.exports = {
  // Middleware - Authentication & Authorization
  validateCAToken,
  requirePermissions,
  optionalToken,
  requireRole,
  requireModerator,
  requireAdmin,
  requirePermission,
  requireOwnerOrAdmin,

  // Middleware - Error Handling
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,

  // Middleware - Rate Limiting
  initRedisClient,
  createRateLimiter,
  strictLimiter,
  standardLimiter,
  relaxedLimiter,

  // Middleware - Audit Logging
  logAction,
  autoAudit,
  auditLogin,
  auditLogout,
  auditModeration,
  auditFileOperation,
  ActionTypes,

  // Middleware - Socket.IO Authentication
  authenticateSocket,
  requireSocketPermission,
  requireRoomMembership,
  requireSocketOwner,
  socketRateLimit,

  // Middleware - File Upload & Media Handling
  createUploadMiddleware,
  validateUploadedFile,
  handleMulterError,
  sanitizeUploadFilename,
  generateSecureFilename,
  MIME_TYPES,
  SIZE_LIMITS,

  // Middleware - Idempotency
  idempotencyKey,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  createRedisStorage,
  cleanupExpiredKeys,
  deduplicateRequests,

  // Middleware - Tier Validation
  requireFeature,
  checkUsageLimit,
  requireMinTier,
  hasFeatureAccess,
  getFeatureLimitForUser,
  clearTierCaches,

  // Utilities - Logging
  logger,
  createLogger,

  // Utilities - Validation
  validateRequired,
  isValidUUID,
  isValidEmail,
  isValidURL,
  sanitizeString,
  validatePagination,
  validateDateRange,

  // Utilities - Media Validation
  validateFileSize,
  validateImageDimensions,
  validateVideoFormat,
  validateMediaType,
  validateFileExtension,
  validateMediaFile,
  sanitizeFilename,
  getMediaCategory,
  isImage,
  isVideo,
  isAudio,
  formatFileSize,
  ALLOWED_EXTENSIONS,
  MEDIA_CATEGORIES,

  // Utilities - Service-to-Service Tokens
  generateServiceToken,
  serviceRequest,
  generateEndpointToken,
  generateServiceWildcardToken,
  tokenCache,
  ServiceTokenCache,

  // Utilities - Stripe Integration
  StripeService,

  // Middleware - WebDAV Support
  WEBDAV_METHODS,
  parseXmlBody,
  optionsHandler,
  generateETag,
  generateMultistatusXml,
  generateCollectionResponse,
  generateResourceResponse,
  parseDepth,
  parseDestination,
  parseOverwrite,
  generateLockResponse,
  parseLockRequest,
  generateProppatchResponse,
  sendWebDAVError,

  // Utilities - WebDAV Lock Manager
  WebDAVLockManager,

  // Utilities - Expression Engine
  expressionEngine,
  ExpressionEngine,

  // Services - File Attachments
  AttachmentService,
  createAttachmentService,

  // Models - Generic Attachment Model
  createAttachmentModel
};
