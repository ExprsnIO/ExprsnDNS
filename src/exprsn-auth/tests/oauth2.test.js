/**
 * OAuth2/OIDC Tests
 * Tests for OAuth2 authorization, token management, and OpenID Connect
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestOAuth2Client,
  getModels
} = require('./helpers/testDatabase');

describe('OAuth2 and OIDC', () => {
  let models;
  let agent;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
    agent = request.agent(app);
  });

  describe('OAuth2 Authorization', () => {
    test('should authorize client application', async () => {
      const user = await createTestUser({
        email: 'oauth@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const client = await createTestOAuth2Client({
        clientId: 'test-client',
        redirectUris: ['http://localhost:3000/callback']
      });

      // Login user first
      await agent
        .post('/api/auth/login')
        .send({ email: 'oauth@example.com', password: 'Test123!@#' });

      const response = await agent
        .get('/api/oauth2/authorize')
        .query({
          client_id: client.clientId,
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code',
          state: 'random-state'
        })
        .expect(302);

      // Should redirect with authorization code
      expect(response.header.location).toContain('code=');
      expect(response.header.location).toContain('state=random-state');
    });

    test('should generate authorization code', async () => {
      const user = await createTestUser({
        email: 'code@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const client = await createTestOAuth2Client({
        clientId: 'code-client',
        redirectUris: ['http://localhost:3000/callback']
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'code@example.com', password: 'Test123!@#' });

      const response = await agent
        .get('/api/oauth2/authorize')
        .query({
          client_id: client.clientId,
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code'
        })
        .expect(302);

      const location = response.header.location;
      const codeMatch = location.match(/code=([^&]+)/);
      expect(codeMatch).toBeTruthy();
      expect(codeMatch[1]).toHaveLength(40); // Authorization code length
    });

    test('should support PKCE', async () => {
      const user = await createTestUser({
        email: 'pkce@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const client = await createTestOAuth2Client({
        clientId: 'pkce-client',
        redirectUris: ['http://localhost:3000/callback']
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'pkce@example.com', password: 'Test123!@#' });

      const codeVerifier = 'test-code-verifier-with-sufficient-length-for-pkce';
      const crypto = require('crypto');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const response = await agent
        .get('/api/oauth2/authorize')
        .query({
          client_id: client.clientId,
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code',
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        })
        .expect(302);

      expect(response.header.location).toContain('code=');
    });

    test('should validate redirect URI', async () => {
      const user = await createTestUser({
        email: 'redirect@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const client = await createTestOAuth2Client({
        clientId: 'redirect-client',
        redirectUris: ['http://localhost:3000/callback']
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'redirect@example.com', password: 'Test123!@#' });

      const response = await agent
        .get('/api/oauth2/authorize')
        .query({
          client_id: client.clientId,
          redirect_uri: 'http://malicious.com/callback', // Invalid redirect
          response_type: 'code'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_request');
    });

    test('should handle user consent', async () => {
      const user = await createTestUser({
        email: 'consent@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const client = await createTestOAuth2Client({
        clientId: 'consent-client',
        redirectUris: ['http://localhost:3000/callback']
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'consent@example.com', password: 'Test123!@#' });

      // POST for explicit consent
      const response = await agent
        .post('/api/oauth2/authorize')
        .send({
          client_id: client.clientId,
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code',
          scope: 'read write'
        })
        .expect(200);

      expect(response.body).toHaveProperty('authorizationCode');
      expect(response.body).toHaveProperty('redirectUri');
    });
  });

  describe('Token Exchange', () => {
    test('should exchange authorization code for access token', async () => {
      const user = await createTestUser({
        email: 'token@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const client = await createTestOAuth2Client({
        clientId: 'token-client',
        clientSecret: 'token-secret',
        redirectUris: ['http://localhost:3000/callback']
      });

      // Create authorization code
      const authCode = await models.OAuth2AuthorizationCode.create({
        code: 'test-auth-code-12345',
        clientId: client.id,
        userId: user.id,
        redirectUri: 'http://localhost:3000/callback',
        expiresAt: new Date(Date.now() + 600000),
        scope: ['read']
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).toHaveProperty('expires_in');
      expect(response.body).toHaveProperty('refresh_token');
    });

    test('should issue refresh token', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client({
        clientId: 'refresh-client',
        clientSecret: 'refresh-secret',
        grants: ['authorization_code', 'refresh_token']
      });

      const authCode = await models.OAuth2AuthorizationCode.create({
        code: 'refresh-auth-code',
        clientId: client.id,
        userId: user.id,
        redirectUri: 'http://localhost:3000/callback',
        expiresAt: new Date(Date.now() + 600000)
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(200);

      expect(response.body.refresh_token).toBeTruthy();
    });

    test('should validate client credentials', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client({
        clientId: 'creds-client',
        clientSecret: 'creds-secret'
      });

      const authCode = await models.OAuth2AuthorizationCode.create({
        code: 'creds-auth-code',
        clientId: client.id,
        userId: user.id,
        redirectUri: 'http://localhost:3000/callback',
        expiresAt: new Date(Date.now() + 600000)
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client.clientId,
          client_secret: 'wrong-secret' // Invalid secret
        })
        .expect(401);

      expect(response.body.error).toBe('invalid_client');
    });

    test('should support client_credentials grant', async () => {
      const client = await createTestOAuth2Client({
        clientId: 'client-creds',
        clientSecret: 'client-secret',
        grants: ['client_credentials']
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'client_credentials',
          client_id: client.clientId,
          client_secret: client.clientSecret,
          scope: 'api:access'
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).not.toHaveProperty('refresh_token'); // No refresh for client credentials
    });

    test('should support refresh_token grant', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client({
        clientId: 'refresh-grant-client',
        clientSecret: 'refresh-grant-secret',
        grants: ['refresh_token']
      });

      // Create a refresh token
      const refreshToken = await models.OAuth2Token.create({
        accessToken: 'old-access-token',
        refreshToken: 'valid-refresh-token',
        clientId: client.id,
        userId: user.id,
        accessTokenExpiresAt: new Date(Date.now() - 1000), // Expired
        refreshTokenExpiresAt: new Date(Date.now() + 86400000), // Valid
        scope: ['read']
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'refresh_token',
          refresh_token: refreshToken.refreshToken,
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body.access_token).not.toBe('old-access-token');
    });
  });

  describe('Token Management', () => {
    test('should introspect token (RFC 7662)', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client();

      const token = await models.OAuth2Token.create({
        accessToken: 'introspect-token',
        clientId: client.id,
        userId: user.id,
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
        scope: ['read', 'write']
      });

      const response = await request(app)
        .post('/api/oauth2/introspect')
        .send({
          token: token.accessToken,
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(200);

      expect(response.body).toHaveProperty('active', true);
      expect(response.body).toHaveProperty('scope');
      expect(response.body).toHaveProperty('client_id', client.clientId);
    });

    test('should revoke token (RFC 7009)', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client({
        clientId: 'revoke-client',
        clientSecret: 'revoke-secret'
      });

      const token = await models.OAuth2Token.create({
        accessToken: 'revoke-access-token',
        refreshToken: 'revoke-refresh-token',
        clientId: client.id,
        userId: user.id,
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
        refreshTokenExpiresAt: new Date(Date.now() + 86400000)
      });

      const response = await request(app)
        .post('/api/oauth2/revoke')
        .send({
          token: token.refreshToken,
          token_type_hint: 'refresh_token'
        })
        .expect(200);

      expect(response.body.message).toContain('revoked');

      // Verify token is revoked
      const revokedToken = await models.OAuth2Token.findOne({
        where: { refreshToken: token.refreshToken }
      });
      expect(revokedToken).toBeNull();
    });

    test('should handle token expiration', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client();

      const token = await models.OAuth2Token.create({
        accessToken: 'expired-token',
        clientId: client.id,
        userId: user.id,
        accessTokenExpiresAt: new Date(Date.now() - 1000) // Expired
      });

      const response = await request(app)
        .post('/api/oauth2/introspect')
        .send({
          token: token.accessToken,
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(200);

      expect(response.body).toHaveProperty('active', false);
    });
  });

  describe('OpenID Connect (OIDC)', () => {
    test('should serve OpenID configuration (.well-known)', async () => {
      const response = await request(app)
        .get('/.well-known/openid-configuration')
        .expect(200);

      expect(response.body).toHaveProperty('issuer');
      expect(response.body).toHaveProperty('authorization_endpoint');
      expect(response.body).toHaveProperty('token_endpoint');
      expect(response.body).toHaveProperty('userinfo_endpoint');
      expect(response.body).toHaveProperty('jwks_uri');
      expect(response.body).toHaveProperty('response_types_supported');
      expect(response.body).toHaveProperty('grant_types_supported');
    });

    test('should serve JWKS (JSON Web Key Set)', async () => {
      const response = await request(app)
        .get('/.well-known/jwks.json')
        .expect(200);

      expect(response.body).toHaveProperty('keys');
      expect(Array.isArray(response.body.keys)).toBe(true);
      if (response.body.keys.length > 0) {
        expect(response.body.keys[0]).toHaveProperty('kty');
        expect(response.body.keys[0]).toHaveProperty('use');
        expect(response.body.keys[0]).toHaveProperty('kid');
      }
    });

    test('should provide UserInfo endpoint', async () => {
      const user = await createTestUser({
        email: 'userinfo@example.com',
        displayName: 'User Info',
        emailVerified: true
      });

      const client = await createTestOAuth2Client();

      const token = await models.OAuth2Token.create({
        accessToken: 'userinfo-token',
        clientId: client.id,
        userId: user.id,
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
        scope: ['openid', 'profile', 'email']
      });

      const response = await request(app)
        .get('/api/oauth2/userinfo')
        .set('Authorization', `Bearer ${token.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('sub', user.id);
      expect(response.body).toHaveProperty('email', user.email);
      expect(response.body).toHaveProperty('email_verified', true);
      expect(response.body).toHaveProperty('name', user.displayName);
    });

    test('should generate ID token', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client({
        clientId: 'id-token-client',
        clientSecret: 'id-token-secret',
        grants: ['authorization_code']
      });

      const authCode = await models.OAuth2AuthorizationCode.create({
        code: 'id-token-code',
        clientId: client.id,
        userId: user.id,
        redirectUri: 'http://localhost:3000/callback',
        expiresAt: new Date(Date.now() + 600000),
        scope: ['openid', 'profile']
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(200);

      expect(response.body).toHaveProperty('id_token');

      // Decode ID token (without verification for testing)
      const idToken = jwt.decode(response.body.id_token);
      expect(idToken).toHaveProperty('sub', user.id);
      expect(idToken).toHaveProperty('aud', client.clientId);
      expect(idToken).toHaveProperty('iss');
      expect(idToken).toHaveProperty('exp');
      expect(idToken).toHaveProperty('iat');
    });
  });

  describe('Social Login', () => {
    test('should handle Google OAuth flow', async () => {
      const response = await request(app)
        .get('/api/auth/google')
        .expect(302);

      // Should redirect to Google OAuth
      expect(response.header.location).toContain('accounts.google.com');
    });

    test('should handle Google OAuth callback', async () => {
      // Mock passport authentication
      const mockUser = await createTestUser({
        email: 'google@example.com',
        provider: 'google',
        providerId: 'google-123'
      });

      // This would be handled by passport middleware in real scenario
      // Testing the callback endpoint logic
      const agent = request.agent(app);

      // Simulate successful authentication
      agent.auth = (user) => {
        agent.user = user;
      };

      const response = await agent
        .get('/api/auth/google/callback')
        .query({ code: 'mock-google-code' })
        .expect(302);

      // Should redirect to frontend with token
      expect(response.header.location).toContain('token=');
    });

    test('should handle GitHub OAuth flow', async () => {
      const response = await request(app)
        .get('/api/auth/github')
        .expect(302);

      // Should redirect to GitHub OAuth
      expect(response.header.location).toContain('github.com');
    });

    test('should handle GitHub OAuth callback', async () => {
      const mockUser = await createTestUser({
        email: 'github@example.com',
        provider: 'github',
        providerId: 'github-123'
      });

      const agent = request.agent(app);

      const response = await agent
        .get('/api/auth/github/callback')
        .query({ code: 'mock-github-code' })
        .expect(302);

      // Should redirect to frontend with token
      expect(response.header.location).toContain('token=');
    });

    test('should create user from social profile', async () => {
      // This tests the passport strategy's user creation
      // In real implementation, this is handled by passport strategies

      const socialProfile = {
        provider: 'google',
        id: 'google-new-user-123',
        displayName: 'Social User',
        emails: [{ value: 'social@example.com' }]
      };

      // User should be created if doesn't exist
      const existingUser = await models.User.findOne({
        where: { email: 'social@example.com' }
      });

      if (!existingUser) {
        const newUser = await models.User.create({
          email: socialProfile.emails[0].value,
          displayName: socialProfile.displayName,
          provider: socialProfile.provider,
          providerId: socialProfile.id,
          emailVerified: true // Social login emails are pre-verified
        });

        expect(newUser).toBeTruthy();
        expect(newUser.email).toBe('social@example.com');
        expect(newUser.provider).toBe('google');
      }
    });

    test('should link existing user with social account', async () => {
      // Create existing user
      const existingUser = await createTestUser({
        email: 'existing@example.com'
      });

      // Simulate linking social account
      existingUser.provider = 'google';
      existingUser.providerId = 'google-link-123';
      await existingUser.save();

      await existingUser.reload();
      expect(existingUser.provider).toBe('google');
      expect(existingUser.providerId).toBe('google-link-123');
    });
  });

  describe('OAuth2 Error Handling', () => {
    test('should handle invalid client_id', async () => {
      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'authorization_code',
          code: 'some-code',
          client_id: 'invalid-client',
          client_secret: 'secret'
        })
        .expect(401);

      expect(response.body.error).toBe('invalid_client');
    });

    test('should handle invalid authorization code', async () => {
      const client = await createTestOAuth2Client({
        clientId: 'valid-client',
        clientSecret: 'valid-secret'
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'authorization_code',
          code: 'invalid-code',
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_grant');
    });

    test('should handle expired authorization code', async () => {
      const user = await createTestUser();
      const client = await createTestOAuth2Client({
        clientId: 'expired-client',
        clientSecret: 'expired-secret'
      });

      const authCode = await models.OAuth2AuthorizationCode.create({
        code: 'expired-code',
        clientId: client.id,
        userId: user.id,
        redirectUri: 'http://localhost:3000/callback',
        expiresAt: new Date(Date.now() - 1000) // Expired
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'authorization_code',
          code: authCode.code,
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_grant');
    });

    test('should handle unsupported grant type', async () => {
      const client = await createTestOAuth2Client({
        clientId: 'grant-client',
        clientSecret: 'grant-secret'
      });

      const response = await request(app)
        .post('/api/oauth2/token')
        .send({
          grant_type: 'unsupported_grant',
          client_id: client.clientId,
          client_secret: client.clientSecret
        })
        .expect(400);

      expect(response.body.error).toBe('unsupported_grant_type');
    });
  });
});
