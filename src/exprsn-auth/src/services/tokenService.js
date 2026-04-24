/**
 * ═══════════════════════════════════════════════════════════
 * Token Service
 * Generates and validates CA tokens
 * See: TOKEN_SPECIFICATION_V1.0.md Section 8 & 9
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { logger } = require('@exprsn/shared');
const config = require('../config');

/**
 * Generate CA token for authenticated user
 * @param {Object} user - User object
 * @param {Object} options - Token generation options
 * @returns {Promise<string>} CA token
 */
async function generateToken(user, options = {}) {
  try {
    const {
      permissions = { read: true, write: true, append: true, update: true, delete: false },
      resourceType = 'url',
      resourceValue = '*',
      expiryType = 'time',
      expirySeconds = config.tokenDefaults.expirySeconds
    } = options;

    // Get user groups to determine permissions
    const userGroups = await user.getGroups();

    // Aggregate permissions from all groups
    const aggregatedPermissions = userGroups.reduce((acc, group) => {
      return {
        read: acc.read || group.permissions.read,
        write: acc.write || group.permissions.write,
        append: acc.append || group.permissions.append,
        delete: acc.delete || group.permissions.delete,
        update: acc.update || group.permissions.update
      };
    }, permissions);

    // Request token from CA
    const response = await axios.post(
      `${config.ca.url}/api/tokens/generate`,
      {
        userId: user.id,
        permissions: aggregatedPermissions,
        resourceType,
        resourceValue,
        expiryType,
        expirySeconds,
        tokenData: {
          email: user.email,
          displayName: user.displayName,
          groups: userGroups.map(g => g.name)
        }
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': 'exprsn-auth'
        }
      }
    );

    logger.info('CA token generated', {
      userId: user.id,
      tokenId: response.data.token?.id
    });

    return response.data.token;
  } catch (error) {
    logger.error('Failed to generate CA token', {
      error: error.message,
      userId: user.id
    });

    throw new Error('Failed to generate authentication token');
  }
}

/**
 * Validate CA token
 * @param {string} token - Token to validate
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
async function validateToken(token, options = {}) {
  try {
    const {
      requiredPermissions = { read: true },
      resource = null
    } = options;

    const response = await axios.post(
      `${config.ca.url}/api/tokens/validate`,
      {
        token,
        requiredPermissions,
        resource
      },
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': 'exprsn-auth'
        }
      }
    );

    return response.data;
  } catch (error) {
    logger.error('Token validation error', { error: error.message });
    throw error;
  }
}

/**
 * Revoke CA token
 * @param {string} tokenId - Token ID to revoke
 * @param {string} reason - Revocation reason
 * @returns {Promise<void>}
 */
async function revokeToken(tokenId, reason = 'User logout') {
  try {
    await axios.post(
      `${config.ca.url}/api/tokens/${tokenId}/revoke`,
      { reason },
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': 'exprsn-auth'
        }
      }
    );

    logger.info('Token revoked', { tokenId, reason });
  } catch (error) {
    logger.error('Failed to revoke token', {
      error: error.message,
      tokenId
    });
    throw error;
  }
}

module.exports = {
  generateToken,
  validateToken,
  revokeToken
};
