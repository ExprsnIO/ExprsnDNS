/**
 * ═══════════════════════════════════════════════════════════
 * Media Upload & Validation Middleware
 * File upload handling with validation and processing
 * ═══════════════════════════════════════════════════════════
 */

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

/**
 * Allowed MIME types by category
 */
const MIME_TYPES = {
  image: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  video: [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo'
  ],
  audio: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/webm'
  ],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ],
  archive: [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip'
  ]
};

/**
 * File size limits by category (in bytes)
 */
const SIZE_LIMITS = {
  image: 10 * 1024 * 1024,      // 10 MB
  video: 100 * 1024 * 1024,     // 100 MB
  audio: 20 * 1024 * 1024,      // 20 MB
  document: 25 * 1024 * 1024,   // 25 MB
  archive: 50 * 1024 * 1024,    // 50 MB
  default: 5 * 1024 * 1024      // 5 MB
};

/**
 * Configure multer storage (memory storage by default)
 * @param {Object} options - Storage options
 * @returns {Object} Multer storage engine
 */
function configureStorage(options = {}) {
  const { destination = './uploads', useMemoryStorage = true } = options;

  if (useMemoryStorage) {
    return multer.memoryStorage();
  }

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = crypto.randomBytes(16).toString('hex');
      const ext = path.extname(file.originalname);
      const basename = path.basename(file.originalname, ext);
      const sanitized = basename.replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${sanitized}-${uniqueSuffix}${ext}`);
    }
  });
}

/**
 * File filter for allowed types
 * @param {Array<string>} allowedTypes - Allowed media categories or specific MIME types
 * @returns {Function} Multer file filter
 */
function createFileFilter(allowedTypes = ['image']) {
  return (req, file, cb) => {
    // Build list of allowed MIME types
    let allowedMimes = [];

    allowedTypes.forEach(type => {
      if (MIME_TYPES[type]) {
        allowedMimes = allowedMimes.concat(MIME_TYPES[type]);
      } else if (type.includes('/')) {
        // Allow specific MIME type
        allowedMimes.push(type);
      }
    });

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      logger.warn('File upload rejected: Invalid file type', {
        mimetype: file.mimetype,
        originalname: file.originalname,
        allowedTypes
      });

      cb(new AppError(
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
        400,
        'INVALID_FILE_TYPE'
      ), false);
    }
  };
}

/**
 * Create upload middleware with validation
 * @param {Object} options - Upload options
 * @param {string} options.field - Form field name
 * @param {Array<string>} options.allowedTypes - Allowed media types
 * @param {number} options.maxSize - Maximum file size in bytes
 * @param {number} options.maxFiles - Maximum number of files (for array uploads)
 * @param {boolean} options.useMemoryStorage - Use memory storage (default: true)
 * @param {string} options.destination - Destination folder (for disk storage)
 * @returns {Function} Express middleware
 */
function createUploadMiddleware(options = {}) {
  const {
    field = 'file',
    allowedTypes = ['image'],
    maxSize = null,
    maxFiles = 1,
    useMemoryStorage = true,
    destination = './uploads'
  } = options;

  // Determine size limit
  let sizeLimit = maxSize;
  if (!sizeLimit) {
    // Use largest allowed type's limit
    sizeLimit = Math.max(...allowedTypes.map(type => SIZE_LIMITS[type] || SIZE_LIMITS.default));
  }

  const upload = multer({
    storage: configureStorage({ destination, useMemoryStorage }),
    fileFilter: createFileFilter(allowedTypes),
    limits: {
      fileSize: sizeLimit,
      files: maxFiles
    }
  });

  // Return appropriate upload middleware
  if (maxFiles === 1) {
    return upload.single(field);
  } else {
    return upload.array(field, maxFiles);
  }
}

/**
 * Validate uploaded file after multer processing
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware
 */
function validateUploadedFile(options = {}) {
  const {
    required = true,
    maxWidth = null,
    maxHeight = null,
    minWidth = null,
    minHeight = null
  } = options;

  return async (req, res, next) => {
    try {
      // Check if file was uploaded
      if (!req.file && !req.files) {
        if (required) {
          throw new AppError('File upload required', 400, 'FILE_REQUIRED');
        }
        return next();
      }

      const files = req.files || [req.file];

      // Validate each file
      for (const file of files) {
        if (!file) continue;

        // Log upload
        logger.info('File uploaded', {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          userId: req.userId
        });

        // Validate image dimensions if required
        if (file.mimetype.startsWith('image/') &&
            (maxWidth || maxHeight || minWidth || minHeight)) {

          // Note: Actual dimension validation requires image processing library
          // This is a placeholder for dimension validation
          // Implement with sharp, jimp, or similar library in consuming service

          logger.debug('Image dimension validation skipped (implement with sharp/jimp)', {
            filename: file.originalname
          });
        }

        // Attach metadata
        file.uploadedAt = new Date();
        file.uploadedBy = req.userId;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Sanitize filename
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);

  // Remove special characters, keep only alphanumeric, dash, underscore
  const sanitized = basename
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100); // Limit length

  return `${sanitized}${ext}`;
}

/**
 * Generate secure filename with hash
 * @param {string} originalName - Original filename
 * @param {string} userId - User ID
 * @returns {string} Secure filename
 */
function generateSecureFilename(originalName, userId = '') {
  const ext = path.extname(originalName);
  const hash = crypto
    .createHash('sha256')
    .update(`${originalName}${userId}${Date.now()}`)
    .digest('hex')
    .substring(0, 16);

  return `${hash}${ext}`;
}

/**
 * Multer error handler
 * @returns {Function} Express error middleware
 */
function handleMulterError() {
  return (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      logger.warn('Multer error', {
        code: err.code,
        message: err.message,
        field: err.field
      });

      let message = 'File upload error';
      let errorCode = 'UPLOAD_ERROR';

      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          message = 'File too large';
          errorCode = 'FILE_TOO_LARGE';
          break;
        case 'LIMIT_FILE_COUNT':
          message = 'Too many files';
          errorCode = 'TOO_MANY_FILES';
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          message = 'Unexpected file field';
          errorCode = 'UNEXPECTED_FIELD';
          break;
      }

      return res.status(400).json({
        error: errorCode,
        message
      });
    }

    next(err);
  };
}

module.exports = {
  createUploadMiddleware,
  validateUploadedFile,
  handleMulterError,
  sanitizeFilename,
  generateSecureFilename,
  MIME_TYPES,
  SIZE_LIMITS
};
