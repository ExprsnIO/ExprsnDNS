/**
 * ═══════════════════════════════════════════════════════════
 * Passport Configuration
 * Authentication strategies for local and OAuth providers
 * ═══════════════════════════════════════════════════════════
 */

const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const SamlStrategy = require('passport-saml').Strategy;
const bcrypt = require('bcrypt');
const config = require('./index');
const samlConfig = require('./saml');
const { User } = require('../models');
const { logger } = require('@exprsn/shared');

module.exports = function(passport) {
  /**
   * Serialize user for session
   */
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  /**
   * Deserialize user from session
   */
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  /**
   * ═══════════════════════════════════════════════════════════
   * Local Strategy (username/password)
   * ═══════════════════════════════════════════════════════════
   */
  passport.use('local', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  }, async (email, password, done) => {
    try {
      // Find user by email
      const user = await User.findOne({ where: { email } });

      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > Date.now()) {
        return done(null, false, {
          message: 'Account is temporarily locked due to too many failed login attempts'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);

      if (!isValidPassword) {
        // Increment failed login attempts
        await user.incrementLoginAttempts();
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Reset login attempts on successful login
      await user.resetLoginAttempts();

      // Update last login
      user.lastLoginAt = Date.now();
      await user.save();

      logger.info('User logged in successfully', { userId: user.id, email: user.email });

      return done(null, user);
    } catch (error) {
      logger.error('Local authentication error', { error: error.message });
      return done(error);
    }
  }));

  /**
   * ═══════════════════════════════════════════════════════════
   * Google OAuth2 Strategy
   * ═══════════════════════════════════════════════════════════
   */
  if (config.providers.google.clientId && config.providers.google.clientSecret) {
    passport.use('google', new GoogleStrategy({
      clientID: config.providers.google.clientId,
      clientSecret: config.providers.google.clientSecret,
      callbackURL: config.providers.google.callbackURL
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Find or create user
        let user = await User.findOne({
          where: { googleId: profile.id }
        });

        if (!user) {
          // Check if user exists with same email
          user = await User.findOne({
            where: { email: profile.emails[0].value }
          });

          if (user) {
            // Link Google account to existing user
            user.googleId = profile.id;
            await user.save();
          } else {
            // Create new user
            user = await User.create({
              email: profile.emails[0].value,
              googleId: profile.id,
              emailVerified: true,
              displayName: profile.displayName,
              avatarUrl: profile.photos[0]?.value
            });
          }
        }

        user.lastLoginAt = Date.now();
        await user.save();

        logger.info('User logged in via Google', { userId: user.id, email: user.email });

        return done(null, user);
      } catch (error) {
        logger.error('Google authentication error', { error: error.message });
        return done(error);
      }
    }));
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * GitHub OAuth2 Strategy
   * ═══════════════════════════════════════════════════════════
   */
  if (config.providers.github.clientId && config.providers.github.clientSecret) {
    passport.use('github', new GitHubStrategy({
      clientID: config.providers.github.clientId,
      clientSecret: config.providers.github.clientSecret,
      callbackURL: config.providers.github.callbackURL,
      scope: ['user:email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Find or create user
        let user = await User.findOne({
          where: { githubId: profile.id }
        });

        if (!user) {
          const email = profile.emails[0]?.value;

          if (email) {
            // Check if user exists with same email
            user = await User.findOne({ where: { email } });

            if (user) {
              // Link GitHub account to existing user
              user.githubId = profile.id;
              await user.save();
            } else {
              // Create new user
              user = await User.create({
                email,
                githubId: profile.id,
                emailVerified: true,
                displayName: profile.displayName || profile.username,
                avatarUrl: profile.photos[0]?.value
              });
            }
          } else {
            return done(new Error('No email associated with GitHub account'));
          }
        }

        user.lastLoginAt = Date.now();
        await user.save();

        logger.info('User logged in via GitHub', { userId: user.id, email: user.email });

        return done(null, user);
      } catch (error) {
        logger.error('GitHub authentication error', { error: error.message });
        return done(error);
      }
    }));
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * SAML Strategy (Enterprise SSO)
   * ═══════════════════════════════════════════════════════════
   */
  if (samlConfig.enabled) {
    // Register a SAML strategy for each identity provider
    for (const [key, idp] of Object.entries(samlConfig.identityProviders)) {
      if (idp.options?.enabled === false) {
        continue;
      }

      try {
        const strategyConfig = samlConfig.getSamlStrategyConfig(key);

        passport.use(`saml-${key}`, new SamlStrategy(
          strategyConfig,
          async (profile, done) => {
            try {
              // Extract attributes
              const attributes = profile.attributes || {};
              const mapping = samlConfig.attributeMapping;

              // Get email from NameID or attributes
              const email = profile.nameID || getAttributeValue(attributes, mapping.email);

              if (!email) {
                return done(new Error('Email is required from SAML response'));
              }

              // Find or create user
              let user = await User.findOne({ where: { email } });

              if (user) {
                // Update user if configured
                if (samlConfig.options.updateOnLogin) {
                  const displayName = getAttributeValue(attributes, mapping.displayName) ||
                                    profile.nameID ||
                                    user.displayName;

                  await user.update({
                    displayName,
                    samlNameId: profile.nameID,
                    samlSessionIndex: profile.sessionIndex,
                    lastLoginAt: new Date()
                  });

                  logger.info('User updated from SAML', {
                    userId: user.id,
                    email: user.email,
                    idpKey: key
                  });
                } else {
                  // Just update last login
                  await user.update({ lastLoginAt: new Date() });
                }

                return done(null, user);
              }

              // Auto-provision new user if configured
              if (!samlConfig.options.autoProvision) {
                return done(new Error('User not found and auto-provisioning is disabled'));
              }

              // Extract user attributes
              const firstName = getAttributeValue(attributes, mapping.firstName);
              const lastName = getAttributeValue(attributes, mapping.lastName);
              const displayName = getAttributeValue(attributes, mapping.displayName) ||
                                profile.nameID ||
                                `${firstName} ${lastName}`.trim() ||
                                email.split('@')[0];
              const organizationId = getAttributeValue(attributes, mapping.organizationId) ||
                                    samlConfig.options.defaultOrganizationId;

              // Create new user
              user = await User.create({
                email,
                displayName,
                emailVerified: !samlConfig.options.requireEmailVerification,
                samlNameId: profile.nameID,
                samlSessionIndex: profile.sessionIndex,
                organizationId,
                lastLoginAt: new Date()
              });

              logger.info('User auto-provisioned from SAML', {
                userId: user.id,
                email: user.email,
                idpKey: key
              });

              return done(null, user);
            } catch (error) {
              logger.error('SAML authentication error', {
                error: error.message,
                idpKey: key
              });
              return done(error);
            }
          }
        ));

        logger.info('SAML strategy registered', { idpKey: key, idpName: idp.name });
      } catch (error) {
        logger.error('Failed to register SAML strategy', {
          idpKey: key,
          error: error.message
        });
      }
    }
  }
};

/**
 * Helper function to get attribute value from SAML attributes
 */
function getAttributeValue(attributes, attributeName, multiple = false) {
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
