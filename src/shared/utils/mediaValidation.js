/**
 * ═══════════════════════════════════════════════════════════
 * Media Validation Utilities
 * File, image, video, and media validation helpers
 * ═══════════════════════════════════════════════════════════
 */

const path = require('path');
const { AppError } = require('../middleware/errorHandler');

/**
 * Allowed file extensions by category
 */
const ALLOWED_EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  video: ['.mp4', '.webm', '.ogg', '.mov', '.avi'],
  audio: ['.mp3', '.wav', '.ogg', '.webm', '.m4a'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz']
};

/**
 * Media type categories by MIME type prefix
 */
const MEDIA_CATEGORIES = {
  'image/': 'image',
  'video/': 'video',
  'audio/': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'text/': 'document',
  'application/zip': 'archive'
};

/**
 * Validate file size
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum allowed size in bytes
 * @throws {AppError} If validation fails
 */
function validateFileSize(size, maxSize) {
  if (!size || size === 0) {
    throw new AppError('File is empty', 400, 'EMPTY_FILE');
  }

  if (size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(2);
    const actualMB = (size / (1024 * 1024)).toFixed(2);

    throw new AppError(
      `File too large. Maximum size: ${maxMB}MB, Actual: ${actualMB}MB`,
      400,
      'FILE_TOO_LARGE'
    );
  }
}

/**
 * Validate image dimensions
 * @param {Object} dimensions - Image dimensions
 * @param {number} dimensions.width - Image width
 * @param {number} dimensions.height - Image height
 * @param {Object} constraints - Dimension constraints
 * @param {number} constraints.maxWidth - Maximum width
 * @param {number} constraints.maxHeight - Maximum height
 * @param {number} constraints.minWidth - Minimum width
 * @param {number} constraints.minHeight - Minimum height
 * @throws {AppError} If validation fails
 */
function validateImageDimensions(dimensions, constraints = {}) {
  const { width, height } = dimensions;
  const { maxWidth, maxHeight, minWidth, minHeight } = constraints;

  if (maxWidth && width > maxWidth) {
    throw new AppError(
      `Image width too large. Maximum: ${maxWidth}px, Actual: ${width}px`,
      400,
      'IMAGE_WIDTH_TOO_LARGE'
    );
  }

  if (maxHeight && height > maxHeight) {
    throw new AppError(
      `Image height too large. Maximum: ${maxHeight}px, Actual: ${height}px`,
      400,
      'IMAGE_HEIGHT_TOO_LARGE'
    );
  }

  if (minWidth && width < minWidth) {
    throw new AppError(
      `Image width too small. Minimum: ${minWidth}px, Actual: ${width}px`,
      400,
      'IMAGE_WIDTH_TOO_SMALL'
    );
  }

  if (minHeight && height < minHeight) {
    throw new AppError(
      `Image height too small. Minimum: ${minHeight}px, Actual: ${height}px`,
      400,
      'IMAGE_HEIGHT_TOO_SMALL'
    );
  }
}

/**
 * Validate video format and properties
 * @param {Object} metadata - Video metadata
 * @param {string} metadata.format - Video format/codec
 * @param {number} metadata.duration - Video duration in seconds
 * @param {Object} constraints - Video constraints
 * @param {Array<string>} constraints.allowedFormats - Allowed video formats
 * @param {number} constraints.maxDuration - Maximum duration in seconds
 * @param {number} constraints.minDuration - Minimum duration in seconds
 * @throws {AppError} If validation fails
 */
function validateVideoFormat(metadata, constraints = {}) {
  const { format, duration } = metadata;
  const { allowedFormats, maxDuration, minDuration } = constraints;

  if (allowedFormats && allowedFormats.length > 0) {
    if (!allowedFormats.includes(format)) {
      throw new AppError(
        `Invalid video format. Allowed: ${allowedFormats.join(', ')}`,
        400,
        'INVALID_VIDEO_FORMAT'
      );
    }
  }

  if (maxDuration && duration > maxDuration) {
    throw new AppError(
      `Video too long. Maximum: ${maxDuration}s, Actual: ${duration}s`,
      400,
      'VIDEO_TOO_LONG'
    );
  }

  if (minDuration && duration < minDuration) {
    throw new AppError(
      `Video too short. Minimum: ${minDuration}s, Actual: ${duration}s`,
      400,
      'VIDEO_TOO_SHORT'
    );
  }
}

/**
 * Validate media type (MIME type)
 * @param {string} mimeType - File MIME type
 * @param {Array<string>} allowedTypes - Allowed MIME types or categories
 * @throws {AppError} If validation fails
 */
function validateMediaType(mimeType, allowedTypes = []) {
  if (!mimeType) {
    throw new AppError('Media type not specified', 400, 'MISSING_MEDIA_TYPE');
  }

  // Build list of allowed MIME types
  const allowedMimes = new Set();

  allowedTypes.forEach(type => {
    if (type.includes('/')) {
      // Specific MIME type (e.g., 'image/jpeg')
      allowedMimes.add(type);
    } else if (ALLOWED_EXTENSIONS[type]) {
      // Category (e.g., 'image')
      // Add all MIME types for this category
      Object.keys(MEDIA_CATEGORIES).forEach(mime => {
        if (MEDIA_CATEGORIES[mime] === type || mime.startsWith(type + '/')) {
          allowedMimes.add(mime);
        }
      });
    }
  });

  // Check if MIME type is allowed (exact match or prefix match)
  const isAllowed = Array.from(allowedMimes).some(allowed => {
    return mimeType === allowed || mimeType.startsWith(allowed);
  });

  if (!isAllowed) {
    throw new AppError(
      `Invalid media type. Type: ${mimeType}, Allowed: ${allowedTypes.join(', ')}`,
      400,
      'INVALID_MEDIA_TYPE'
    );
  }
}

/**
 * Validate file extension
 * @param {string} filename - Filename
 * @param {Array<string>} allowedCategories - Allowed file categories
 * @throws {AppError} If validation fails
 */
function validateFileExtension(filename, allowedCategories = ['image']) {
  const ext = path.extname(filename).toLowerCase();

  if (!ext) {
    throw new AppError('File has no extension', 400, 'NO_FILE_EXTENSION');
  }

  // Build list of allowed extensions
  const allowedExts = new Set();
  allowedCategories.forEach(category => {
    if (ALLOWED_EXTENSIONS[category]) {
      ALLOWED_EXTENSIONS[category].forEach(e => allowedExts.add(e));
    } else if (category.startsWith('.')) {
      // Specific extension
      allowedExts.add(category.toLowerCase());
    }
  });

  if (!allowedExts.has(ext)) {
    throw new AppError(
      `Invalid file extension. Extension: ${ext}, Allowed: ${Array.from(allowedExts).join(', ')}`,
      400,
      'INVALID_FILE_EXTENSION'
    );
  }
}

/**
 * Sanitize filename for safe storage
 * @param {string} filename - Original filename
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename, options = {}) {
  const {
    maxLength = 255,
    removeSpaces = true,
    toLowerCase = false,
    preserveExtension = true
  } = options;

  let ext = '';
  let name = filename;

  if (preserveExtension) {
    ext = path.extname(filename);
    name = path.basename(filename, ext);
  }

  // Remove or replace special characters
  name = name.replace(/[^\w\s-]/g, '');

  // Remove or replace spaces
  if (removeSpaces) {
    name = name.replace(/\s+/g, '_');
  }

  // Remove multiple underscores/dashes
  name = name.replace(/[-_]{2,}/g, '_');

  // Convert to lowercase if requested
  if (toLowerCase) {
    name = name.toLowerCase();
    ext = ext.toLowerCase();
  }

  // Trim and limit length
  name = name.trim().substring(0, maxLength - ext.length);

  return `${name}${ext}`;
}

/**
 * Get media category from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string|null} Media category
 */
function getMediaCategory(mimeType) {
  if (!mimeType) return null;

  for (const [mime, category] of Object.entries(MEDIA_CATEGORIES)) {
    if (mimeType.startsWith(mime) || mimeType === mime) {
      return category;
    }
  }

  return 'other';
}

/**
 * Check if file is an image
 * @param {string} mimeType - MIME type
 * @returns {boolean}
 */
function isImage(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

/**
 * Check if file is a video
 * @param {string} mimeType - MIME type
 * @returns {boolean}
 */
function isVideo(mimeType) {
  return mimeType && mimeType.startsWith('video/');
}

/**
 * Check if file is audio
 * @param {string} mimeType - MIME type
 * @returns {boolean}
 */
function isAudio(mimeType) {
  return mimeType && mimeType.startsWith('audio/');
}

/**
 * Format file size to human-readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate complete media file
 * @param {Object} file - File object
 * @param {Object} constraints - Validation constraints
 * @throws {AppError} If validation fails
 */
function validateMediaFile(file, constraints = {}) {
  const {
    allowedTypes = ['image'],
    maxSize = 10 * 1024 * 1024, // 10MB default
    maxWidth = null,
    maxHeight = null,
    minWidth = null,
    minHeight = null,
    allowedFormats = null,
    maxDuration = null
  } = constraints;

  // Validate file exists
  if (!file) {
    throw new AppError('No file provided', 400, 'NO_FILE');
  }

  // Validate file size
  validateFileSize(file.size, maxSize);

  // Validate media type
  validateMediaType(file.mimetype, allowedTypes);

  // Validate file extension
  if (file.originalname) {
    validateFileExtension(file.originalname, allowedTypes);
  }

  // Type-specific validations
  if (isImage(file.mimetype) && (maxWidth || maxHeight || minWidth || minHeight)) {
    // Note: Actual dimension extraction requires image processing library
    // Implement with sharp, jimp, or similar in consuming service
  }

  if (isVideo(file.mimetype) && (allowedFormats || maxDuration)) {
    // Note: Actual metadata extraction requires video processing library
    // Implement with ffprobe or similar in consuming service
  }
}

module.exports = {
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
};
