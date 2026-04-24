/**
 * ═══════════════════════════════════════════════════════════════════════
 * Broker Token System for Inter-Service Communication
 *
 * Unlike CA tokens, broker tokens:
 * - Do NOT count against rate limits
 * - Do NOT require CA validation in development mode
 * - Support state management for long-running operations
 * - Include revocation verification
 * - Bypass Auth in development mode
 * ═══════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');

class BrokerTokenManager {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'unknown';
    this.redis = options.redis || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0,
      keyPrefix: 'ipc:broker:'
    });

    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.bypassAuth = this.isDevelopment && process.env.IPC_BYPASS_AUTH !== 'false';

    // Broker token signing key (separate from CA)
    this.signingKey = process.env.IPC_BROKER_KEY || this._generateKey();

    // Token TTL (default: 5 minutes for stateless, unlimited for stateful)
    this.defaultTTL = parseInt(process.env.IPC_TOKEN_TTL) || 300;
  }

  /**
   * Generate a broker token for inter-service communication
   * @param {Object} payload - Token payload
   * @param {Object} options - Token options
   * @returns {Promise<string>} Broker token
   */
  async generateToken(payload = {}, options = {}) {
    const {
      targetService = '*',
      operation = 'ipc',
      stateful = false,
      ttl = this.defaultTTL,
      metadata = {}
    } = options;

    const tokenId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();

    const tokenPayload = {
      // Token identification
      id: tokenId,
      type: 'broker',
      version: '1.0',

      // Service information
      source: this.serviceName,
      target: targetService,
      operation,

      // Timestamps
      iat: Math.floor(timestamp / 1000),
      exp: stateful ? null : Math.floor((timestamp + (ttl * 1000)) / 1000),

      // State management
      stateful,
      stateKey: stateful ? `state:${tokenId}` : null,

      // Rate limiting bypass
      rateLimitExempt: true,
      authBypass: this.bypassAuth,

      // Custom payload
      data: payload,
      metadata
    };

    // Sign the token
    const token = jwt.sign(tokenPayload, this.signingKey, {
      algorithm: 'HS256',
      noTimestamp: true // We manage timestamps manually
    });

    // Store token metadata in Redis
    const redisKey = `token:${tokenId}`;
    const tokenMeta = {
      id: tokenId,
      source: this.serviceName,
      target: targetService,
      operation,
      created: timestamp,
      expires: stateful ? null : timestamp + (ttl * 1000),
      stateful,
      revoked: false
    };

    if (stateful) {
      // Stateful tokens don't expire automatically
      await this.redis.set(redisKey, JSON.stringify(tokenMeta));
    } else {
      await this.redis.setex(redisKey, ttl, JSON.stringify(tokenMeta));
    }

    return token;
  }

  /**
   * Verify and decode a broker token
   * @param {string} token - Token to verify
   * @returns {Promise<Object>} Decoded token payload
   */
  async verifyToken(token) {
    try {
      // Decode without verification first to get token ID
      const decoded = jwt.decode(token);

      if (!decoded || decoded.type !== 'broker') {
        throw new Error('Invalid broker token type');
      }

      // Check revocation status
      const isRevoked = await this.isRevoked(decoded.id);
      if (isRevoked) {
        throw new Error('Token has been revoked');
      }

      // Verify signature
      const verified = jwt.verify(token, this.signingKey, {
        algorithms: ['HS256']
      });

      // Check expiration for non-stateful tokens
      if (!verified.stateful && verified.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (now > verified.exp) {
          throw new Error('Token has expired');
        }
      }

      return verified;
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Revoke a broker token
   * @param {string} tokenId - Token ID to revoke
   * @returns {Promise<boolean>} Success status
   */
  async revokeToken(tokenId) {
    const redisKey = `token:${tokenId}`;
    const tokenData = await this.redis.get(redisKey);

    if (!tokenData) {
      return false; // Token doesn't exist or already expired
    }

    const meta = JSON.parse(tokenData);
    meta.revoked = true;
    meta.revokedAt = Date.now();

    // Update Redis with revocation status
    // Keep revoked tokens for audit trail (24 hours)
    await this.redis.setex(redisKey, 86400, JSON.stringify(meta));

    return true;
  }

  /**
   * Check if token is revoked
   * @param {string} tokenId - Token ID
   * @returns {Promise<boolean>} Revocation status
   */
  async isRevoked(tokenId) {
    const redisKey = `token:${tokenId}`;
    const tokenData = await this.redis.get(redisKey);

    if (!tokenData) {
      return false; // Token doesn't exist (might be expired)
    }

    const meta = JSON.parse(tokenData);
    return meta.revoked === true;
  }

  /**
   * Set/get state for stateful tokens
   */
  async setState(tokenId, state) {
    const stateKey = `state:${tokenId}`;
    await this.redis.set(stateKey, JSON.stringify(state));
  }

  async getState(tokenId) {
    const stateKey = `state:${tokenId}`;
    const state = await this.redis.get(stateKey);
    return state ? JSON.parse(state) : null;
  }

  async deleteState(tokenId) {
    const stateKey = `state:${tokenId}`;
    await this.redis.del(stateKey);
  }

  /**
   * Generate a secure random key
   * @private
   */
  _generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Clean up expired tokens (housekeeping)
   */
  async cleanup() {
    const stream = this.redis.scanStream({
      match: 'token:*',
      count: 100
    });

    let cleaned = 0;
    stream.on('data', async (keys) => {
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const meta = JSON.parse(data);
          if (meta.expires && Date.now() > meta.expires) {
            await this.redis.del(key);
            cleaned++;
          }
        }
      }
    });

    return new Promise((resolve) => {
      stream.on('end', () => resolve(cleaned));
    });
  }
}

module.exports = BrokerTokenManager;
