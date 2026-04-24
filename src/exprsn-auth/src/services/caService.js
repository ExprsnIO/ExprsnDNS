/**
 * ═══════════════════════════════════════════════════════════
 * CA Service Integration
 * Handles Certificate Authority service connectivity
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { createLogger } = require('@exprsn/shared');

const logger = createLogger('ca-service');

class CAService {
  constructor() {
    this.caUrl = process.env.CA_URL || null;
    this.ocspUrl = process.env.OCSP_RESPONDER_URL || null;
    this.isAvailable = false;
    this.lastCheck = null;
  }

  /**
   * Check if CA service is configured
   */
  isConfigured() {
    return !!this.caUrl;
  }

  /**
   * Check if CA service is available
   */
  async checkAvailability(timeout = 5000) {
    if (!this.isConfigured()) {
      logger.warn('CA service not configured (CA_URL not set)');
      return false;
    }

    try {
      const response = await axios.get(`${this.caUrl}/health`, {
        timeout,
        validateStatus: (status) => status === 200
      });

      this.isAvailable = response.data.status === 'ok';
      this.lastCheck = new Date();

      if (this.isAvailable) {
        logger.info('CA service is available', { url: this.caUrl });
      } else {
        logger.warn('CA service responded but is not healthy', {
          url: this.caUrl,
          status: response.data.status
        });
      }

      return this.isAvailable;
    } catch (error) {
      this.isAvailable = false;
      this.lastCheck = new Date();

      if (error.code === 'ECONNREFUSED') {
        logger.error('CA service connection refused', {
          url: this.caUrl,
          message: 'Is the CA service running?'
        });
      } else if (error.code === 'ETIMEDOUT') {
        logger.error('CA service connection timeout', {
          url: this.caUrl,
          timeout
        });
      } else {
        logger.error('CA service check failed', {
          url: this.caUrl,
          error: error.message
        });
      }

      return false;
    }
  }

  /**
   * Get CA service status
   */
  async getStatus() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        available: false,
        url: null,
        message: 'CA service not configured (set CA_URL in environment)'
      };
    }

    const available = await this.checkAvailability();

    return {
      configured: true,
      available,
      url: this.caUrl,
      ocspUrl: this.ocspUrl,
      lastCheck: this.lastCheck,
      message: available
        ? 'CA service is healthy and available'
        : 'CA service is configured but not available'
    };
  }

  /**
   * Wait for CA service to become available
   * @param {number} maxAttempts - Maximum number of attempts
   * @param {number} delayMs - Delay between attempts in milliseconds
   */
  async waitForAvailability(maxAttempts = 10, delayMs = 2000) {
    if (!this.isConfigured()) {
      logger.warn('CA service not configured, skipping availability wait');
      return false;
    }

    logger.info('Waiting for CA service to become available...', {
      maxAttempts,
      delayMs
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.info(`CA service check attempt ${attempt}/${maxAttempts}`);

      const available = await this.checkAvailability();
      if (available) {
        logger.info('CA service is now available');
        return true;
      }

      if (attempt < maxAttempts) {
        logger.info(`Waiting ${delayMs}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    logger.error('CA service did not become available', {
      attempts: maxAttempts,
      url: this.caUrl
    });

    return false;
  }

  /**
   * Initialize CA service integration
   * @param {Object} options - Initialization options
   * @param {boolean} options.required - Whether CA service is required to start
   * @param {boolean} options.wait - Whether to wait for CA service
   * @param {number} options.maxAttempts - Maximum wait attempts
   */
  async initialize(options = {}) {
    const {
      required = false,
      wait = true,
      maxAttempts = 10
    } = options;

    if (!this.isConfigured()) {
      const message = 'CA service not configured (CA_URL not set)';

      if (required) {
        throw new Error(`${message}. CA service is required but not configured.`);
      } else {
        logger.warn(`${message}. Auth service will run without CA integration.`);
        return { available: false, configured: false };
      }
    }

    if (wait) {
      const available = await this.waitForAvailability(maxAttempts);

      if (!available && required) {
        throw new Error(`CA service is required but not available at ${this.caUrl}`);
      }

      return { available, configured: true };
    } else {
      const available = await this.checkAvailability();

      if (!available && required) {
        throw new Error(`CA service is required but not available at ${this.caUrl}`);
      }

      return { available, configured: true };
    }
  }

  /**
   * Request a service token from CA
   */
  async requestServiceToken(options = {}) {
    if (!this.isAvailable) {
      throw new Error('CA service is not available');
    }

    try {
      const response = await axios.post(`${this.caUrl}/api/tokens/service`, options);
      return response.data;
    } catch (error) {
      logger.error('Failed to request service token', { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new CAService();
