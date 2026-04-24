/**
 * ═══════════════════════════════════════════════════════════
 * LDAP Authentication Strategy
 * Passport strategy for authenticating users via LDAP/Active Directory
 * ═══════════════════════════════════════════════════════════
 */

const { Strategy: CustomStrategy } = require('passport-custom');
const ldapService = require('../services/ldapService');
const { User, LdapConfig, OrganizationMember, Role } = require('../models');
const logger = require('../utils/logger');

/**
 * LDAP Authentication Strategy
 *
 * This strategy authenticates users against an LDAP directory.
 * It can either authenticate against a specific LDAP config (by ID)
 * or find an active LDAP config for the given organization.
 */
class LdapStrategy extends CustomStrategy {
  constructor(options = {}) {
    super(async (req, done) => {
      try {
        const { username, password, ldapConfigId, organizationId } = req.body;

        // Validate inputs
        if (!username || !password) {
          return done(null, false, { message: 'Username and password are required' });
        }

        let ldapConfig;

        // Find LDAP configuration
        if (ldapConfigId) {
          // Use specific LDAP config
          ldapConfig = await LdapConfig.findByPk(ldapConfigId);
        } else if (organizationId) {
          // Find active LDAP config for organization
          ldapConfig = await LdapConfig.findOne({
            where: {
              organizationId,
              status: 'active'
            }
          });
        } else {
          // Try to find a system-wide LDAP config (no organization)
          ldapConfig = await LdapConfig.findOne({
            where: {
              organizationId: null,
              status: 'active'
            }
          });
        }

        if (!ldapConfig) {
          logger.warn('No LDAP configuration found', { username, ldapConfigId, organizationId });
          return done(null, false, { message: 'LDAP authentication not configured' });
        }

        // Authenticate against LDAP
        let ldapResult;
        try {
          ldapResult = await ldapService.authenticateUser(username, password, ldapConfig.id);
        } catch (error) {
          logger.error('LDAP authentication failed', {
            username,
            configId: ldapConfig.id,
            error: error.message
          });
          return done(null, false, { message: error.message });
        }

        if (!ldapResult || !ldapResult.success) {
          return done(null, false, { message: 'Invalid credentials' });
        }

        // Get user attributes from LDAP result
        const attrs = ldapResult.attributes;
        const mapping = ldapConfig.attributeMapping;

        // Find or create user in database
        let user = await User.findOne({
          where: { email: attrs.email },
          include: [
            {
              model: Role,
              as: 'roles'
            }
          ]
        });

        if (!user) {
          // Check if auto-create is enabled
          if (!ldapConfig.autoCreateUsers) {
            logger.warn('LDAP user not found and auto-create disabled', {
              username,
              email: attrs.email
            });
            return done(null, false, { message: 'User account not found' });
          }

          // Create new user
          user = await User.create({
            username: attrs.username,
            email: attrs.email,
            firstName: attrs.firstName || '',
            lastName: attrs.lastName || '',
            displayName: attrs.displayName || `${attrs.firstName} ${attrs.lastName}`,
            phone: attrs.phone || null,
            title: attrs.title || null,
            department: attrs.department || null,
            source: 'ldap',
            sourceId: ldapResult.userDN,
            status: 'active',
            emailVerified: true,
            password: require('crypto').randomBytes(32).toString('hex') // Random password, won't be used
          });

          logger.info('New user created from LDAP', {
            userId: user.id,
            username: user.username,
            email: user.email,
            ldapDN: ldapResult.userDN
          });

          // Add user to organization if configured
          if (ldapConfig.organizationId) {
            await OrganizationMember.create({
              organizationId: ldapConfig.organizationId,
              userId: user.id,
              role: 'member',
              status: 'active'
            });
          }

          // Assign default role if configured
          if (ldapConfig.defaultUserRole) {
            const defaultRole = await Role.findOne({
              where: { name: ldapConfig.defaultUserRole }
            });

            if (defaultRole) {
              await user.addRole(defaultRole);
            }
          }

          // Reload user with associations
          user = await User.findByPk(user.id, {
            include: [
              {
                model: Role,
                as: 'roles'
              }
            ]
          });
        } else {
          // Update existing user if configured
          if (ldapConfig.updateUserOnLogin) {
            await user.update({
              firstName: attrs.firstName || user.firstName,
              lastName: attrs.lastName || user.lastName,
              displayName: attrs.displayName || user.displayName,
              phone: attrs.phone || user.phone,
              title: attrs.title || user.title,
              department: attrs.department || user.department,
              sourceId: ldapResult.userDN
            });

            logger.info('User attributes updated from LDAP', {
              userId: user.id,
              username: user.username
            });
          }

          // Ensure user is active
          if (user.status !== 'active') {
            await user.update({ status: 'active' });
          }
        }

        // Update last login
        await user.update({
          lastLoginAt: new Date(),
          lastLoginIp: req.ip || req.connection.remoteAddress
        });

        logger.info('LDAP authentication successful', {
          userId: user.id,
          username: user.username,
          email: user.email,
          configId: ldapConfig.id
        });

        // Return authenticated user
        return done(null, user);

      } catch (error) {
        logger.error('LDAP strategy error', { error: error.message, stack: error.stack });
        return done(error);
      }
    });

    this.name = 'ldap';
  }
}

module.exports = LdapStrategy;
