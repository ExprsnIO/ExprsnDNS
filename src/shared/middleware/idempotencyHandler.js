/**
 * ═══════════════════════════════════════════════════════════
 * Idempotency Handler Middleware
 * Prevents duplicate processing of requests using idempotency keys
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

// In-memory cache for idempotency keys (use Redis in production)
const idempotencyCache = new Map();

/**
 * Idempotency middleware using Idempotency-Key header
 * @param {Object} options - Idempotency options
 * @param {number} options.ttl - Time to live in milliseconds (default: 24 hours)
 * @param {Function} options.getKey - Custom function to extract idempotency key
 * @param {Function} options.storage - Custom storage adapter (default: in-memory)
 * @param {boolean} options.required - Whether idempotency key is required
 * @returns {Function} Express middleware
 */
function idempotencyKey(options = {}) {
  const {
    ttl = 24 * 60 * 60 * 1000, // 24 hours
    getKey = null,
    storage = null,
    required = false
  } = options;

  return async (req, res, next) => {
    try {
      // Only apply to state-changing methods
      const idempotentMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      if (!idempotentMethods.includes(req.method)) {
        return next();
      }

      // Extract idempotency key
      let key = getKey ? getKey(req) : req.headers['idempotency-key'];

      if (!key) {
        if (required) {
          throw new AppError(
            'Idempotency-Key header required',
            400,
            'IDEMPOTENCY_KEY_REQUIRED'
          );
        }
        return next();
      }

      // Validate key format (should be UUID or similar)
      if (!isValidIdempotencyKey(key)) {
        throw new AppError(
          'Invalid Idempotency-Key format',
          400,
          'INVALID_IDEMPOTENCY_KEY'
        );
      }

      // Create cache key (include user ID for isolation)
      const cacheKey = `idempotency:${req.userId || 'anonymous'}:${key}`;

      // Use custom storage or default in-memory cache
      const store = storage || {
        get: async (k) => idempotencyCache.get(k),
        set: async (k, v) => idempotencyCache.set(k, v),
        has: async (k) => idempotencyCache.has(k)
      };

      // Check if request with this key was already processed
      const exists = await store.has(cacheKey);

      if (exists) {
        const cached = await store.get(cacheKey);

        logger.info('Idempotent request detected', {
          key,
          userId: req.userId,
          path: req.path,
          cachedAt: cached.timestamp
        });

        // Return cached response
        return res.status(cached.statusCode).json(cached.response);
      }

      // Store original res.json to capture response
      const originalJson = res.json.bind(res);

      // Override res.json to cache response
      res.json = function (data) {
        const responseData = {
          statusCode: res.statusCode,
          response: data,
          timestamp: new Date().toISOString()
        };

        // Cache the response
        store.set(cacheKey, responseData).catch(err => {
          logger.error('Failed to cache idempotent response', {
            error: err.message,
            key
          });
        });

        // Schedule cleanup after TTL
        setTimeout(() => {
          idempotencyCache.delete(cacheKey);
        }, ttl);

        logger.info('Idempotent request cached', {
          key,
          userId: req.userId,
          path: req.path,
          statusCode: res.statusCode
        });

        return originalJson(data);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Generate idempotency key for client
 * @returns {string} UUID v4 idempotency key
 */
function generateIdempotencyKey() {
  return crypto.randomUUID();
}

/**
 * Validate idempotency key format
 * @param {string} key - Idempotency key
 * @returns {boolean}
 */
function isValidIdempotencyKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Must be at least 16 characters
  if (key.length < 16) {
    return false;
  }

  // Must be alphanumeric with hyphens
  const validPattern = /^[a-zA-Z0-9-_]+$/;
  return validPattern.test(key);
}

/**
 * Redis-based idempotency storage adapter
 * @param {Object} redisClient - Redis client instance
 * @returns {Object} Storage adapter
 */
function createRedisStorage(redisClient) {
  return {
    async get(key) {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    },

    async set(key, value, ttl = 86400) {
      await redisClient.setex(key, ttl, JSON.stringify(value));
    },

    async has(key) {
      const exists = await redisClient.exists(key);
      return exists === 1;
    },

    async delete(key) {
      await redisClient.del(key);
    }
  };
}

/**
 * Clean up expired idempotency keys (for in-memory storage)
 * @param {number} maxAge - Maximum age in milliseconds
 */
function cleanupExpiredKeys(maxAge = 24 * 60 * 60 * 1000) {
  const now = Date.now();

  for (const [key, value] of idempotencyCache.entries()) {
    const age = now - new Date(value.timestamp).getTime();
    if (age > maxAge) {
      idempotencyCache.delete(key);
      logger.debug('Cleaned up expired idempotency key', { key });
    }
  }
}

/**
 * Request deduplication middleware (simpler alternative to full idempotency)
 * Prevents duplicate requests within a short time window
 * @param {Object} options - Deduplication options
 * @param {number} options.windowMs - Deduplication window in milliseconds
 * @returns {Function} Express middleware
 */
function deduplicateRequests(options = {}) {
  const { windowMs = 1000 } = options; // 1 second default
  const requestHashes = new Map();

  return (req, res, next) => {
    // Only deduplicate state-changing methods
    const methods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!methods.includes(req.method)) {
      return next();
    }

    // Create hash of request
    const requestSignature = {
      userId: req.userId,
      method: req.method,
      path: req.path,
      body: JSON.stringify(req.body)
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(requestSignature))
      .digest('hex');

    // Check if duplicate
    const existing = requestHashes.get(hash);
    const now = Date.now();

    if (existing && (now - existing.timestamp) < windowMs) {
      logger.warn('Duplicate request detected', {
        hash: hash.substring(0, 16),
        userId: req.userId,
        path: req.path,
        timeSinceFirst: now - existing.timestamp
      });

      return res.status(409).json({
        error: 'DUPLICATE_REQUEST',
        message: 'Duplicate request detected, please wait before retrying'
      });
    }

    // Store request hash
    requestHashes.set(hash, { timestamp: now });

    // Clean up after window
    setTimeout(() => {
      requestHashes.delete(hash);
    }, windowMs);

    next();
  };
}

// Schedule periodic cleanup of in-memory cache (every hour)
setInterval(() => {
  cleanupExpiredKeys();
}, 60 * 60 * 1000);

module.exports = {
  idempotencyKey,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  createRedisStorage,
  cleanupExpiredKeys,
  deduplicateRequests
};
