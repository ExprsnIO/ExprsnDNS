/**
 * ═══════════════════════════════════════════════════════════
 * WebDAV Lock Manager
 * Manages resource locks for WebDAV operations
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

class WebDAVLockManager {
  constructor(redisClient = null) {
    this.locks = new Map(); // In-memory fallback
    this.redis = redisClient;
    this.lockPrefix = 'webdav:lock:';
    this.defaultTimeout = 3600; // 1 hour
  }

  /**
   * Create a new lock
   */
  async createLock(resourceId, userId, options = {}) {
    const token = this.generateLockToken();
    const lock = {
      token,
      resourceId,
      userId,
      scope: options.scope || 'exclusive',
      type: options.type || 'write',
      depth: options.depth || '0',
      owner: options.owner || userId,
      timeout: options.timeout || this.defaultTimeout,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (options.timeout || this.defaultTimeout) * 1000).toISOString()
    };

    if (this.redis) {
      // Store in Redis
      const key = this.lockPrefix + resourceId;
      await this.redis.setex(
        key,
        lock.timeout,
        JSON.stringify(lock)
      );
    } else {
      // Store in memory
      this.locks.set(resourceId, lock);

      // Auto-expire
      setTimeout(() => {
        this.locks.delete(resourceId);
      }, lock.timeout * 1000);
    }

    return lock;
  }

  /**
   * Get lock by resource ID
   */
  async getLock(resourceId) {
    if (this.redis) {
      const key = this.lockPrefix + resourceId;
      const data = await this.redis.get(key);

      if (data) {
        return JSON.parse(data);
      }
      return null;
    } else {
      return this.locks.get(resourceId) || null;
    }
  }

  /**
   * Get lock by token
   */
  async getLockByToken(token) {
    if (this.redis) {
      // Scan for token (inefficient, but rare operation)
      const keys = await this.redis.keys(this.lockPrefix + '*');

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const lock = JSON.parse(data);
          if (lock.token === token) {
            return lock;
          }
        }
      }
      return null;
    } else {
      for (const [, lock] of this.locks) {
        if (lock.token === token) {
          return lock;
        }
      }
      return null;
    }
  }

  /**
   * Refresh/extend a lock
   */
  async refreshLock(token, timeout = null) {
    const lock = await this.getLockByToken(token);

    if (!lock) {
      return null;
    }

    const newTimeout = timeout || this.defaultTimeout;
    lock.timeout = newTimeout;
    lock.expiresAt = new Date(Date.now() + newTimeout * 1000).toISOString();

    if (this.redis) {
      const key = this.lockPrefix + lock.resourceId;
      await this.redis.setex(key, newTimeout, JSON.stringify(lock));
    } else {
      this.locks.set(lock.resourceId, lock);

      setTimeout(() => {
        this.locks.delete(lock.resourceId);
      }, newTimeout * 1000);
    }

    return lock;
  }

  /**
   * Remove a lock
   */
  async removeLock(token, userId) {
    const lock = await this.getLockByToken(token);

    if (!lock) {
      return false;
    }

    // Verify ownership
    if (lock.userId !== userId) {
      throw new Error('LOCK_FORBIDDEN');
    }

    if (this.redis) {
      const key = this.lockPrefix + lock.resourceId;
      await this.redis.del(key);
    } else {
      this.locks.delete(lock.resourceId);
    }

    return true;
  }

  /**
   * Check if resource is locked
   */
  async isLocked(resourceId, userId = null) {
    const lock = await this.getLock(resourceId);

    if (!lock) {
      return false;
    }

    // Check if expired
    if (new Date(lock.expiresAt) < new Date()) {
      await this.removeLock(lock.token, lock.userId);
      return false;
    }

    // If userId is provided, check if it's the lock owner
    if (userId) {
      return lock.userId !== userId;
    }

    return true;
  }

  /**
   * Verify lock token for write operations
   */
  async verifyLockToken(resourceId, token, userId) {
    const lock = await this.getLock(resourceId);

    if (!lock) {
      return true; // No lock, allow operation
    }

    // Check if lock matches
    if (lock.token === token && lock.userId === userId) {
      return true;
    }

    throw new Error('LOCKED');
  }

  /**
   * Generate a lock token
   */
  generateLockToken() {
    return crypto.randomUUID();
  }

  /**
   * Parse lock token from If header
   * Format: If: (<opaquelocktoken:token>)
   */
  parseLockTokenFromHeader(ifHeader) {
    if (!ifHeader) return null;

    const match = ifHeader.match(/opaquelocktoken:([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Clear all locks (for testing/maintenance)
   */
  async clearAllLocks() {
    if (this.redis) {
      const keys = await this.redis.keys(this.lockPrefix + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } else {
      this.locks.clear();
    }
  }
}

module.exports = WebDAVLockManager;
