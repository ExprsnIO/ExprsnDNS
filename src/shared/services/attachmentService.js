/**
 * Unified Attachment Service
 * Provides file attachment functionality for all Exprsn services
 * Integrates with exprsn-filevault for centralized storage
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

class AttachmentService {
  constructor(config = {}) {
    this.fileVaultUrl = config.fileVaultUrl || process.env.FILEVAULT_BASE_URL || 'http://localhost:3007';
    this.serviceName = config.serviceName || 'unknown';
    this.serviceToken = config.serviceToken || process.env.SERVICE_TOKEN;
  }

  /**
   * Upload file to FileVault
   * @param {Object} file - File object or buffer
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} File metadata
   */
  async uploadFile(file, options = {}) {
    try {
      const {
        userId,
        filename,
        mimeType,
        visibility = 'private',
        directory = null,
        tags = [],
        metadata = {}
      } = options;

      const formData = new FormData();

      // Add file data
      if (Buffer.isBuffer(file)) {
        formData.append('file', file, { filename });
      } else if (typeof file === 'string' && fs.existsSync(file)) {
        formData.append('file', fs.createReadStream(file), {
          filename: filename || path.basename(file)
        });
      } else if (file.path) {
        // Multer file object
        formData.append('file', fs.createReadStream(file.path), {
          filename: filename || file.originalname
        });
      } else {
        throw new Error('Invalid file input');
      }

      // Add metadata
      formData.append('userId', userId);
      formData.append('visibility', visibility);
      if (directory) formData.append('directoryId', directory);
      if (tags.length > 0) formData.append('tags', JSON.stringify(tags));
      if (Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify({
          ...metadata,
          uploadedBy: this.serviceName,
          uploadedAt: new Date().toISOString()
        }));
      }

      const response = await axios.post(
        `${this.fileVaultUrl}/api/files`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.serviceToken}`,
            'X-Service-Name': this.serviceName
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      logger.info('File uploaded to FileVault', {
        service: this.serviceName,
        fileId: response.data.id,
        filename: response.data.name
      });

      return this._transformFileResponse(response.data);
    } catch (error) {
      logger.error('Failed to upload file to FileVault', {
        service: this.serviceName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Download file from FileVault
   * @param {string} fileId - File ID
   * @param {Object} options - Download options
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadFile(fileId, options = {}) {
    try {
      const response = await axios.get(
        `${this.fileVaultUrl}/api/files/${fileId}/download`,
        {
          headers: {
            'Authorization': `Bearer ${this.serviceToken}`,
            'X-Service-Name': this.serviceName
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Failed to download file from FileVault', {
        service: this.serviceName,
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileId) {
    try {
      const response = await axios.get(
        `${this.fileVaultUrl}/api/files/${fileId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.serviceToken}`,
            'X-Service-Name': this.serviceName
          }
        }
      );

      return this._transformFileResponse(response.data);
    } catch (error) {
      logger.error('Failed to get file metadata from FileVault', {
        service: this.serviceName,
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete file from FileVault
   * @param {string} fileId - File ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(fileId) {
    try {
      await axios.delete(
        `${this.fileVaultUrl}/api/files/${fileId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.serviceToken}`,
            'X-Service-Name': this.serviceName
          }
        }
      );

      logger.info('File deleted from FileVault', {
        service: this.serviceName,
        fileId
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete file from FileVault', {
        service: this.serviceName,
        fileId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Create share link for file
   * @param {string} fileId - File ID
   * @param {Object} options - Share options
   * @returns {Promise<Object>} Share link data
   */
  async createShareLink(fileId, options = {}) {
    try {
      const {
        expiresAt = null,
        maxDownloads = null,
        password = null
      } = options;

      const response = await axios.post(
        `${this.fileVaultUrl}/api/files/${fileId}/share`,
        {
          expiresAt,
          maxDownloads,
          password
        },
        {
          headers: {
            'Authorization': `Bearer ${this.serviceToken}`,
            'X-Service-Name': this.serviceName
          }
        }
      );

      return {
        id: response.data.id,
        token: response.data.token,
        url: response.data.url,
        expiresAt: response.data.expiresAt,
        maxDownloads: response.data.maxDownloads,
        downloadCount: response.data.downloadCount
      };
    } catch (error) {
      logger.error('Failed to create share link', {
        service: this.serviceName,
        fileId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get file thumbnail
   * @param {string} fileId - File ID
   * @param {Object} options - Thumbnail options
   * @returns {Promise<string>} Thumbnail URL
   */
  async getThumbnailUrl(fileId, options = {}) {
    const {
      width = 200,
      height = 200,
      quality = 80
    } = options;

    return `${this.fileVaultUrl}/api/files/${fileId}/thumbnail?width=${width}&height=${height}&quality=${quality}`;
  }

  /**
   * Get file preview URL
   * @param {string} fileId - File ID
   * @returns {string} Preview URL
   */
  getPreviewUrl(fileId) {
    return `${this.fileVaultUrl}/api/files/${fileId}/preview`;
  }

  /**
   * Get direct download URL
   * @param {string} fileId - File ID
   * @returns {string} Download URL
   */
  getDownloadUrl(fileId) {
    return `${this.fileVaultUrl}/api/files/${fileId}/download`;
  }

  /**
   * Upload multiple files
   * @param {Array} files - Array of file objects
   * @param {Object} commonOptions - Options applied to all files
   * @returns {Promise<Array>} Array of file metadata
   */
  async uploadMultipleFiles(files, commonOptions = {}) {
    const uploads = files.map(file => {
      const options = {
        ...commonOptions,
        filename: file.originalname || file.filename || file.name
      };

      return this.uploadFile(file, options);
    });

    return Promise.all(uploads);
  }

  /**
   * Validate file before upload
   * @param {Object} file - File object
   * @param {Object} rules - Validation rules
   * @returns {Object} Validation result
   */
  validateFile(file, rules = {}) {
    const {
      maxSize = 100 * 1024 * 1024, // 100 MB default
      allowedMimeTypes = [],
      allowedExtensions = [],
      minSize = 0
    } = rules;

    const errors = [];
    const fileSize = file.size || file.length || (file.path && fs.statSync(file.path).size) || 0;
    const mimeType = file.mimetype || file.type || 'application/octet-stream';
    const filename = file.originalname || file.filename || file.name || '';
    const extension = path.extname(filename).toLowerCase();

    // Size validation
    if (fileSize > maxSize) {
      errors.push(`File size ${fileSize} bytes exceeds maximum ${maxSize} bytes`);
    }

    if (fileSize < minSize) {
      errors.push(`File size ${fileSize} bytes is below minimum ${minSize} bytes`);
    }

    // MIME type validation
    if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(mimeType)) {
      errors.push(`MIME type ${mimeType} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }

    // Extension validation
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      errors.push(`File extension ${extension} is not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      file: {
        size: fileSize,
        mimeType,
        filename,
        extension
      }
    };
  }

  /**
   * Generate file hash for deduplication
   * @param {Buffer|string} file - File buffer or path
   * @returns {Promise<string>} SHA-256 hash
   */
  async generateFileHash(file) {
    const hash = crypto.createHash('sha256');

    if (Buffer.isBuffer(file)) {
      hash.update(file);
      return hash.digest('hex');
    }

    if (typeof file === 'string' && fs.existsSync(file)) {
      return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(file);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
      });
    }

    throw new Error('Invalid file input for hashing');
  }

  /**
   * Transform FileVault response to standardized format
   * @private
   */
  _transformFileResponse(fileData) {
    return {
      id: fileData.id,
      filename: fileData.name,
      originalName: fileData.name,
      mimeType: fileData.mimetype,
      size: fileData.size,
      hash: fileData.contentHash,
      url: `${this.fileVaultUrl}/api/files/${fileData.id}/download`,
      previewUrl: `${this.fileVaultUrl}/api/files/${fileData.id}/preview`,
      thumbnailUrl: fileData.thumbnailUrl || this.getThumbnailUrl(fileData.id),
      storageBackend: fileData.storageBackend,
      visibility: fileData.visibility,
      tags: fileData.tags || [],
      metadata: fileData.metadata || {},
      createdAt: fileData.createdAt,
      updatedAt: fileData.updatedAt,
      userId: fileData.userId,
      directoryId: fileData.directoryId,
      currentVersion: fileData.currentVersion
    };
  }
}

/**
 * Create attachment service instance
 * @param {Object} config - Service configuration
 * @returns {AttachmentService} Attachment service instance
 */
function createAttachmentService(config) {
  return new AttachmentService(config);
}

module.exports = {
  AttachmentService,
  createAttachmentService
};
