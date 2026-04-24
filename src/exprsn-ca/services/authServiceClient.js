/**
 * ═══════════════════════════════════════════════════════════
 * Auth Service Client
 * Client for communicating with the Exprsn Auth service
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Auth Service Client
 * Manages communication with the centralized Auth service
 */
class AuthServiceClient {
  constructor() {
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
    this.serviceToken = null;
    this.tokenExpiry = null;
    this.tokenRefreshBuffer = 300000; // 5 minutes before expiry
  }

  /**
   * Get or refresh service token for Auth API calls
   * @returns {Promise<string>} Service token
   */
  async getServiceToken() {
    try {
      // Check if cached token is still valid
      if (this.serviceToken && this.tokenExpiry > Date.now() + this.tokenRefreshBuffer) {
        return this.serviceToken;
      }

      logger.info('Requesting new service token from Auth service');

      // Request new token from Auth service
      const response = await axios.post(
        `${this.authServiceUrl}/api/auth/service-token`,
        {
          serviceName: 'exprsn-ca',
          serviceId: process.env.SERVICE_ID || 'ca-service'
        },
        {
          headers: {
            'X-Service-Key': process.env.SERVICE_KEY || process.env.CA_SERVICE_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.success) {
        this.serviceToken = response.data.token;
        this.tokenExpiry = response.data.expiresAt || (Date.now() + 3600000); // Default 1 hour

        logger.info('Service token obtained successfully', {
          expiresAt: new Date(this.tokenExpiry).toISOString()
        });

        return this.serviceToken;
      } else {
        throw new Error('Failed to obtain service token');
      }
    } catch (error) {
      logger.error('Error obtaining service token', {
        error: error.message,
        authServiceUrl: this.authServiceUrl
      });
      throw new Error(`AUTH_SERVICE_UNAVAILABLE: ${error.message}`);
    }
  }

  /**
   * Authenticate user credentials
   * @param {string} username - Username or email
   * @param {string} password - User password
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} User object if authenticated
   */
  async authenticateUser(username, password, options = {}) {
    try {
      logger.info('Authenticating user via Auth service', { username });

      const response = await axios.post(
        `${this.authServiceUrl}/api/auth/login`,
        {
          username,
          password,
          ...options
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response.data && response.data.success) {
        logger.info('User authenticated successfully', {
          userId: response.data.user?.id,
          username
        });

        return {
          success: true,
          user: response.data.user,
          token: response.data.token,
          sessionId: response.data.sessionId
        };
      } else {
        return {
          success: false,
          error: response.data?.error || 'AUTHENTICATION_FAILED',
          message: response.data?.message || 'Invalid credentials'
        };
      }
    } catch (error) {
      logger.error('User authentication failed', {
        username,
        error: error.message
      });

      if (error.response) {
        return {
          success: false,
          error: error.response.data?.error || 'AUTHENTICATION_FAILED',
          message: error.response.data?.message || 'Authentication failed'
        };
      }

      throw new Error(`AUTH_SERVICE_ERROR: ${error.message}`);
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User object
   */
  async getUser(userId) {
    try {
      const token = await this.getServiceToken();

      const response = await axios.get(
        `${this.authServiceUrl}/api/users/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.success) {
        return response.data.user;
      } else {
        throw new Error('User not found');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }

      logger.error('Error fetching user', {
        userId,
        error: error.message
      });

      throw new Error(`Failed to fetch user: ${error.message}`);
    }
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object>} User object
   */
  async getUserByEmail(email) {
    try {
      const token = await this.getServiceToken();

      const response = await axios.get(
        `${this.authServiceUrl}/api/users/by-email/${encodeURIComponent(email)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.success) {
        return response.data.user;
      } else {
        return null;
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }

      logger.error('Error fetching user by email', {
        email,
        error: error.message
      });

      throw new Error(`Failed to fetch user: ${error.message}`);
    }
  }

  /**
   * Create new user in Auth service
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user object
   */
  async createUser(userData) {
    try {
      const token = await this.getServiceToken();

      logger.info('Creating user in Auth service', {
        email: userData.email,
        username: userData.username
      });

      const response = await axios.post(
        `${this.authServiceUrl}/api/users`,
        userData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response.data && response.data.success) {
        logger.info('User created successfully', {
          userId: response.data.user?.id,
          email: userData.email
        });

        return response.data.user;
      } else {
        throw new Error(response.data?.message || 'Failed to create user');
      }
    } catch (error) {
      logger.error('Error creating user', {
        email: userData.email,
        error: error.message
      });

      if (error.response) {
        throw new Error(error.response.data?.message || 'Failed to create user');
      }

      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Update user in Auth service
   * @param {string} userId - User ID
   * @param {Object} updates - User updates
   * @returns {Promise<Object>} Updated user object
   */
  async updateUser(userId, updates) {
    try {
      const token = await this.getServiceToken();

      logger.info('Updating user in Auth service', { userId });

      const response = await axios.put(
        `${this.authServiceUrl}/api/users/${userId}`,
        updates,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response.data && response.data.success) {
        logger.info('User updated successfully', { userId });
        return response.data.user;
      } else {
        throw new Error(response.data?.message || 'Failed to update user');
      }
    } catch (error) {
      logger.error('Error updating user', {
        userId,
        error: error.message
      });

      if (error.response) {
        throw new Error(error.response.data?.message || 'Failed to update user');
      }

      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  /**
   * Get user roles
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of role objects
   */
  async getUserRoles(userId) {
    try {
      const token = await this.getServiceToken();

      const response = await axios.get(
        `${this.authServiceUrl}/api/users/${userId}/roles`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.success) {
        return response.data.roles || [];
      } else {
        return [];
      }
    } catch (error) {
      logger.error('Error fetching user roles', {
        userId,
        error: error.message
      });

      return [];
    }
  }

  /**
   * Assign role to user
   * @param {string} userId - User ID
   * @param {string} roleId - Role ID
   * @returns {Promise<boolean>} Success status
   */
  async assignRole(userId, roleId) {
    try {
      const token = await this.getServiceToken();

      logger.info('Assigning role to user', { userId, roleId });

      const response = await axios.post(
        `${this.authServiceUrl}/api/users/${userId}/roles`,
        { roleId },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data?.success || false;
    } catch (error) {
      logger.error('Error assigning role', {
        userId,
        roleId,
        error: error.message
      });

      return false;
    }
  }

  /**
   * Validate session token
   * @param {string} sessionToken - Session token to validate
   * @returns {Promise<Object>} Validation result with user data
   */
  async validateSession(sessionToken) {
    try {
      const response = await axios.post(
        `${this.authServiceUrl}/api/auth/validate-session`,
        { sessionToken },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.success) {
        return {
          valid: true,
          user: response.data.user,
          session: response.data.session
        };
      } else {
        return {
          valid: false,
          error: response.data?.error || 'INVALID_SESSION'
        };
      }
    } catch (error) {
      logger.error('Error validating session', {
        error: error.message
      });

      return {
        valid: false,
        error: 'SESSION_VALIDATION_FAILED'
      };
    }
  }

  /**
   * Logout user session
   * @param {string} sessionToken - Session token
   * @returns {Promise<boolean>} Success status
   */
  async logout(sessionToken) {
    try {
      const response = await axios.post(
        `${this.authServiceUrl}/api/auth/logout`,
        { sessionToken },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data?.success || false;
    } catch (error) {
      logger.error('Error logging out', {
        error: error.message
      });

      return false;
    }
  }

  /**
   * Check if Auth service is available
   * @returns {Promise<boolean>} Availability status
   */
  async isAvailable() {
    try {
      const response = await axios.get(
        `${this.authServiceUrl}/health`,
        {
          timeout: 5000
        }
      );

      return response.status === 200;
    } catch (error) {
      logger.warn('Auth service unavailable', {
        url: this.authServiceUrl,
        error: error.message
      });

      return false;
    }
  }

  /**
   * Get service health and statistics
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    try {
      const token = await this.getServiceToken();

      const response = await axios.get(
        `${this.authServiceUrl}/api/health`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      return response.data || { status: 'unknown' };
    } catch (error) {
      logger.error('Error fetching Auth service health', {
        error: error.message
      });

      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new AuthServiceClient();
