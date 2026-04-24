/**
 * ═══════════════════════════════════════════════════════════
 * OAuth2 Routes
 * OAuth2 provider endpoints (authorization code flow)
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const OAuth2Server = require('oauth2-server');
const { asyncHandler, AppError, logger } = require('@exprsn/shared');
const oauth2Service = require('../services/oauth2Service');
const config = require('../config');

const router = express.Router();

// Initialize OAuth2 Server
const oauth2Server = new OAuth2Server({
  model: {
    getClient: oauth2Service.getClient,
    saveAuthorizationCode: oauth2Service.saveAuthorizationCode,
    getAuthorizationCode: oauth2Service.getAuthorizationCode,
    revokeAuthorizationCode: oauth2Service.revokeAuthorizationCode,
    saveToken: oauth2Service.saveToken,
    getAccessToken: oauth2Service.getAccessToken,
    getRefreshToken: oauth2Service.getRefreshToken,
    revokeToken: oauth2Service.revokeToken,
    verifyScope: oauth2Service.verifyScope,
    generateAuthorizationCode: oauth2Service.generateAuthorizationCode,
    generateAccessToken: oauth2Service.generateAccessToken,
    generateRefreshToken: oauth2Service.generateRefreshToken
  },
  ...config.oauth2
});

/**
 * GET /api/oauth2/authorize
 * OAuth2 authorization endpoint
 */
router.get('/authorize', asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user) {
    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?returnUrl=${returnUrl}`);
  }

  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const code = await oauth2Server.authorize(request, response, {
      authenticateHandler: {
        handle: () => req.user
      }
    });

    logger.info('Authorization code granted', {
      userId: req.user.id,
      clientId: req.query.client_id
    });

    // Redirect to client with authorization code
    const redirectUri = req.query.redirect_uri;
    const state = req.query.state;

    let redirectUrl = `${redirectUri}?code=${code.authorizationCode}`;
    if (state) {
      redirectUrl += `&state=${state}`;
    }

    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Authorization error', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(error.code || 500).json({
      error: error.name || 'server_error',
      error_description: error.message
    });
  }
}));

/**
 * POST /api/oauth2/authorize
 * OAuth2 authorization endpoint (for consent form)
 */
router.post('/authorize', asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user) {
    throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const code = await oauth2Server.authorize(request, response, {
      authenticateHandler: {
        handle: () => req.user
      }
    });

    logger.info('Authorization code granted', {
      userId: req.user.id,
      clientId: req.body.client_id
    });

    res.json({
      authorizationCode: code.authorizationCode,
      redirectUri: code.redirectUri
    });
  } catch (error) {
    logger.error('Authorization error', {
      error: error.message,
      userId: req.user?.id
    });

    throw new AppError(error.message, error.code || 500, error.name || 'AUTHORIZATION_ERROR');
  }
}));

/**
 * POST /api/oauth2/token
 * OAuth2 token endpoint
 */
router.post('/token', asyncHandler(async (req, res) => {
  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const token = await oauth2Server.token(request, response);

    logger.info('OAuth2 token issued', {
      clientId: req.body.client_id,
      grantType: req.body.grant_type
    });

    res.json({
      access_token: token.accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor((token.accessTokenExpiresAt - new Date()) / 1000),
      refresh_token: token.refreshToken,
      scope: token.scope?.join(' ')
    });
  } catch (error) {
    logger.error('Token error', {
      error: error.message,
      grantType: req.body.grant_type
    });

    res.status(error.code || 500).json({
      error: error.name || 'invalid_request',
      error_description: error.message
    });
  }
}));

/**
 * POST /api/oauth2/revoke
 * OAuth2 token revocation endpoint
 */
router.post('/revoke', asyncHandler(async (req, res) => {
  const { token, token_type_hint } = req.body;

  if (!token) {
    throw new AppError('Token required', 400, 'INVALID_REQUEST');
  }

  // Revoke the token
  await oauth2Service.revokeToken({ refreshToken: token });

  logger.info('OAuth2 token revoked');

  res.json({ message: 'Token revoked successfully' });
}));

/**
 * GET /api/oauth2/userinfo
 * OAuth2 UserInfo endpoint (for OpenID Connect compatibility)
 */
router.get('/userinfo', asyncHandler(async (req, res) => {
  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const token = await oauth2Server.authenticate(request, response);

    const user = token.user;

    res.json({
      sub: user.id,
      email: user.email,
      email_verified: user.emailVerified || false,
      name: user.displayName,
      given_name: user.firstName,
      family_name: user.lastName,
      picture: user.avatarUrl
    });
  } catch (error) {
    logger.error('UserInfo error', { error: error.message });

    res.status(error.code || 401).json({
      error: error.name || 'invalid_token',
      error_description: error.message
    });
  }
}));

/**
 * POST /api/oauth2/introspect
 * OAuth2 token introspection endpoint
 */
router.post('/introspect', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.json({ active: false });
  }

  try {
    const tokenData = await oauth2Service.getAccessToken(token);

    if (!tokenData) {
      return res.json({ active: false });
    }

    res.json({
      active: true,
      scope: tokenData.scope?.join(' '),
      client_id: tokenData.client.clientId,
      sub: tokenData.user.id,
      exp: Math.floor(tokenData.accessTokenExpiresAt.getTime() / 1000)
    });
  } catch (error) {
    logger.error('Introspection error', { error: error.message });
    res.json({ active: false });
  }
}));

module.exports = router;
