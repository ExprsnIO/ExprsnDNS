/**
 * ═══════════════════════════════════════════════════════════════════════
 * OCSP (Online Certificate Status Protocol) Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Certificate, RevocationList } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

class OCSPService {
  constructor() {
    this.cache = new Map();
    this.batchQueue = [];
    this.batchTimeout = null;
  }

  /**
   * Check certificate status via OCSP
   * @param {string} serialNumber - Certificate serial number
   * @returns {Promise<Object>} OCSP response
   */
  async checkStatus(serialNumber) {
    try {
      logger.debug('OCSP status check', { serialNumber });

      // Check cache first
      if (config.ocsp.cache.enabled) {
        const cached = this.cache.get(serialNumber);
        if (cached && Date.now() - cached.timestamp < config.ocsp.cache.ttl * 1000) {
          logger.debug('OCSP cache hit', { serialNumber });
          return cached.response;
        }
      }

      // Query database
      const certificate = await Certificate.findOne({
        where: { serialNumber }
      });

      if (!certificate) {
        const response = {
          status: 'unknown',
          serialNumber,
          message: 'Certificate not found'
        };

        this.cacheResponse(serialNumber, response);
        return response;
      }

      // Check if revoked
      const revocation = await RevocationList.findOne({
        where: { serialNumber }
      });

      let response;

      if (revocation) {
        response = {
          status: 'revoked',
          serialNumber,
          revokedAt: revocation.revokedAt,
          reason: revocation.reason,
          message: 'Certificate has been revoked'
        };
      } else if (certificate.status === 'active' && !certificate.isExpired()) {
        response = {
          status: 'good',
          serialNumber,
          validUntil: certificate.notAfter,
          message: 'Certificate is valid'
        };
      } else {
        response = {
          status: 'expired',
          serialNumber,
          expiredAt: certificate.notAfter,
          message: 'Certificate has expired'
        };
      }

      this.cacheResponse(serialNumber, response);

      logger.debug('OCSP status determined', { serialNumber, status: response.status });

      return response;
    } catch (error) {
      logger.error('OCSP check failed:', error);
      throw error;
    }
  }

  /**
   * Batch OCSP check (Section 14.3 of spec)
   * @param {string[]} serialNumbers - Array of certificate serial numbers
   * @returns {Promise<Object[]>} Array of OCSP responses
   */
  async checkStatusBatch(serialNumbers) {
    if (!config.ocsp.batch.enabled) {
      // Fall back to individual checks
      return Promise.all(serialNumbers.map(sn => this.checkStatus(sn)));
    }

    logger.debug('OCSP batch check', { count: serialNumbers.length });

    const results = await Promise.all(
      serialNumbers.map(sn => this.checkStatus(sn))
    );

    return results;
  }

  /**
   * Add to batch queue (for optimization)
   */
  addToBatch(serialNumber, callback) {
    this.batchQueue.push({ serialNumber, callback });

    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Set new timeout
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, config.ocsp.batch.timeout);
  }

  /**
   * Process batched OCSP requests
   */
  async processBatch() {
    const queue = [...this.batchQueue];
    this.batchQueue = [];

    if (queue.length === 0) return;

    logger.debug('Processing OCSP batch', { count: queue.length });

    const serialNumbers = queue.map(item => item.serialNumber);
    const results = await this.checkStatusBatch(serialNumbers);

    // Call callbacks
    queue.forEach((item, index) => {
      item.callback(null, results[index]);
    });
  }

  /**
   * Cache OCSP response
   */
  cacheResponse(serialNumber, response) {
    if (!config.ocsp.cache.enabled) return;

    this.cache.set(serialNumber, {
      response,
      timestamp: Date.now()
    });

    // Limit cache size
    if (this.cache.size > 10000) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 1000).forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('OCSP cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: config.ocsp.cache.enabled,
      ttl: config.ocsp.cache.ttl
    };
  }
}

module.exports = new OCSPService();
