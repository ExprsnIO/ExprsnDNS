/**
 * ═══════════════════════════════════════════════════════════
 * OpenID Connect (OIDC) Routes
 * OIDC provider endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const oidcService = require('../services/oidcService');
const oauth2Service = require('../services/oauth2Service');

/**
 * GET /.well-known/openid-configuration
 * OIDC Discovery endpoint
 */
router.get('/.well-known/openid-configuration', (req, res) => {
  const discovery = oidcService.getDiscoveryDocument();
  res.json(discovery);
});

/**
 * GET /.well-known/jwks.json
 * JSON Web Key Set endpoint
 */
router.get('/.well-known/jwks.json', (req, res) => {
  const jwks = oidcService.getJwks();
  res.json(jwks);
});

/**
 * GET /api/oauth2/userinfo
 * OIDC UserInfo endpoint
 */
router.get('/api/oauth2/userinfo', async (req, res, next) => {
  try {
    // Get access token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'No access token provided'
      });
    }

    const accessToken = authHeader.substring(7);

    const userInfo = await oidcService.getUserInfo(accessToken);

    res.json(userInfo);
  } catch (error) {
    if (error.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'The access token is invalid or expired'
      });
    }

    next(error);
  }
});

/**
 * POST /api/oauth2/introspect
 * Token introspection endpoint (RFC 7662)
 */
router.post('/api/oauth2/introspect', async (req, res, next) => {
  try {
    const { token, token_type_hint } = req.body;

    if (!token) {
      return res.json({
        active: false
      });
    }

    // Get token from database
    const tokenData = token_type_hint === 'refresh_token'
      ? await oauth2Service.getRefreshToken(token)
      : await oauth2Service.getAccessToken(token);

    if (!tokenData) {
      return res.json({
        active: false
      });
    }

    res.json({
      active: true,
      scope: tokenData.scope.join(' '),
      client_id: tokenData.client.clientId,
      username: tokenData.user.email,
      token_type: 'Bearer',
      exp: Math.floor(tokenData.accessTokenExpiresAt.getTime() / 1000),
      iat: Math.floor(new Date(tokenData.createdAt).getTime() / 1000),
      sub: tokenData.user.id,
      aud: tokenData.client.clientId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/oauth2/revoke
 * Token revocation endpoint (RFC 7009)
 */
router.post('/api/oauth2/revoke', async (req, res, next) => {
  try {
    const { token, token_type_hint } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Token parameter is required'
      });
    }

    // Get and revoke token
    const tokenData = token_type_hint === 'refresh_token'
      ? await oauth2Service.getRefreshToken(token)
      : await oauth2Service.getAccessToken(token);

    if (tokenData) {
      await oauth2Service.revokeToken(tokenData);
    }

    // Always return 200 OK (per RFC 7009)
    res.status(200).json({});
  } catch (error) {
    next(error);
  }
});

module.exports = router;
