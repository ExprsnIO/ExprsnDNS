/**
 * ═══════════════════════════════════════════════════════════
 * OAuth2 Service
 * OAuth2 provider implementation
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const { OAuth2Client, OAuth2Token, OAuth2AuthorizationCode, User } = require('../models');
const { AppError } = require('@exprsn/shared');
const config = require('../config');

/**
 * Get OAuth2 client by client ID
 */
async function getClient(clientId, clientSecret = null) {
  const where = { clientId, status: 'active' };

  if (clientSecret !== null) {
    where.clientSecret = clientSecret;
  }

  const client = await OAuth2Client.findOne({ where });

  if (!client) {
    return null;
  }

  return {
    id: client.id,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    redirectUris: client.redirectUris,
    grants: client.grants,
    scopes: client.scopes
  };
}

/**
 * Save authorization code
 */
async function saveAuthorizationCode(code, client, user) {
  const authCode = await OAuth2AuthorizationCode.create({
    code: code.authorizationCode,
    expiresAt: code.expiresAt,
    redirectUri: code.redirectUri,
    scope: code.scope || [],
    clientId: client.id,
    userId: user.id,
    codeChallenge: code.codeChallenge,
    codeChallengeMethod: code.codeChallengeMethod
  });

  return {
    authorizationCode: authCode.code,
    expiresAt: authCode.expiresAt,
    redirectUri: authCode.redirectUri,
    scope: authCode.scope,
    client: { id: client.id },
    user: { id: user.id }
  };
}

/**
 * Get authorization code
 */
async function getAuthorizationCode(authorizationCode) {
  const code = await OAuth2AuthorizationCode.findOne({
    where: { code: authorizationCode, used: false },
    include: [
      { model: OAuth2Client, as: 'client' },
      { model: User, as: 'user' }
    ]
  });

  if (!code) {
    return null;
  }

  // Check if expired
  if (code.expiresAt < new Date()) {
    return null;
  }

  return {
    authorizationCode: code.code,
    expiresAt: code.expiresAt,
    redirectUri: code.redirectUri,
    scope: code.scope,
    codeChallenge: code.codeChallenge,
    codeChallengeMethod: code.codeChallengeMethod,
    client: {
      id: code.client.id,
      clientId: code.client.clientId,
      redirectUris: code.client.redirectUris,
      grants: code.client.grants
    },
    user: {
      id: code.user.id,
      email: code.user.email
    }
  };
}

/**
 * Revoke authorization code
 */
async function revokeAuthorizationCode(code) {
  const authCode = await OAuth2AuthorizationCode.findOne({
    where: { code: code.authorizationCode }
  });

  if (authCode) {
    authCode.used = true;
    authCode.usedAt = new Date();
    await authCode.save();
  }

  return true;
}

/**
 * Save token
 */
async function saveToken(token, client, user) {
  const savedToken = await OAuth2Token.create({
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    refreshToken: token.refreshToken,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    scope: token.scope || [],
    clientId: client.id,
    userId: user.id
  });

  return {
    accessToken: savedToken.accessToken,
    accessTokenExpiresAt: savedToken.accessTokenExpiresAt,
    refreshToken: savedToken.refreshToken,
    refreshTokenExpiresAt: savedToken.refreshTokenExpiresAt,
    scope: savedToken.scope,
    client: { id: client.id },
    user: { id: user.id }
  };
}

/**
 * Get access token
 */
async function getAccessToken(accessToken) {
  const token = await OAuth2Token.findOne({
    where: { accessToken, revoked: false },
    include: [
      { model: OAuth2Client, as: 'client' },
      { model: User, as: 'user' }
    ]
  });

  if (!token) {
    return null;
  }

  // Check if expired
  if (token.accessTokenExpiresAt < new Date()) {
    return null;
  }

  return {
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    scope: token.scope,
    client: {
      id: token.client.id,
      clientId: token.client.clientId
    },
    user: {
      id: token.user.id,
      email: token.user.email
    }
  };
}

/**
 * Get refresh token
 */
async function getRefreshToken(refreshToken) {
  const token = await OAuth2Token.findOne({
    where: { refreshToken, revoked: false },
    include: [
      { model: OAuth2Client, as: 'client' },
      { model: User, as: 'user' }
    ]
  });

  if (!token) {
    return null;
  }

  // Check if expired
  if (token.refreshTokenExpiresAt < new Date()) {
    return null;
  }

  return {
    refreshToken: token.refreshToken,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    scope: token.scope,
    client: {
      id: token.client.id,
      clientId: token.client.clientId,
      grants: token.client.grants
    },
    user: {
      id: token.user.id,
      email: token.user.email
    }
  };
}

/**
 * Revoke token
 */
async function revokeToken(token) {
  const dbToken = await OAuth2Token.findOne({
    where: { refreshToken: token.refreshToken }
  });

  if (dbToken) {
    dbToken.revoked = true;
    dbToken.revokedAt = new Date();
    await dbToken.save();
  }

  return true;
}

/**
 * Verify scope
 */
function verifyScope(token, scope) {
  if (!token.scope) {
    return false;
  }

  const requestedScopes = scope.split(' ');
  const tokenScopes = token.scope;

  return requestedScopes.every(s => tokenScopes.includes(s));
}

/**
 * Validate redirect URI
 */
function validateRedirectUri(redirectUri, client) {
  if (!client.redirectUris || client.redirectUris.length === 0) {
    return false;
  }

  return client.redirectUris.includes(redirectUri);
}

/**
 * Generate authorization code
 */
function generateAuthorizationCode() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate access token
 */
function generateAccessToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Generate refresh token
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

module.exports = {
  getClient,
  saveAuthorizationCode,
  getAuthorizationCode,
  revokeAuthorizationCode,
  saveToken,
  getAccessToken,
  getRefreshToken,
  revokeToken,
  verifyScope,
  validateRedirectUri,
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken
};
