/**
 * ═══════════════════════════════════════════════════════════
 * Rate Limiting Middleware
 * Redis-backed rate limiting for Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Initialize Redis client for rate limiting
 */
async function initRedisClient() {
  if (process.env.REDIS_ENABLED !== 'true') {
    return null;
  }

  try {
    redisClient = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected for rate limiting');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.warn('Failed to connect to Redis, rate limiting will use memory store', {
      error: error.message
    });
    return null;
  }
}

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Limit each IP to 100 requests per windowMs
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  const limiterConfig = {
    windowMs,
    max,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message
    },
    skipSuccessfulRequests,
    skipFailedRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: req.userId
      });

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message
      });
    }
  };

  // Use Redis store if available
  if (redisClient) {
    limiterConfig.store = new RedisStore({
      // @ts-expect-error - Known issue: the `call` function is not present in @types/redis
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:'
    });
  }

  return rateLimit(limiterConfig);
}

/**
 * Strict rate limiter for sensitive operations
 */
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: 'Too many requests for this operation'
});

/**
 * Standard rate limiter for general API endpoints
 */
const standardLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100
});

/**
 * Relaxed rate limiter for read operations
 */
const relaxedLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300
});

module.exports = {
  initRedisClient,
  createRateLimiter,
  strictLimiter,
  standardLimiter,
  relaxedLimiter
};
