/**
 * SSO Routes
 * Single Sign-On integration with OAuth2, SAML, and OIDC providers
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { SAML } = require('passport-saml');
const { getServiceClient } = require('../../shared/utils/serviceClient');
const { getModels } = require('../models');
const { authenticate } = require('../../shared/middleware/auth');

const serviceClient = getServiceClient();

/**
 * GET /api/sso/providers
 * List available SSO providers
 */
router.get('/providers', async (req, res) => {
  try {
    const { SSOProvider } = getModels();

    const providers = await SSOProvider.findAll({
      where: { enabled: true },
      attributes: ['id', 'name', 'type', 'metadata']
    });

    res.json({
      success: true,
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        loginUrl: `/api/sso/${p.id}/login`
      }))
    });

  } catch (error) {
    console.error('List providers error:', error);
    res.status(500).json({
      error: 'LIST_PROVIDERS_FAILED',
      message: 'Failed to list SSO providers'
    });
  }
});

/**
 * GET /api/sso/:providerId/login
 * Initiate SSO login flow
 */
router.get('/:providerId/login', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { SSOProvider } = getModels();

    const provider = await SSOProvider.findByPk(providerId);

    if (!provider || !provider.enabled) {
      return res.status(404).json({
        error: 'PROVIDER_NOT_FOUND',
        message: 'SSO provider not found or disabled'
      });
    }

    // Generate state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    req.session.ssoState = state;
    req.session.ssoProviderId = providerId;

    // Build authorization URL based on provider type
    let authUrl;
    switch (provider.type) {
      case 'oauth2':
      case 'oidc':
        authUrl = buildOAuth2Url(provider, state);
        break;
      case 'saml':
        authUrl = buildSAMLRequest(provider);
        break;
      default:
        return res.status(400).json({
          error: 'UNSUPPORTED_PROVIDER_TYPE',
          message: `Provider type ${provider.type} is not supported`
        });
    }

    res.json({
      success: true,
      authUrl,
      state
    });

  } catch (error) {
    console.error('SSO login initiation error:', error);
    res.status(500).json({
      error: 'SSO_LOGIN_FAILED',
      message: 'Failed to initiate SSO login'
    });
  }
});

/**
 * GET /api/sso/:providerId/callback
 * Handle SSO provider callback
 */
router.get('/:providerId/callback', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { code, state, error: oauthError } = req.query;
    const { SSOProvider, Session } = getModels();

    if (oauthError) {
      return res.status(400).json({
        error: 'SSO_ERROR',
        message: `SSO provider returned error: ${oauthError}`
      });
    }

    // Verify state token
    if (state !== req.session.ssoState || providerId !== req.session.ssoProviderId) {
      return res.status(400).json({
        error: 'INVALID_STATE',
        message: 'Invalid SSO state token'
      });
    }

    const provider = await SSOProvider.findByPk(providerId);

    if (!provider || !provider.enabled) {
      return res.status(404).json({
        error: 'PROVIDER_NOT_FOUND',
        message: 'SSO provider not found or disabled'
      });
    }

    // Exchange code for token
    const tokenData = await exchangeCodeForToken(provider, code);

    // Get user info from provider
    const userInfo = await getUserInfo(provider, tokenData.access_token);

    // Find or create user in CA
    let user;
    try {
      user = await serviceClient.getUser(userInfo.email);
    } catch (error) {
      // User doesn't exist, create them
      user = await serviceClient.request('ca', 'POST', '/api/users', {
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        emailVerified: true,
        ssoProvider: providerId
      });
    }

    // Generate CA token
    const caToken = await serviceClient.request('ca', 'POST', '/api/tokens/generate', {
      userId: user.id,
      permissions: { read: true, write: true, update: true },
      resourceType: 'url',
      resourceValue: '*',
      expiryType: 'time',
      expirySeconds: 86400 // 1 day
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await Session.create({
      userId: user.id,
      token: sessionToken,
      caTokenId: caToken.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt
    });

    // Clear SSO session data
    delete req.session.ssoState;
    delete req.session.ssoProviderId;

    res.json({
      success: true,
      sessionId: session.id,
      token: caToken.id,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('SSO callback error:', error);
    res.status(500).json({
      error: 'SSO_CALLBACK_FAILED',
      message: 'Failed to process SSO callback',
      details: error.message
    });
  }
});

/**
 * POST /api/sso/:providerId/callback
 * Handle SAML SSO provider callback (POST binding)
 */
router.post('/:providerId/callback', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { SAMLResponse } = req.body;
    const { SSOProvider, Session } = getModels();

    if (!SAMLResponse) {
      return res.status(400).json({
        error: 'MISSING_SAML_RESPONSE',
        message: 'SAMLResponse parameter is required'
      });
    }

    const provider = await SSOProvider.findByPk(providerId);

    if (!provider || !provider.enabled) {
      return res.status(404).json({
        error: 'PROVIDER_NOT_FOUND',
        message: 'SSO provider not found or disabled'
      });
    }

    if (provider.type !== 'saml') {
      return res.status(400).json({
        error: 'INVALID_PROVIDER_TYPE',
        message: 'This endpoint is only for SAML providers'
      });
    }

    // Validate SAML response
    const profile = await validateSAMLResponse(provider, SAMLResponse);

    // Extract user info from SAML attributes
    const userInfo = {
      email: profile.email || profile.nameID,
      name: profile.displayName || profile.name || profile.email,
      firstName: profile.firstName || profile.givenName,
      lastName: profile.lastName || profile.surname || profile.sn,
      groups: profile.groups || []
    };

    if (!userInfo.email) {
      return res.status(400).json({
        error: 'MISSING_EMAIL',
        message: 'SAML response must include email attribute'
      });
    }

    // Find or create user in CA
    let user;
    try {
      user = await serviceClient.getUser(userInfo.email);
    } catch (error) {
      // User doesn't exist, create them
      user = await serviceClient.request('ca', 'POST', '/api/users', {
        email: userInfo.email,
        name: userInfo.name,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        emailVerified: true,
        ssoProvider: providerId,
        metadata: {
          samlGroups: userInfo.groups,
          samlNameID: profile.nameID
        }
      });
    }

    // Generate CA token
    const caToken = await serviceClient.request('ca', 'POST', '/api/tokens/generate', {
      userId: user.id,
      permissions: { read: true, write: true, update: true },
      resourceType: 'url',
      resourceValue: '*',
      expiryType: 'time',
      expirySeconds: 86400 // 1 day
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await Session.create({
      userId: user.id,
      token: sessionToken,
      caTokenId: caToken.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt
    });

    res.json({
      success: true,
      sessionId: session.id,
      token: caToken.id,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('SAML callback error:', error);
    res.status(500).json({
      error: 'SAML_CALLBACK_FAILED',
      message: 'Failed to process SAML callback',
      details: error.message
    });
  }
});

/**
 * POST /api/sso/providers (Admin only)
 * Create or update SSO provider configuration
 */
router.post('/providers', authenticate({ requiredPermissions: { write: true } }), async (req, res) => {
  try {
    const { name, type, config, metadata } = req.body;
    const { SSOProvider } = getModels();

    if (!name || !type || !config) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Name, type, and config are required'
      });
    }

    const provider = await SSOProvider.create({
      name,
      type,
      config,
      metadata: metadata || {},
      enabled: true
    });

    res.status(201).json({
      success: true,
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type
      }
    });

  } catch (error) {
    console.error('Create SSO provider error:', error);
    res.status(500).json({
      error: 'CREATE_PROVIDER_FAILED',
      message: 'Failed to create SSO provider',
      details: error.message
    });
  }
});

/**
 * Helper: Build OAuth2/OIDC authorization URL
 */
function buildOAuth2Url(provider, state) {
  const { clientId, authorizationEndpoint, redirectUri, scope } = provider.config;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope || 'openid profile email',
    state
  });

  return `${authorizationEndpoint}?${params.toString()}`;
}

/**
 * Helper: Build SAML request
 */
function buildSAMLRequest(provider) {
  const { entryPoint, issuer, callbackUrl, identifierFormat } = provider.config;

  if (!entryPoint || !issuer || !callbackUrl) {
    throw new Error('SAML provider config must include entryPoint, issuer, and callbackUrl');
  }

  // Generate unique request ID
  const requestId = `_${crypto.randomBytes(16).toString('hex')}`;
  const timestamp = new Date().toISOString();

  // Build SAML AuthnRequest XML
  const authnRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${timestamp}"
  Destination="${entryPoint}"
  AssertionConsumerServiceURL="${callbackUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${issuer}</saml:Issuer>
  <samlp:NameIDPolicy
    Format="${identifierFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}"
    AllowCreate="true"/>
</samlp:AuthnRequest>`;

  // Base64 encode the request
  const samlRequestEncoded = Buffer.from(authnRequest).toString('base64');

  // Build redirect URL with encoded request
  const params = new URLSearchParams({
    SAMLRequest: samlRequestEncoded
  });

  return `${entryPoint}?${params.toString()}`;
}

/**
 * Helper: Exchange authorization code for access token
 */
async function exchangeCodeForToken(provider, code) {
  const { clientId, clientSecret, tokenEndpoint, redirectUri } = provider.config;

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Helper: Get user info from SSO provider
 */
async function getUserInfo(provider, accessToken) {
  const { userInfoEndpoint } = provider.config;

  const response = await fetch(userInfoEndpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`User info request failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Helper: Validate SAML response
 */
async function validateSAMLResponse(provider, samlResponseBase64) {
  const { issuer, callbackUrl, cert, identifierFormat } = provider.config;

  // Create SAML instance for validation
  const saml = new SAML({
    issuer: issuer,
    callbackUrl: callbackUrl,
    cert: cert, // IdP certificate for signature verification
    identifierFormat: identifierFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    acceptedClockSkewMs: 5000, // Allow 5 second clock skew
    validateInResponseTo: false // Don't validate InResponseTo (stateless)
  });

  return new Promise((resolve, reject) => {
    // Create mock request object for passport-saml
    const mockRequest = {
      body: { SAMLResponse: samlResponseBase64 },
      query: {}
    };

    saml.validatePostResponse(mockRequest.body, (err, profile) => {
      if (err) {
        reject(new Error(`SAML validation failed: ${err.message}`));
      } else {
        resolve(profile);
      }
    });
  });
}

module.exports = router;
