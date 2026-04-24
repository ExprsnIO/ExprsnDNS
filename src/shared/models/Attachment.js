/**
 * Generic Attachment Model Factory
 * Can be used by any service to add file attachment capabilities
 * Provides polymorphic association to any entity
 */

const { DataTypes } = require('sequelize');

/**
 * Create Attachment model for a service
 * @param {Sequelize} sequelize - Sequelize instance
 * @param {Object} options - Model options
 * @returns {Model} Attachment model
 */
function createAttachmentModel(sequelize, options = {}) {
  const {
    tableName = 'attachments',
    entityTypes = [], // Array of allowed entity types for this service
    additionalFields = {} // Service-specific fields
  } = options;

  const Attachment = sequelize.define('Attachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Polymorphic association to any entity
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'entity_type',
      comment: 'Type of entity this is attached to (post, ticket, message, etc.)',
      validate: entityTypes.length > 0 ? {
        isIn: [entityTypes]
      } : undefined
    },

    entityId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'entity_id',
      comment: 'ID of the entity this is attached to'
    },

    // FileVault reference
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'file_id',
      comment: 'Reference to file in FileVault'
    },

    // Denormalized file metadata for performance
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'File name'
    },

    originalName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'original_name',
      comment: 'Original filename when uploaded'
    },

    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'mime_type',
      defaultValue: 'application/octet-stream'
    },

    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'file_size',
      defaultValue: 0,
      comment: 'File size in bytes'
    },

    fileUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'file_url',
      comment: 'URL to download file'
    },

    thumbnailUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'thumbnail_url',
      comment: 'URL to thumbnail (for images/videos)'
    },

    previewUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'preview_url',
      comment: 'URL to preview file'
    },

    // Upload metadata
    uploadSource: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'upload_source',
      validate: {
        isIn: [['web', 'mobile', 'api', 'import', 'sync', 'automation']]
      }
    },

    uploadedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'uploaded_by',
      comment: 'User who uploaded the file'
    },

    // Display settings
    displayOrder: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'display_order',
      defaultValue: 0,
      comment: 'Order for displaying multiple attachments'
    },

    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'is_primary',
      defaultValue: false,
      comment: 'Whether this is the primary/featured attachment'
    },

    // Status tracking
    status: {
      type: DataTypes.ENUM('pending', 'active', 'processing', 'failed', 'deleted', 'quarantined'),
      allowNull: false,
      defaultValue: 'active'
    },

    // Media-specific fields
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration in seconds (for audio/video)'
    },

    dimensions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Image/video dimensions { width, height }'
    },

    // Additional metadata
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata (EXIF, tags, etc.)'
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User-provided description'
    },

    altText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'alt_text',
      comment: 'Alternative text for accessibility'
    },

    // Security
    contentHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'content_hash',
      comment: 'SHA-256 hash of file content'
    },

    virusScanStatus: {
      type: DataTypes.ENUM('pending', 'clean', 'infected', 'error'),
      allowNull: true,
      field: 'virus_scan_status'
    },

    virusScanDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'virus_scan_date'
    },

    // Soft delete
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at'
    },

    // Service-specific additional fields
    ...additionalFields

  }, {
    sequelize,
    tableName,
    timestamps: true,
    paranoid: true,
    underscored: true,
    indexes: [
      // Polymorphic lookup
      {
        name: 'idx_attachments_entity',
        fields: ['entity_type', 'entity_id']
      },
      // FileVault reference
      {
        name: 'idx_attachments_file_id',
        fields: ['file_id']
      },
      // User uploads
      {
        name: 'idx_attachments_uploaded_by',
        fields: ['uploaded_by']
      },
      // Status queries
      {
        name: 'idx_attachments_status',
        fields: ['status']
      },
      // Primary attachments
      {
        name: 'idx_attachments_primary',
        fields: ['entity_type', 'entity_id', 'is_primary'],
        where: {
          is_primary: true
        }
      },
      // Time-based queries
      {
        name: 'idx_attachments_created',
        fields: ['created_at']
      }
    ],
    scopes: {
      active: {
        where: {
          status: 'active',
          deletedAt: null
        }
      },
      pending: {
        where: {
          status: 'pending'
        }
      },
      images: {
        where: {
          mimeType: {
            [sequelize.Sequelize.Op.like]: 'image/%'
          }
        }
      },
      videos: {
        where: {
          mimeType: {
            [sequelize.Sequelize.Op.like]: 'video/%'
          }
        }
      },
      documents: {
        where: {
          mimeType: {
            [sequelize.Sequelize.Op.in]: [
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]
          }
        }
      }
    }
  });

  // Instance methods
  Attachment.prototype.isImage = function() {
    return this.mimeType && this.mimeType.startsWith('image/');
  };

  Attachment.prototype.isVideo = function() {
    return this.mimeType && this.mimeType.startsWith('video/');
  };

  Attachment.prototype.isAudio = function() {
    return this.mimeType && this.mimeType.startsWith('audio/');
  };

  Attachment.prototype.isDocument = function() {
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument',
      'application/vnd.ms-',
      'text/'
    ];
    return this.mimeType && docTypes.some(type => this.mimeType.includes(type));
  };

  Attachment.prototype.getFileExtension = function() {
    const parts = this.filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  Attachment.prototype.getFormattedSize = function() {
    const bytes = this.fileSize;
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  Attachment.prototype.toPublicJSON = function() {
    return {
      id: this.id,
      filename: this.filename,
      originalName: this.originalName,
      mimeType: this.mimeType,
      size: this.fileSize,
      formattedSize: this.getFormattedSize(),
      url: this.fileUrl,
      thumbnailUrl: this.thumbnailUrl,
      previewUrl: this.previewUrl,
      isPrimary: this.isPrimary,
      displayOrder: this.displayOrder,
      duration: this.duration,
      dimensions: this.dimensions,
      description: this.description,
      altText: this.altText,
      uploadedBy: this.uploadedBy,
      uploadSource: this.uploadSource,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isImage: this.isImage(),
      isVideo: this.isVideo(),
      isAudio: this.isAudio(),
      isDocument: this.isDocument()
    };
  };

  // Class methods
  Attachment.findByEntity = async function(entityType, entityId, options = {}) {
    return this.findAll({
      where: {
        entityType,
        entityId,
        status: 'active'
      },
      order: [['displayOrder', 'ASC'], ['createdAt', 'ASC']],
      ...options
    });
  };

  Attachment.findPrimaryByEntity = async function(entityType, entityId) {
    return this.findOne({
      where: {
        entityType,
        entityId,
        isPrimary: true,
        status: 'active'
      }
    });
  };

  Attachment.countByEntity = async function(entityType, entityId) {
    return this.count({
      where: {
        entityType,
        entityId,
        status: 'active'
      }
    });
  };

  Attachment.bulkCreateFromFiles = async function(files, entityType, entityId, uploadedBy) {
    const attachments = files.map((file, index) => ({
      entityType,
      entityId,
      fileId: file.id,
      filename: file.filename,
      originalName: file.originalName || file.filename,
      mimeType: file.mimeType,
      fileSize: file.size,
      fileUrl: file.url,
      thumbnailUrl: file.thumbnailUrl,
      previewUrl: file.previewUrl,
      uploadedBy,
      displayOrder: index,
      isPrimary: index === 0, // First file is primary
      contentHash: file.hash,
      metadata: file.metadata || {},
      status: 'active'
    }));

    return this.bulkCreate(attachments);
  };

  return Attachment;
}

module.exports = createAttachmentModel;
