/**
 * ═══════════════════════════════════════════════════════════════════════
 * Rate Limiting Middleware - User and Group-specific rate limiting
 * ═══════════════════════════════════════════════════════════════════════
 */

const redis = require('redis');
const { RateLimit, User, Group } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

// Redis client singleton
let redisClient = null;

/**
 * Initialize Redis client
 */
async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  if (!config.cache.enabled) {
    return null;
  }

  try {
    redisClient = redis.createClient({
      host: config.cache.host,
      port: config.cache.port,
      password: config.cache.password,
      db: config.cache.db || 0
    });

    redisClient.on('error', (err) => {
      logger.error('Redis rate limit error:', err);
    });

    await redisClient.connect();
    logger.info('Redis rate limiting client connected');

    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis for rate limiting:', error);
    return null;
  }
}

/**
 * Get rate limit configuration for a user/endpoint combination
 * Checks in order: user-specific > group-specific > global
 */
async function getRateLimitConfig(userId, userGroups = [], endpoint = null) {
  const configs = [];

  // Get user-specific rate limits
  if (userId) {
    const userLimits = await RateLimit.findAll({
      where: {
        targetType: 'user',
        targetId: userId,
        enabled: true
      },
      order: [['priority', 'DESC']]
    });
    configs.push(...userLimits);
  }

  // Get group-specific rate limits
  if (userGroups.length > 0) {
    const groupIds = userGroups.map(g => g.id || g);
    const groupLimits = await RateLimit.findAll({
      where: {
        targetType: 'group',
        targetId: groupIds,
        enabled: true
      },
      order: [['priority', 'DESC']]
    });
    configs.push(...groupLimits);
  }

  // Get global rate limits
  const globalLimits = await RateLimit.findAll({
    where: {
      targetType: 'global',
      targetId: null,
      enabled: true
    },
    order: [['priority', 'DESC']]
  });
  configs.push(...globalLimits);

  // Filter by endpoint if specified
  if (endpoint) {
    const matchingConfig = configs.find(config => {
      if (!config.endpoint) return true; // Applies to all endpoints

      // Convert wildcard pattern to regex
      const pattern = config.endpoint
        .replace(/\*/g, '.*')
        .replace(/\//g, '\\/');
      const regex = new RegExp(`^${pattern}$`);

      return regex.test(endpoint);
    });

    return matchingConfig || configs.find(c => !c.endpoint);
  }

  // Return the highest priority config
  return configs[0] || null;
}

/**
 * Check rate limit using Redis
 */
async function checkRateLimit(key, config) {
  const client = await getRedisClient();

  if (!client) {
    // Fallback to in-memory (not recommended for production)
    logger.warn('Redis not available, rate limiting disabled');
    return { allowed: true, remaining: config.maxRequests };
  }

  try {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const redisKey = `${config.cache.keyPrefix || 'exprsn:ca:'}ratelimit:${key}`;

    // Remove old entries outside the window
    await client.zRemRangeByScore(redisKey, 0, windowStart);

    // Count requests in current window
    const requestCount = await client.zCard(redisKey);

    if (requestCount >= config.maxRequests) {
      // Rate limit exceeded
      const ttl = await client.ttl(redisKey);
      const resetTime = now + (ttl * 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil(ttl)
      };
    }

    // Add current request
    const requestId = `${now}:${Math.random()}`;
    await client.zAdd(redisKey, {
      score: now,
      value: requestId
    });

    // Set expiry on the key
    await client.expire(redisKey, Math.ceil(config.windowMs / 1000));

    return {
      allowed: true,
      remaining: config.maxRequests - requestCount - 1,
      limit: config.maxRequests,
      windowMs: config.windowMs
    };
  } catch (error) {
    logger.error('Rate limit check failed:', error);
    // On error, allow the request
    return { allowed: true, remaining: config.maxRequests };
  }
}

/**
 * Rate limiting middleware factory
 */
function rateLimiter(options = {}) {
  return async (req, res, next) => {
    try {
      const endpoint = req.path;
      let userId = null;
      let userGroups = [];

      // Extract user information from session or token
      if (req.session && req.session.userId) {
        userId = req.session.userId;

        // Load user groups for group-level rate limits
        const user = await User.findByPk(userId, {
          include: [{ model: Group, as: 'groups' }]
        });

        if (user && user.groups) {
          userGroups = user.groups;
        }
      } else if (req.user) {
        userId = req.user.id;
        userGroups = req.user.groups || [];
      }

      // Get applicable rate limit configuration
      const config = await getRateLimitConfig(userId, userGroups, endpoint);

      if (!config) {
        // No rate limit configured, allow request
        return next();
      }

      // Generate rate limit key
      const identifier = userId || req.ip;
      const key = `${endpoint}:${identifier}`;

      // Check rate limit
      const result = await checkRateLimit(key, config);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit || config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining || 0);

      if (result.windowMs) {
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + result.windowMs).toISOString());
      }

      if (!result.allowed) {
        // Rate limit exceeded
        res.setHeader('Retry-After', result.retryAfter || Math.ceil(config.windowMs / 1000));

        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: config.message || 'Too many requests, please try again later',
          retryAfter: result.retryAfter,
          limit: config.maxRequests,
          windowMs: config.windowMs
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter middleware error:', error);
      // On error, allow the request
      next();
    }
  };
}

/**
 * Create default global rate limits
 */
async function createDefaultRateLimits() {
  try {
    // Check if global limits exist
    const existingGlobal = await RateLimit.findOne({
      where: { targetType: 'global', endpoint: null }
    });

    if (!existingGlobal) {
      // Create default global rate limit
      await RateLimit.create({
        targetType: 'global',
        targetId: null,
        endpoint: null,
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        enabled: true,
        message: 'Too many requests from this IP, please try again later'
      });

      logger.info('Created default global rate limit');
    }

    // Create default authentication rate limit
    const existingAuth = await RateLimit.findOne({
      where: { targetType: 'global', endpoint: '/auth/*' }
    });

    if (!existingAuth) {
      await RateLimit.create({
        targetType: 'global',
        targetId: null,
        endpoint: '/auth/*',
        windowMs: 900000, // 15 minutes
        maxRequests: 5,
        enabled: true,
        message: 'Too many authentication attempts, please try again later'
      });

      logger.info('Created default authentication rate limit');
    }

    // Create default token validation rate limit
    const existingTokenValidation = await RateLimit.findOne({
      where: { targetType: 'global', endpoint: '/api/tokens/validate' }
    });

    if (!existingTokenValidation) {
      await RateLimit.create({
        targetType: 'global',
        targetId: null,
        endpoint: '/api/tokens/validate',
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        enabled: true,
        skipSuccessful: false,
        message: 'Too many token validation requests'
      });

      logger.info('Created default token validation rate limit');
    }
  } catch (error) {
    logger.error('Failed to create default rate limits:', error);
  }
}

/**
 * Close Redis connection
 */
async function closeRedis() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    logger.info('Redis rate limiting client disconnected');
  }
}

module.exports = {
  rateLimiter,
  getRateLimitConfig,
  checkRateLimit,
  createDefaultRateLimits,
  getRedisClient,
  closeRedis
};
