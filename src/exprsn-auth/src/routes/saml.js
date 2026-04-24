/**
 * ═══════════════════════════════════════════════════════════
 * SAML Routes
 * SAML 2.0 SSO authentication endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const passport = require('passport');
const { asyncHandler, AppError, logger } = require('@exprsn/shared');
const { getSamlService } = require('../services/samlService');
const tokenService = require('../services/tokenService');
const samlConfig = require('../config/saml');

const router = express.Router();

/**
 * GET /api/saml/metadata
 * Get SAML metadata XML for Service Provider
 */
router.get('/metadata', asyncHandler(async (req, res) => {
  if (!samlConfig.enabled) {
    throw new AppError('SAML is not enabled', 503, 'SAML_DISABLED');
  }

  const idpKey = req.query.idp || 'default';
  const samlService = await getSamlService();

  const metadata = await samlService.generateMetadata(idpKey);

  res.type('application/xml');
  res.send(metadata);
}));

/**
 * GET /api/saml/login
 * Initiate SAML login
 */
router.get('/login', asyncHandler(async (req, res) => {
  if (!samlConfig.enabled) {
    throw new AppError('SAML is not enabled', 503, 'SAML_DISABLED');
  }

  const idpKey = req.query.idp || 'default';
  const samlService = await getSamlService();

  try {
    // Get the strategy config to build the auth request URL
    const strategyConfig = samlConfig.getSamlStrategyConfig(idpKey);

    // Store relay state for post-login redirect
    const relayState = req.query.redirect || '/';
    req.session.samlRelayState = relayState;
    req.session.samlIdpKey = idpKey;

    // Redirect to SAML authentication using passport
    const authenticator = `saml-${idpKey}`;

    passport.authenticate(authenticator, {
      additionalParams: req.query.additionalParams || {}
    })(req, res);

  } catch (error) {
    logger.error('Failed to initiate SAML login', {
      idpKey,
      error: error.message
    });
    throw new AppError('Failed to initiate SAML login', 500, 'SAML_LOGIN_FAILED');
  }
}));

/**
 * POST /api/saml/callback
 * SAML Assertion Consumer Service (ACS)
 * Handles SAML response from IdP
 */
router.post('/callback', asyncHandler(async (req, res, next) => {
  if (!samlConfig.enabled) {
    throw new AppError('SAML is not enabled', 503, 'SAML_DISABLED');
  }

  const idpKey = req.session.samlIdpKey || 'default';
  const authenticator = `saml-${idpKey}`;

  passport.authenticate(authenticator, async (err, user, info) => {
    try {
      if (err) {
        logger.error('SAML authentication error', {
          idpKey,
          error: err.message
        });
        throw new AppError('SAML authentication failed', 401, 'SAML_AUTH_FAILED');
      }

      if (!user) {
        logger.warn('SAML authentication failed - no user', { idpKey, info });
        throw new AppError(
          info?.message || 'SAML authentication failed',
          401,
          'SAML_AUTH_FAILED'
        );
      }

      // Log user in
      req.login(user, async (err) => {
        if (err) {
          logger.error('Failed to establish session', {
            userId: user.id,
            error: err.message
          });
          throw new AppError('Failed to establish session', 500, 'SESSION_FAILED');
        }

        logger.info('User logged in via SAML', {
          userId: user.id,
          email: user.email,
          idpKey
        });

        // Generate CA token
        const token = await tokenService.generateToken(user);

        // Get relay state (redirect URL)
        const relayState = req.session.samlRelayState || '/';
        delete req.session.samlRelayState;
        delete req.session.samlIdpKey;

        // Check if this is an API request or browser request
        if (req.accepts('json') && !req.accepts('html')) {
          // API request - return JSON
          res.json({
            message: 'SAML login successful',
            user: user.toSafeObject(),
            token,
            redirect: relayState
          });
        } else {
          // Browser request - redirect to frontend
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const redirectUrl = `${frontendUrl}/auth/callback?token=${token}&redirect=${encodeURIComponent(relayState)}`;
          res.redirect(redirectUrl);
        }
      });
    } catch (error) {
      next(error);
    }
  })(req, res, next);
}));

/**
 * GET /api/saml/logout
 * Initiate SAML logout
 */
router.get('/logout', asyncHandler(async (req, res) => {
  if (!samlConfig.enabled) {
    throw new AppError('SAML is not enabled', 503, 'SAML_DISABLED');
  }

  if (!req.user) {
    throw new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const idpKey = req.query.idp || 'default';
  const samlService = await getSamlService();

  try {
    // Only perform SAML logout if user was authenticated via SAML
    if (req.user.samlNameId && req.user.samlSessionIndex) {
      // Create SAML logout request
      const logoutRequest = await samlService.createLogoutRequest(req.user, idpKey);

      // Store user ID for logout callback
      req.session.samlLogoutUserId = req.user.id;

      logger.info('Initiating SAML logout', {
        userId: req.user.id,
        idpKey
      });

      // Redirect to IdP logout
      res.redirect(logoutRequest);
    } else {
      // User wasn't authenticated via SAML, just logout locally
      const userId = req.user.id;
      req.logout((err) => {
        if (err) {
          logger.error('Logout error', { error: err.message, userId });
          throw new AppError('Logout failed', 500, 'LOGOUT_FAILED');
        }

        logger.info('User logged out (non-SAML)', { userId });

        res.json({ message: 'Logout successful' });
      });
    }
  } catch (error) {
    logger.error('Failed to initiate SAML logout', {
      userId: req.user.id,
      idpKey,
      error: error.message
    });
    throw new AppError('Failed to initiate SAML logout', 500, 'SAML_LOGOUT_FAILED');
  }
}));

/**
 * POST /api/saml/logout/callback
 * SAML Single Logout Service (SLS)
 * Handles logout response from IdP
 */
router.post('/logout/callback', asyncHandler(async (req, res) => {
  if (!samlConfig.enabled) {
    throw new AppError('SAML is not enabled', 503, 'SAML_DISABLED');
  }

  const idpKey = req.query.idp || 'default';
  const samlService = await getSamlService();

  try {
    // Validate logout response
    await samlService.validateLogoutResponse(req.body.SAMLResponse, idpKey);

    // Get user ID from session
    const userId = req.session.samlLogoutUserId;

    // Destroy session
    req.logout((err) => {
      if (err) {
        logger.error('Logout error', { error: err.message, userId });
        throw new AppError('Logout failed', 500, 'LOGOUT_FAILED');
      }

      logger.info('SAML logout completed', { userId, idpKey });

      // Redirect to frontend logout page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/logout?status=success`);
    });
  } catch (error) {
    logger.error('Failed to handle SAML logout callback', {
      idpKey,
      error: error.message
    });
    throw new AppError('Failed to complete SAML logout', 500, 'SAML_LOGOUT_CALLBACK_FAILED');
  }
}));

/**
 * GET /api/saml/providers
 * Get list of available SAML identity providers
 */
router.get('/providers', asyncHandler(async (req, res) => {
  if (!samlConfig.enabled) {
    throw new AppError('SAML is not enabled', 503, 'SAML_DISABLED');
  }

  const samlService = await getSamlService();
  const providers = samlService.getIdentityProviders();

  res.json({
    providers,
    count: providers.length
  });
}));

/**
 * GET /api/saml/status
 * Get SAML service status
 */
router.get('/status', asyncHandler(async (req, res) => {
  const status = {
    enabled: samlConfig.enabled,
    configured: false,
    providers: []
  };

  if (samlConfig.enabled) {
    try {
      const samlService = await getSamlService();
      status.configured = true;
      status.providers = samlService.getIdentityProviders();
    } catch (error) {
      status.error = error.message;
    }
  }

  res.json(status);
}));

module.exports = router;
