/**
 * Service Client - Inter-service Communication
 * Handles authenticated requests between Exprsn services
 */

const axios = require('axios');
const { getValidator } = require('./caTokenValidator');

class ServiceClient {
  constructor(options = {}) {
    this.serviceId = options.serviceId || process.env.SERVICE_ID;
    this.serviceToken = options.serviceToken || process.env.SERVICE_TOKEN;
    this.timeout = options.timeout || 10000;
    this.retries = options.retries || 3;

    // Service endpoints
    this.services = {
      ca: process.env.CA_BASE_URL || 'http://localhost:3000',
      auth: process.env.AUTH_BASE_URL || 'http://localhost:3001',
      spark: process.env.SPARK_BASE_URL || 'http://localhost:3002',
      timeline: process.env.TIMELINE_BASE_URL || 'http://localhost:3004',
      prefetch: process.env.PREFETCH_BASE_URL || 'http://localhost:3005',
      moderator: process.env.MODERATOR_BASE_URL || 'http://localhost:3006',
      filevault: process.env.FILEVAULT_BASE_URL || 'http://localhost:3007',
      gallery: process.env.GALLERY_BASE_URL || 'http://localhost:3008',
      live: process.env.LIVE_BASE_URL || 'http://localhost:3009'
    };
  }

  /**
   * Make authenticated request to another service
   * @param {string} service - Target service name
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async request(service, method, path, data = null, options = {}) {
    const baseUrl = this.services[service];

    if (!baseUrl) {
      throw new Error(`Unknown service: ${service}`);
    }

    const url = `${baseUrl}${path}`;

    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-ID': this.serviceId,
        'X-Service-Token': this.serviceToken,
        ...options.headers
      },
      timeout: options.timeout || this.timeout
    };

    if (data) {
      if (method === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }
    }

    let lastError;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await axios(config);
        return response.data;
      } catch (error) {
        lastError = error;

        // Don't retry on 4xx errors
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw this.formatError(error);
        }

        // Exponential backoff
        if (attempt < this.retries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw this.formatError(lastError);
  }

  /**
   * Format error for consistent handling
   */
  formatError(error) {
    if (error.response) {
      return new Error(
        error.response.data?.message ||
        `Service request failed: ${error.response.status}`
      );
    }
    return new Error(`Service unavailable: ${error.message}`);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // CA SERVICE METHODS
  // ============================================================================

  /**
   * Validate token with CA
   */
  async validateToken(tokenId, resource = null) {
    return this.request('ca', 'POST', '/api/tokens/validate', {
      tokenId,
      resource
    });
  }

  /**
   * Get user information from CA
   */
  async getUser(userId) {
    return this.request('ca', 'GET', `/api/users/${userId}`);
  }

  /**
   * Get user's groups from CA
   */
  async getUserGroups(userId) {
    return this.request('ca', 'GET', `/api/users/${userId}/groups`);
  }

  /**
   * Get user's permissions from CA
   */
  async getUserPermissions(userId) {
    return this.request('ca', 'GET', `/api/users/${userId}/permissions`);
  }

  // ============================================================================
  // AUTH SERVICE METHODS
  // ============================================================================

  /**
   * Authenticate user credentials
   */
  async authenticateUser(email, password) {
    return this.request('auth', 'POST', '/api/auth/login', {
      email,
      password
    });
  }

  /**
   * Verify SSO token
   */
  async verifySSOToken(ssoToken) {
    return this.request('auth', 'POST', '/api/auth/verify', {
      token: ssoToken
    });
  }

  /**
   * Create new user session
   */
  async createSession(userId, metadata = {}) {
    return this.request('auth', 'POST', '/api/sessions', {
      userId,
      metadata
    });
  }

  // ============================================================================
  // SPARK SERVICE METHODS (Real-time Messaging)
  // ============================================================================

  /**
   * Send message to user
   */
  async sendMessage(conversationId, senderId, content, type = 'text') {
    return this.request('spark', 'POST', '/api/messages', {
      conversationId,
      senderId,
      content,
      type
    });
  }

  /**
   * Get conversation messages
   */
  async getMessages(conversationId, limit = 50, before = null) {
    return this.request('spark', 'GET', `/api/conversations/${conversationId}/messages`, {
      limit,
      before
    });
  }

  /**
   * Create conversation
   */
  async createConversation(participantIds, type = 'direct', metadata = {}) {
    return this.request('spark', 'POST', '/api/conversations', {
      participants: participantIds,
      type,
      metadata
    });
  }

  // ============================================================================
  // TIMELINE SERVICE METHODS (Social Feed)
  // ============================================================================

  /**
   * Create post
   */
  async createPost(userId, content, visibility = 'public', metadata = {}) {
    return this.request('timeline', 'POST', '/api/posts', {
      userId,
      content,
      visibility,
      metadata
    });
  }

  /**
   * Get user timeline
   */
  async getTimeline(userId, limit = 20, before = null) {
    return this.request('timeline', 'GET', `/api/users/${userId}/timeline`, {
      limit,
      before
    });
  }

  /**
   * Get post by ID
   */
  async getPost(postId) {
    return this.request('timeline', 'GET', `/api/posts/${postId}`);
  }

  /**
   * Like post
   */
  async likePost(postId, userId) {
    return this.request('timeline', 'POST', `/api/posts/${postId}/like`, {
      userId
    });
  }

  /**
   * Repost
   */
  async repost(postId, userId, comment = null) {
    return this.request('timeline', 'POST', `/api/posts/${postId}/repost`, {
      userId,
      comment
    });
  }

  // ============================================================================
  // FILEVAULT SERVICE METHODS (File Storage)
  // ============================================================================

  /**
   * Upload file metadata
   */
  async createFile(userId, filename, mimeType, size, metadata = {}) {
    return this.request('filevault', 'POST', '/api/files', {
      userId,
      filename,
      mimeType,
      size,
      metadata
    });
  }

  /**
   * Get file metadata
   */
  async getFile(fileId) {
    return this.request('filevault', 'GET', `/api/files/${fileId}`);
  }

  /**
   * Get file URL (signed)
   */
  async getFileUrl(fileId, expiresIn = 3600) {
    return this.request('filevault', 'GET', `/api/files/${fileId}/url`, {
      expiresIn
    });
  }

  /**
   * Delete file
   */
  async deleteFile(fileId) {
    return this.request('filevault', 'DELETE', `/api/files/${fileId}`);
  }

  // ============================================================================
  // MODERATOR SERVICE METHODS (Content Moderation)
  // ============================================================================

  /**
   * Submit content for moderation
   */
  async moderateContent(contentId, contentType, content, userId) {
    return this.request('moderator', 'POST', '/api/moderate', {
      contentId,
      contentType,
      content,
      userId
    });
  }

  /**
   * Report content
   */
  async reportContent(contentId, reporterId, reason, description = '') {
    return this.request('moderator', 'POST', '/api/reports', {
      contentId,
      reporterId,
      reason,
      description
    });
  }

  /**
   * Get moderation status
   */
  async getModerationStatus(contentId) {
    return this.request('moderator', 'GET', `/api/moderate/${contentId}`);
  }

  // ============================================================================
  // PREFETCH SERVICE METHODS (Timeline Prefetching)
  // ============================================================================

  /**
   * Prefetch user timeline
   */
  async prefetchTimeline(userId) {
    return this.request('prefetch', 'POST', '/api/prefetch/timeline', {
      userId
    });
  }

  /**
   * Get prefetched timeline
   */
  async getPrefetchedTimeline(userId) {
    return this.request('prefetch', 'GET', `/api/prefetch/timeline/${userId}`);
  }

  // ============================================================================
  // GALLERY SERVICE METHODS (Media Galleries)
  // ============================================================================

  /**
   * Create gallery
   */
  async createGallery(userId, title, description = '', visibility = 'public') {
    return this.request('gallery', 'POST', '/api/galleries', {
      userId,
      title,
      description,
      visibility
    });
  }

  /**
   * Add media to gallery
   */
  async addMediaToGallery(galleryId, fileId, caption = '', order = 0) {
    return this.request('gallery', 'POST', `/api/galleries/${galleryId}/media`, {
      fileId,
      caption,
      order
    });
  }

  /**
   * Get gallery
   */
  async getGallery(galleryId) {
    return this.request('gallery', 'GET', `/api/galleries/${galleryId}`);
  }

  // ============================================================================
  // LIVE SERVICE METHODS (Live Streaming)
  // ============================================================================

  /**
   * Create live stream
   */
  async createStream(userId, title, description = '') {
    return this.request('live', 'POST', '/api/streams', {
      userId,
      title,
      description
    });
  }

  /**
   * Start stream
   */
  async startStream(streamId) {
    return this.request('live', 'POST', `/api/streams/${streamId}/start`);
  }

  /**
   * End stream
   */
  async endStream(streamId) {
    return this.request('live', 'POST', `/api/streams/${streamId}/end`);
  }

  /**
   * Get stream info
   */
  async getStream(streamId) {
    return this.request('live', 'GET', `/api/streams/${streamId}`);
  }

  /**
   * Get active streams
   */
  async getActiveStreams(limit = 20) {
    return this.request('live', 'GET', '/api/streams/active', { limit });
  }
}

/**
 * Singleton instance
 */
let instance = null;

/**
 * Get or create service client instance
 */
function getServiceClient(options = {}) {
  if (!instance) {
    instance = new ServiceClient(options);
  }
  return instance;
}

module.exports = {
  ServiceClient,
  getServiceClient
};
