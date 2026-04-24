/**
 * ═══════════════════════════════════════════════════════════
 * SAML SSO Tests
 * Test SAML 2.0 authentication flows, metadata, and providers
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const app = require('../src/index');
const { User, Organization, SAMLProvider } = require('../src/models');
const samlService = require('../src/services/samlService');
const { createTestUser, createTestOrganization, cleanupTestData } = require('./helpers/testDatabase');

describe('SAML SSO Integration', () => {
  let testUser;
  let testOrg;
  let samlProvider;

  beforeAll(async () => {
    testUser = await createTestUser();
    testOrg = await createTestOrganization(testUser.id);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Create test SAML provider
    samlProvider = await SAMLProvider.create({
      organizationId: testOrg.id,
      name: 'Test IdP',
      entityId: 'https://test-idp.example.com',
      ssoUrl: 'https://test-idp.example.com/sso',
      sloUrl: 'https://test-idp.example.com/slo',
      certificate: 'TEST_CERT_DATA',
      active: true,
      attributeMapping: {
        email: 'urn:oid:0.9.2342.19200300.100.1.3',
        firstName: 'urn:oid:2.5.4.42',
        lastName: 'urn:oid:2.5.4.4'
      }
    });
  });

  afterEach(async () => {
    if (samlProvider) {
      await samlProvider.destroy();
    }
  });

  describe('SAML Metadata Generation', () => {
    it('should generate valid SP metadata XML', async () => {
      const response = await request(app)
        .get('/api/saml/metadata')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.text).toContain('<EntityDescriptor');
      expect(response.text).toContain('entityID=');
      expect(response.text).toContain('<SPSSODescriptor');
      expect(response.text).toContain('<AssertionConsumerService');
      expect(response.text).toContain('<SingleLogoutService');
    });

    it('should include correct ACS URL in metadata', async () => {
      const response = await request(app)
        .get('/api/saml/metadata')
        .expect(200);

      expect(response.text).toContain('Location="http://');
      expect(response.text).toContain('/api/saml/callback"');
    });

    it('should include X.509 certificate in metadata', async () => {
      const response = await request(app)
        .get('/api/saml/metadata')
        .expect(200);

      expect(response.text).toContain('<X509Certificate>');
      expect(response.text).toContain('</X509Certificate>');
    });

    it('should support SAML 2.0 protocol binding', async () => {
      const response = await request(app)
        .get('/api/saml/metadata')
        .expect(200);

      expect(response.text).toContain('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST');
      expect(response.text).toContain('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect');
    });
  });

  describe('SAML Provider Management', () => {
    it('should list configured SAML providers', async () => {
      const response = await request(app)
        .get('/api/saml/providers')
        .expect(200);

      expect(response.body.providers).toBeInstanceOf(Array);
      expect(response.body.providers.length).toBeGreaterThan(0);
      expect(response.body.providers[0]).toHaveProperty('name');
      expect(response.body.providers[0]).toHaveProperty('entityId');
    });

    it('should filter active providers only', async () => {
      // Deactivate provider
      await samlProvider.update({ active: false });

      const response = await request(app)
        .get('/api/saml/providers?active=true')
        .expect(200);

      expect(response.body.providers).toBeInstanceOf(Array);
      expect(response.body.providers.length).toBe(0);
    });

    it('should return provider configuration without sensitive data', async () => {
      const response = await request(app)
        .get('/api/saml/providers')
        .expect(200);

      const provider = response.body.providers[0];
      expect(provider).not.toHaveProperty('certificate');
      expect(provider).not.toHaveProperty('privateKey');
    });
  });

  describe('SAML Authentication Initiation', () => {
    it('should initiate SAML login flow', async () => {
      const response = await request(app)
        .get(`/api/saml/login?providerId=${samlProvider.id}`)
        .expect(302);

      expect(response.headers.location).toBeDefined();
      expect(response.headers.location).toContain(samlProvider.ssoUrl);
    });

    it('should include SAMLRequest in redirect URL', async () => {
      const response = await request(app)
        .get(`/api/saml/login?providerId=${samlProvider.id}`)
        .expect(302);

      expect(response.headers.location).toContain('SAMLRequest=');
    });

    it('should reject login with invalid provider ID', async () => {
      const response = await request(app)
        .get('/api/saml/login?providerId=invalid-uuid')
        .expect(404);

      expect(response.body.error).toBe('PROVIDER_NOT_FOUND');
    });

    it('should reject login with inactive provider', async () => {
      await samlProvider.update({ active: false });

      const response = await request(app)
        .get(`/api/saml/login?providerId=${samlProvider.id}`)
        .expect(403);

      expect(response.body.error).toBe('PROVIDER_INACTIVE');
    });
  });

  describe('SAML Response Validation', () => {
    it('should validate SAML response signature', async () => {
      const invalidResponse = '<samlp:Response>invalid</samlp:Response>';

      const result = await samlService.validateSAMLResponse(invalidResponse, samlProvider);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate response issuer matches provider', async () => {
      const mockResponse = {
        issuer: 'https://wrong-idp.example.com',
        assertions: []
      };

      const result = await samlService.validateSAMLResponse(mockResponse, samlProvider);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('issuer');
    });

    it('should validate assertion expiration', async () => {
      const expiredAssertion = {
        issuer: samlProvider.entityId,
        notBefore: new Date(Date.now() - 3600000).toISOString(),
        notOnOrAfter: new Date(Date.now() - 1800000).toISOString(),
        attributes: {}
      };

      const result = await samlService.validateSAMLResponse({ assertions: [expiredAssertion] }, samlProvider);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should validate audience restriction', async () => {
      const mockAssertion = {
        audience: 'https://wrong-sp.example.com',
        attributes: {}
      };

      const result = await samlService.validateSAMLResponse({ assertions: [mockAssertion] }, samlProvider);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('audience');
    });
  });

  describe('SAML Assertion Consumer Service (ACS)', () => {
    it('should accept valid SAML response at callback endpoint', async () => {
      // Mock valid SAML response (simplified)
      const validSAMLResponse = Buffer.from('<samlp:Response></samlp:Response>').toString('base64');

      const response = await request(app)
        .post('/api/saml/callback')
        .send({ SAMLResponse: validSAMLResponse })
        .expect(302);

      // Should redirect after processing
      expect(response.headers.location).toBeDefined();
    });

    it('should reject callback without SAMLResponse', async () => {
      const response = await request(app)
        .post('/api/saml/callback')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('MISSING_SAML_RESPONSE');
    });

    it('should reject malformed SAMLResponse', async () => {
      const response = await request(app)
        .post('/api/saml/callback')
        .send({ SAMLResponse: 'not-base64' })
        .expect(400);

      expect(response.body.error).toBe('INVALID_SAML_RESPONSE');
    });
  });

  describe('Just-in-Time (JIT) User Provisioning', () => {
    it('should create new user from SAML attributes', async () => {
      const samlAttributes = {
        email: 'newuser@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };

      const user = await samlService.findOrCreateUser(samlAttributes, samlProvider);

      expect(user).toBeDefined();
      expect(user.email).toBe('newuser@example.com');
      expect(user.displayName).toContain('John');
      expect(user.displayName).toContain('Doe');
    });

    it('should find existing user by email', async () => {
      const existingUser = await User.create({
        email: 'existing@example.com',
        passwordHash: 'hash',
        emailVerified: true
      });

      const samlAttributes = {
        email: 'existing@example.com',
        firstName: 'Jane',
        lastName: 'Smith'
      };

      const user = await samlService.findOrCreateUser(samlAttributes, samlProvider);

      expect(user.id).toBe(existingUser.id);
      expect(user.email).toBe('existing@example.com');

      await existingUser.destroy();
    });

    it('should map SAML attributes to user fields', async () => {
      const samlAttributes = {
        [samlProvider.attributeMapping.email]: 'test@example.com',
        [samlProvider.attributeMapping.firstName]: 'Alice',
        [samlProvider.attributeMapping.lastName]: 'Wonder'
      };

      const mapped = samlService.mapSAMLAttributes(samlAttributes, samlProvider);

      expect(mapped.email).toBe('test@example.com');
      expect(mapped.firstName).toBe('Alice');
      expect(mapped.lastName).toBe('Wonder');
    });

    it('should handle missing optional attributes', async () => {
      const samlAttributes = {
        email: 'minimal@example.com'
        // No firstName or lastName
      };

      const user = await samlService.findOrCreateUser(samlAttributes, samlProvider);

      expect(user).toBeDefined();
      expect(user.email).toBe('minimal@example.com');
      expect(user.displayName).toBe('minimal@example.com');
    });
  });

  describe('SAML Single Logout (SLO)', () => {
    it('should initiate SAML logout', async () => {
      const response = await request(app)
        .get(`/api/saml/logout?providerId=${samlProvider.id}`)
        .expect(302);

      expect(response.headers.location).toBeDefined();
      expect(response.headers.location).toContain(samlProvider.sloUrl);
    });

    it('should include LogoutRequest in SLO redirect', async () => {
      const response = await request(app)
        .get(`/api/saml/logout?providerId=${samlProvider.id}`)
        .expect(302);

      expect(response.headers.location).toContain('SAMLRequest=');
    });

    it('should handle SLO callback', async () => {
      const logoutResponse = Buffer.from('<samlp:LogoutResponse></samlp:LogoutResponse>').toString('base64');

      const response = await request(app)
        .post('/api/saml/logout/callback')
        .send({ SAMLResponse: logoutResponse })
        .expect(302);

      expect(response.headers.location).toBeDefined();
    });

    it('should clear user session on SLO', async () => {
      // This would require session setup - simplified test
      const logoutResponse = Buffer.from('<samlp:LogoutResponse></samlp:LogoutResponse>').toString('base64');

      await request(app)
        .post('/api/saml/logout/callback')
        .send({ SAMLResponse: logoutResponse })
        .expect(302);

      // Session should be cleared (verification would require session testing)
    });
  });

  describe('SAML Error Handling', () => {
    it('should handle IdP error responses', async () => {
      const errorResponse = '<samlp:Response><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder"/></samlp:Status></samlp:Response>';
      const encoded = Buffer.from(errorResponse).toString('base64');

      const response = await request(app)
        .post('/api/saml/callback')
        .send({ SAMLResponse: encoded })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should handle missing required SAML attributes', async () => {
      const samlAttributes = {
        // Missing email
        firstName: 'Test',
        lastName: 'User'
      };

      await expect(
        samlService.findOrCreateUser(samlAttributes, samlProvider)
      ).rejects.toThrow();
    });

    it('should handle certificate validation errors', async () => {
      const invalidProvider = { ...samlProvider.toJSON(), certificate: 'INVALID' };

      const result = await samlService.validateSAMLResponse('<samlp:Response></samlp:Response>', invalidProvider);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('certificate');
    });
  });

  describe('SAML Service Status', () => {
    it('should return SAML service status', async () => {
      const response = await request(app)
        .get('/api/saml/status')
        .expect(200);

      expect(response.body).toHaveProperty('enabled');
      expect(response.body).toHaveProperty('providers');
      expect(typeof response.body.enabled).toBe('boolean');
      expect(typeof response.body.providers).toBe('number');
    });

    it('should include certificate expiration info', async () => {
      const response = await request(app)
        .get('/api/saml/status')
        .expect(200);

      expect(response.body).toHaveProperty('certificateExpiry');
    });
  });
});
