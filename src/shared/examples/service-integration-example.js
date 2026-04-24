/**
 * ═══════════════════════════════════════════════════════════
 * Service Integration Example
 * Complete example of service-to-service communication
 * using CA tokens for the Exprsn ecosystem
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const {
  validateCAToken,
  requirePermissions,
  generateServiceToken,
  generateServiceWildcardToken,
  serviceRequest,
  tokenCache,
  logger
} = require('@exprsn/shared');

// ═══════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════

const config = {
  port: process.env.PORT || 3000,
  serviceName: 'example-service',
  certificateId: process.env.SERVICE_CERT_ID,
  caUrl: process.env.CA_URL || 'http://localhost:3000',
  caAuthToken: process.env.CA_AUTH_TOKEN,

  // Other service URLs
  services: {
    timeline: process.env.TIMELINE_URL || 'http://localhost:3004',
    moderator: process.env.MODERATOR_URL || 'http://localhost:3006',
    filevault: process.env.FILEVAULT_URL || 'http://localhost:3007'
  }
};

// ═══════════════════════════════════════════════════════════
// Express App Setup
// ═══════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

// ═══════════════════════════════════════════════════════════
// Example 1: Incoming Request Validation
// Validate tokens from other services calling this service
// ═══════════════════════════════════════════════════════════

/**
 * Public endpoint - no authentication required
 */
app.get('/api/public/info', (req, res) => {
  res.json({
    service: config.serviceName,
    version: '1.0',
    status: 'operational'
  });
});

/**
 * Protected endpoint - requires valid CA token with read permission
 */
app.get('/api/data',
  validateCAToken({ requiredPermissions: ['read'], caUrl: config.caUrl }),
  (req, res) => {
    // Token validated, user info available in req
    const { userId, permissions, tokenData } = req;

    res.json({
      message: 'Data retrieved successfully',
      requestedBy: userId,
      permissions,
      data: {
        id: '123',
        content: 'Sample data'
      }
    });
  }
);

/**
 * Write endpoint - requires write permission
 */
app.post('/api/data',
  validateCAToken({ requiredPermissions: ['write'], caUrl: config.caUrl }),
  async (req, res) => {
    const { userId } = req;
    const { content } = req.body;

    // Process the data
    const result = {
      id: Date.now().toString(),
      content,
      createdBy: userId,
      createdAt: new Date()
    };

    res.status(201).json({
      message: 'Data created successfully',
      data: result
    });
  }
);

// ═══════════════════════════════════════════════════════════
// Example 2: Calling Another Service (Direct Pattern)
// Generate token and make single request
// ═══════════════════════════════════════════════════════════

/**
 * Post content to Timeline service
 */
async function postToTimeline(userId, content) {
  try {
    logger.info('Posting to Timeline service', { userId, contentLength: content.length });

    // Generate token for Timeline service
    const token = await generateServiceToken({
      certificateId: config.certificateId,
      permissions: { write: true },
      resourceType: 'url',
      resourceValue: `${config.services.timeline}/api/posts`,
      expiryType: 'time',
      expirySeconds: 300, // 5 minutes
      data: {
        originService: config.serviceName,
        userId,
        purpose: 'cross-post'
      }
    }, config.caUrl, config.caAuthToken);

    // Make request to Timeline
    const result = await serviceRequest({
      method: 'POST',
      url: `${config.services.timeline}/api/posts`,
      data: {
        userId,
        content,
        source: config.serviceName,
        visibility: 'public'
      },
      token
    });

    logger.info('Posted to Timeline successfully', { postId: result.id });
    return result;

  } catch (error) {
    logger.error('Failed to post to Timeline', { error: error.message });
    throw new Error(`Timeline post failed: ${error.message}`);
  }
}

// Endpoint that uses the Timeline integration
app.post('/api/posts/cross-post',
  validateCAToken({ requiredPermissions: ['write'], caUrl: config.caUrl }),
  async (req, res) => {
    const { userId } = req;
    const { content } = req.body;

    try {
      const result = await postToTimeline(userId, content);

      res.json({
        message: 'Cross-posted successfully',
        timeline: result
      });
    } catch (error) {
      res.status(500).json({
        error: 'CROSS_POST_FAILED',
        message: error.message
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// Example 3: Cached Token Pattern
// Reuse tokens for multiple requests
// ═══════════════════════════════════════════════════════════

/**
 * Get cached token for Moderator service
 */
async function getModeratorToken() {
  return tokenCache.getOrGenerate(
    'moderator-service-token',
    async () => {
      logger.info('Generating new Moderator service token');

      return generateServiceWildcardToken({
        serviceUrl: config.services.moderator,
        permissions: { write: true },
        expirySeconds: 3600 // 1 hour
      }, config.certificateId, config.caUrl, config.caAuthToken);
    }
  );
}

/**
 * Check content with Moderator service
 */
async function checkContent(content, userId) {
  try {
    const token = await getModeratorToken();

    const result = await serviceRequest({
      method: 'POST',
      url: `${config.services.moderator}/api/check`,
      data: {
        content,
        userId,
        context: {
          service: config.serviceName
        }
      },
      token
    });

    return result;

  } catch (error) {
    logger.error('Content check failed', { error: error.message });
    // Fallback: allow content if moderator unavailable
    return { approved: true, reason: 'moderator_unavailable' };
  }
}

// Endpoint that uses moderation
app.post('/api/posts',
  validateCAToken({ requiredPermissions: ['write'], caUrl: config.caUrl }),
  async (req, res) => {
    const { userId } = req;
    const { content } = req.body;

    // Check content with moderator
    const moderation = await checkContent(content, userId);

    if (!moderation.approved) {
      return res.status(400).json({
        error: 'CONTENT_REJECTED',
        message: 'Content violates community guidelines',
        reason: moderation.reason
      });
    }

    // Content approved, create post
    const post = {
      id: Date.now().toString(),
      userId,
      content,
      createdAt: new Date(),
      moderationScore: moderation.score
    };

    res.status(201).json({
      message: 'Post created successfully',
      post
    });
  }
);

// ═══════════════════════════════════════════════════════════
// Example 4: Batch Operations with Use-Based Tokens
// Generate token for multiple operations
// ═══════════════════════════════════════════════════════════

/**
 * Process batch of content through moderator
 */
async function processBatch(items, batchId) {
  try {
    logger.info('Starting batch processing', { batchId, itemCount: items.length });

    // Generate use-based token for batch
    const token = await generateServiceToken({
      certificateId: config.certificateId,
      permissions: { write: true },
      resourceType: 'url',
      resourceValue: `${config.services.moderator}/api/check`,
      expiryType: 'use',
      maxUses: items.length,
      data: {
        batchId,
        service: config.serviceName
      }
    }, config.caUrl, config.caAuthToken);

    // Process each item
    const results = [];
    for (const item of items) {
      try {
        const result = await serviceRequest({
          method: 'POST',
          url: `${config.services.moderator}/api/check`,
          data: { content: item.content },
          token: JSON.stringify(token) // Send as string
        });

        results.push({
          itemId: item.id,
          approved: result.approved,
          reason: result.reason
        });
      } catch (error) {
        logger.error('Batch item failed', { itemId: item.id, error: error.message });
        results.push({
          itemId: item.id,
          approved: false,
          reason: 'processing_error'
        });
      }
    }

    logger.info('Batch processing complete', { batchId, processed: results.length });
    return results;

  } catch (error) {
    logger.error('Batch processing failed', { batchId, error: error.message });
    throw error;
  }
}

// Endpoint for batch moderation
app.post('/api/batch/moderate',
  validateCAToken({ requiredPermissions: ['write'], caUrl: config.caUrl }),
  async (req, res) => {
    const { items } = req.body;
    const batchId = `batch-${Date.now()}`;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'INVALID_BATCH',
        message: 'Items array is required'
      });
    }

    try {
      const results = await processBatch(items, batchId);

      res.json({
        message: 'Batch processed successfully',
        batchId,
        results,
        summary: {
          total: results.length,
          approved: results.filter(r => r.approved).length,
          rejected: results.filter(r => !r.approved).length
        }
      });
    } catch (error) {
      res.status(500).json({
        error: 'BATCH_FAILED',
        message: error.message
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// Example 5: Multi-Service Orchestration
// Call multiple services in workflow
// ═══════════════════════════════════════════════════════════

/**
 * Get cached token for FileVault service
 */
async function getFileVaultToken() {
  return tokenCache.getOrGenerate(
    'filevault-service-token',
    async () => {
      logger.info('Generating new FileVault service token');

      return generateServiceWildcardToken({
        serviceUrl: config.services.filevault,
        permissions: { read: true },
        expirySeconds: 3600
      }, config.certificateId, config.caUrl, config.caAuthToken);
    }
  );
}

/**
 * Get file metadata from FileVault
 */
async function getFileMetadata(fileId) {
  const token = await getFileVaultToken();

  return await serviceRequest({
    method: 'GET',
    url: `${config.services.filevault}/api/files/${fileId}`,
    token
  });
}

/**
 * Create post with media workflow:
 * 1. Check content with Moderator
 * 2. Fetch media metadata from FileVault
 * 3. Post to Timeline
 */
async function createPostWithMedia(userId, content, mediaIds) {
  try {
    logger.info('Creating post with media', { userId, mediaCount: mediaIds.length });

    // Step 1: Moderate content
    const moderation = await checkContent(content, userId);
    if (!moderation.approved) {
      throw new Error(`Content rejected: ${moderation.reason}`);
    }

    // Step 2: Fetch media metadata (parallel)
    const mediaData = await Promise.all(
      mediaIds.map(id => getFileMetadata(id))
    );

    // Step 3: Post to Timeline with media
    const timelinePost = await postToTimeline(userId, content);

    logger.info('Post with media created successfully', {
      postId: timelinePost.id,
      mediaCount: mediaData.length
    });

    return {
      post: timelinePost,
      media: mediaData,
      moderation
    };

  } catch (error) {
    logger.error('Failed to create post with media', { error: error.message });
    throw error;
  }
}

// Endpoint for rich posts
app.post('/api/posts/rich',
  validateCAToken({ requiredPermissions: ['write'], caUrl: config.caUrl }),
  async (req, res) => {
    const { userId } = req;
    const { content, mediaIds = [] } = req.body;

    try {
      const result = await createPostWithMedia(userId, content, mediaIds);

      res.status(201).json({
        message: 'Rich post created successfully',
        result
      });
    } catch (error) {
      res.status(500).json({
        error: 'POST_CREATION_FAILED',
        message: error.message
      });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════

app.use((error, req, res, next) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});

// ═══════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════

async function startServer() {
  // Validate configuration
  if (!config.certificateId) {
    throw new Error('SERVICE_CERT_ID environment variable is required');
  }

  if (!config.caAuthToken) {
    logger.warn('CA_AUTH_TOKEN not set, token generation may fail');
  }

  // Pre-generate commonly used tokens during startup
  logger.info('Pre-generating service tokens...');

  try {
    await Promise.all([
      getModeratorToken(),
      getFileVaultToken()
    ]);
    logger.info('Service tokens pre-generated successfully');
  } catch (error) {
    logger.warn('Failed to pre-generate some tokens', { error: error.message });
  }

  // Start server
  app.listen(config.port, () => {
    logger.info(`${config.serviceName} listening on port ${config.port}`);
    logger.info('Service configuration:', {
      caUrl: config.caUrl,
      services: config.services
    });
  });
}

// ═══════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  // Clear token cache
  tokenCache.clear();

  process.exit(0);
});

// ═══════════════════════════════════════════════════════════
// Export for Testing
// ═══════════════════════════════════════════════════════════

module.exports = {
  app,
  startServer,
  postToTimeline,
  checkContent,
  processBatch,
  createPostWithMedia
};

// ═══════════════════════════════════════════════════════════
// Run if Main Module
// ═══════════════════════════════════════════════════════════

if (require.main === module) {
  startServer().catch(error => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  });
}
