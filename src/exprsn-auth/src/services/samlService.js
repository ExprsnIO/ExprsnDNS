/**
 * ═══════════════════════════════════════════════════════════
 * SAML Service
 * SAML 2.0 Service Provider functionality
 * ═══════════════════════════════════════════════════════════
 */

const { SAML } = require('passport-saml');
const crypto = require('crypto');
const { logger } = require('@exprsn/shared');
const samlConfig = require('../config/saml');
const { User } = require('../models');

class SamlService {
  constructor() {
    this.strategies = new Map();
    this.initialized = false;
  }

  /**
   * Initialize SAML service
   */
  async initialize() {
    if (!samlConfig.enabled) {
      logger.info('SAML is disabled');
      return;
    }

    // Validate configuration
    const validation = samlConfig.validateConfig();
    if (!validation.valid) {
      logger.error('Invalid SAML configuration', { errors: validation.errors });
      throw new Error(`Invalid SAML configuration: ${validation.errors.join(', ')}`);
    }

    // Initialize SAML strategies for each IdP
    for (const [key, idp] of Object.entries(samlConfig.identityProviders)) {
      try {
        const strategyConfig = samlConfig.getSamlStrategyConfig(key);
        const strategy = new SAML(strategyConfig);
        this.strategies.set(key, strategy);
        logger.info('SAML strategy initialized', { idpKey: key, idpName: idp.name });
      } catch (error) {
        logger.error('Failed to initialize SAML strategy', {
          idpKey: key,
          error: error.message
        });
      }
    }

    this.initialized = true;
    logger.info('SAML service initialized', {
      strategies: this.strategies.size
    });
  }

  /**
   * Get SAML strategy by IdP key
   */
  getStrategy(idpKey = 'default') {
    if (!this.initialized) {
      throw new Error('SAML service not initialized');
    }

    const strategy = this.strategies.get(idpKey);
    if (!strategy) {
      throw new Error(`SAML strategy not found: ${idpKey}`);
    }

    return strategy;
  }

  /**
   * Generate SAML metadata XML for Service Provider
   */
  async generateMetadata(idpKey = 'default') {
    try {
      const strategy = this.getStrategy(idpKey);
      const metadata = await strategy.generateServiceProviderMetadata(
        samlConfig.sp.cert,
        samlConfig.sp.cert
      );

      logger.info('SAML metadata generated', { idpKey });
      return metadata;
    } catch (error) {
      logger.error('Failed to generate SAML metadata', {
        idpKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create SAML authentication request
   */
  async createAuthRequest(idpKey = 'default', options = {}) {
    try {
      const strategy = this.getStrategy(idpKey);

      // Generate request
      const request = await new Promise((resolve, reject) => {
        strategy.generateAuthorizeRequest(
          {
            ...options,
            additionalParams: options.additionalParams || {}
          },
          false,
          (err, request) => {
            if (err) {
              reject(err);
            } else {
              resolve(request);
            }
          }
        );
      });

      logger.info('SAML auth request created', { idpKey });
      return request;
    } catch (error) {
      logger.error('Failed to create SAML auth request', {
        idpKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate SAML response
   */
  async validateSAMLResponse(samlResponse, idpKey = 'default') {
    try {
      const strategy = this.getStrategy(idpKey);

      // Validate and extract profile
      const profile = await new Promise((resolve, reject) => {
        strategy.validatePostResponse(
          { SAMLResponse: samlResponse },
          (err, profile, loggedOut) => {
            if (err) {
              reject(err);
            } else {
              resolve({ profile, loggedOut });
            }
          }
        );
      });

      logger.info('SAML response validated', {
        idpKey,
        nameId: profile.profile?.nameID
      });

      return profile;
    } catch (error) {
      logger.error('Failed to validate SAML response', {
        idpKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle SAML response and map to user
   */
  async handleSAMLResponse(samlResponse, idpKey = 'default') {
    try {
      // Validate SAML response
      const { profile, loggedOut } = await this.validateSAMLResponse(samlResponse, idpKey);

      if (loggedOut) {
        logger.info('User logged out via SAML', { idpKey });
        return { loggedOut: true };
      }

      if (!profile) {
        throw new Error('No profile returned from SAML response');
      }

      // Map SAML attributes to user fields
      const userAttributes = this.mapSAMLAttributes(profile);

      // Find or create user
      const user = await this.findOrCreateUser(userAttributes, idpKey);

      logger.info('SAML response handled', {
        idpKey,
        userId: user.id,
        email: user.email
      });

      return { user, profile };
    } catch (error) {
      logger.error('Failed to handle SAML response', {
        idpKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Map SAML attributes to user fields
   */
  mapSAMLAttributes(profile) {
    const attributes = profile.attributes || {};
    const mapping = samlConfig.attributeMapping;

    const mapped = {
      // NameID is typically the email
      email: profile.nameID || this.getAttributeValue(attributes, mapping.email),

      // First name
      firstName: this.getAttributeValue(attributes, mapping.firstName),

      // Last name
      lastName: this.getAttributeValue(attributes, mapping.lastName),

      // Display name
      displayName: this.getAttributeValue(attributes, mapping.displayName) ||
                   profile.nameID ||
                   `${this.getAttributeValue(attributes, mapping.firstName)} ${this.getAttributeValue(attributes, mapping.lastName)}`.trim(),

      // Groups
      groups: this.getAttributeValue(attributes, mapping.groups, true),

      // Organization ID
      organizationId: this.getAttributeValue(attributes, mapping.organizationId),

      // SAML metadata
      samlNameId: profile.nameID,
      samlSessionIndex: profile.sessionIndex,
      samlIssuer: profile.issuer
    };

    // Remove undefined values
    Object.keys(mapped).forEach(key => {
      if (mapped[key] === undefined) {
        delete mapped[key];
      }
    });

    return mapped;
  }

  /**
   * Get attribute value from SAML attributes
   */
  getAttributeValue(attributes, attributeName, multiple = false) {
    if (!attributes || !attributeName) {
      return multiple ? [] : undefined;
    }

    const value = attributes[attributeName];

    if (!value) {
      return multiple ? [] : undefined;
    }

    // Handle array values
    if (Array.isArray(value)) {
      return multiple ? value : value[0];
    }

    return multiple ? [value] : value;
  }

  /**
   * Find or create user from SAML attributes
   */
  async findOrCreateUser(attributes, idpKey) {
    if (!attributes.email) {
      throw new Error('Email is required from SAML response');
    }

    // Find existing user by email
    let user = await User.findOne({
      where: { email: attributes.email }
    });

    if (user) {
      // Update user if configured
      if (samlConfig.options.updateOnLogin) {
        await user.update({
          displayName: attributes.displayName || user.displayName,
          samlNameId: attributes.samlNameId,
          samlSessionIndex: attributes.samlSessionIndex,
          lastLoginAt: new Date()
        });
        logger.info('User updated from SAML', { userId: user.id, email: user.email });
      } else {
        // Just update last login
        await user.update({ lastLoginAt: new Date() });
      }

      return user;
    }

    // Auto-provision new user if configured
    if (!samlConfig.options.autoProvision) {
      throw new Error('User not found and auto-provisioning is disabled');
    }

    // Create new user
    user = await User.create({
      email: attributes.email,
      displayName: attributes.displayName,
      emailVerified: !samlConfig.options.requireEmailVerification, // Trust SAML email
      samlNameId: attributes.samlNameId,
      samlSessionIndex: attributes.samlSessionIndex,
      organizationId: attributes.organizationId || samlConfig.options.defaultOrganizationId,
      lastLoginAt: new Date()
    });

    logger.info('User auto-provisioned from SAML', {
      userId: user.id,
      email: user.email,
      idpKey
    });

    // Map SAML groups to application groups if configured
    if (samlConfig.options.mapGroups && attributes.groups?.length > 0) {
      await this.mapUserGroups(user, attributes.groups);
    }

    return user;
  }

  /**
   * Map SAML groups to application groups
   */
  async mapUserGroups(user, samlGroups) {
    // This is a placeholder - implement based on your group mapping logic
    // You might want to:
    // 1. Find matching groups by name
    // 2. Create groups if they don't exist
    // 3. Add user to groups
    logger.info('Mapping SAML groups', {
      userId: user.id,
      groups: samlGroups
    });
  }

  /**
   * Create SAML logout request
   */
  async createLogoutRequest(user, idpKey = 'default') {
    try {
      const strategy = this.getStrategy(idpKey);

      // Create logout request
      const logoutRequest = await new Promise((resolve, reject) => {
        strategy.generateLogoutRequest(
          {
            nameID: user.samlNameId,
            sessionIndex: user.samlSessionIndex
          },
          (err, request) => {
            if (err) {
              reject(err);
            } else {
              resolve(request);
            }
          }
        );
      });

      logger.info('SAML logout request created', {
        userId: user.id,
        idpKey
      });

      return logoutRequest;
    } catch (error) {
      logger.error('Failed to create SAML logout request', {
        userId: user.id,
        idpKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate SAML logout response
   */
  async validateLogoutResponse(samlResponse, idpKey = 'default') {
    try {
      const strategy = this.getStrategy(idpKey);

      // Validate logout response
      const result = await new Promise((resolve, reject) => {
        strategy.validatePostResponse(
          { SAMLResponse: samlResponse },
          (err, profile, loggedOut) => {
            if (err) {
              reject(err);
            } else {
              resolve({ profile, loggedOut });
            }
          }
        );
      });

      logger.info('SAML logout response validated', { idpKey });
      return result;
    } catch (error) {
      logger.error('Failed to validate SAML logout response', {
        idpKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available identity providers
   */
  getIdentityProviders() {
    return Object.entries(samlConfig.identityProviders).map(([key, idp]) => ({
      key,
      name: idp.name,
      enabled: idp.options?.enabled !== false
    }));
  }
}

// Singleton instance
let samlService = null;

/**
 * Get SAML service instance
 */
async function getSamlService() {
  if (!samlService) {
    samlService = new SamlService();
    await samlService.initialize();
  }
  return samlService;
}

module.exports = {
  getSamlService,
  SamlService
};
