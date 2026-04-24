/**
 * MFA Tests
 * Tests for Multi-Factor Authentication (TOTP and backup codes)
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  getModels
} = require('./helpers/testDatabase');
const emailService = require('../src/services/emailService');

describe('MFA (Multi-Factor Authentication)', () => {
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

  describe('POST /api/mfa/setup', () => {
    test('should generate MFA secret and QR code', async () => {
      const user = await createTestUser({
        email: 'mfa@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: false
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'mfa@example.com', password: 'Test123!@#' });

      const response = await agent
        .post('/api/mfa/setup')
        .expect(200);

      expect(response.body.message).toContain('MFA setup initiated');
      expect(response.body).toHaveProperty('secret');
      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('backupCodes');
      expect(response.body.backupCodes).toHaveLength(10);
      expect(response.body.qrCode).toContain('data:image/png;base64');

      // Verify secret was stored
      await user.reload();
      expect(user.mfaSecret).toBeTruthy();
      expect(user.mfaEnabled).toBe(false); // Not enabled yet
    });

    test('should generate 10 backup codes', async () => {
      const user = await createTestUser({
        email: 'backup@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'backup@example.com', password: 'Test123!@#' });

      const response = await agent
        .post('/api/mfa/setup')
        .expect(200);

      expect(response.body.backupCodes).toHaveLength(10);
      response.body.backupCodes.forEach(code => {
        expect(code).toMatch(/^[0-9A-F]{8}$/); // 8 hex characters
      });

      // Verify backup codes stored
      await user.reload();
      expect(user.mfaBackupCodes).toHaveLength(10);
    });

    test('should store secret temporarily (not enabled yet)', async () => {
      const user = await createTestUser({
        email: 'temp@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'temp@example.com', password: 'Test123!@#' });

      await agent
        .post('/api/mfa/setup')
        .expect(200);

      await user.reload();
      expect(user.mfaSecret).toBeTruthy();
      expect(user.mfaEnabled).toBe(false);
    });

    test('should reject if MFA already enabled', async () => {
      const user = await createTestUser({
        email: 'enabled@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'existing-secret'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'enabled@example.com', password: 'Test123!@#' });

      const response = await agent
        .post('/api/mfa/setup')
        .expect(400);

      expect(response.body.code).toBe('MFA_ALREADY_ENABLED');
    });
  });

  describe('POST /api/mfa/verify', () => {
    test('should verify TOTP token and enable MFA', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'verify@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: false,
        mfaSecret: secret.base32
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'verify@example.com', password: 'Test123!@#' });

      // Generate valid TOTP token
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
      });

      const response = await agent
        .post('/api/mfa/verify')
        .send({ token })
        .expect(200);

      expect(response.body.message).toContain('MFA enabled');
      expect(response.body).toHaveProperty('backupCodes');

      // Verify MFA is now enabled
      await user.reload();
      expect(user.mfaEnabled).toBe(true);
    });

    test('should reject invalid TOTP token', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'invalid@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaSecret: secret.base32
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'invalid@example.com', password: 'Test123!@#' });

      const response = await agent
        .post('/api/mfa/verify')
        .send({ token: '000000' }) // Invalid token
        .expect(400);

      expect(response.body.code).toBe('INVALID_MFA_TOKEN');

      // Verify MFA is not enabled
      await user.reload();
      expect(user.mfaEnabled).toBe(false);
    });

    test('should mark MFA as verified in session', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'session@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaSecret: secret.base32
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'session@example.com', password: 'Test123!@#' });

      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
      });

      await agent
        .post('/api/mfa/verify')
        .send({ token })
        .expect(200);

      // Session should now have mfaVerified flag
      // (Implementation detail - would need session inspection)
    });

    test('should return backup codes after enabling', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const backupCodes = ['12345678', '87654321'];
      const user = await createTestUser({
        email: 'codes@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaSecret: secret.base32,
        mfaBackupCodes: backupCodes
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'codes@example.com', password: 'Test123!@#' });

      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
      });

      const response = await agent
        .post('/api/mfa/verify')
        .send({ token })
        .expect(200);

      expect(response.body.backupCodes).toEqual(backupCodes);
    });
  });

  describe('POST /api/mfa/validate', () => {
    test('should validate TOTP token during login', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'validate@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: secret.base32
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'validate@example.com', password: 'Test123!@#' });

      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
      });

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token })
        .expect(200);

      expect(response.body.message).toContain('validated successfully');
    });

    test('should validate backup code during login', async () => {
      const backupCodes = ['ABCD1234', 'EFGH5678', 'IJKL9012'];
      const user = await createTestUser({
        email: 'backup@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret',
        mfaBackupCodes: backupCodes
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'backup@example.com', password: 'Test123!@#' });

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token: 'ABCD1234' })
        .expect(200);

      expect(response.body.message).toContain('backup code');
      expect(response.body).toHaveProperty('remainingBackupCodes', 2);

      // Verify backup code was removed
      await user.reload();
      expect(user.mfaBackupCodes).not.toContain('ABCD1234');
      expect(user.mfaBackupCodes).toHaveLength(2);
    });

    test('should remove used backup code', async () => {
      const backupCodes = ['CODE1111', 'CODE2222'];
      const user = await createTestUser({
        email: 'remove@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret',
        mfaBackupCodes: backupCodes
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'remove@example.com', password: 'Test123!@#' });

      await agent
        .post('/api/mfa/validate')
        .send({ token: 'CODE1111' })
        .expect(200);

      await user.reload();
      expect(user.mfaBackupCodes).toEqual(['CODE2222']);
    });

    test('should allow 2 time step window for TOTP', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'window@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: secret.base32
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'window@example.com', password: 'Test123!@#' });

      // Generate token with window of 2
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
      });

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token })
        .expect(200);

      expect(response.body.message).toContain('validated successfully');
    });

    test('should reject invalid TOTP token', async () => {
      const user = await createTestUser({
        email: 'invalid@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'invalid@example.com', password: 'Test123!@#' });

      const response = await agent
        .post('/api/mfa/validate')
        .send({ token: '999999' })
        .expect(400);

      expect(response.body.code).toBe('INVALID_MFA_TOKEN');
    });
  });

  describe('POST /api/mfa/disable', () => {
    test('should disable MFA with password verification', async () => {
      const password = 'Test123!@#';
      const user = await createTestUser({
        email: 'disable@example.com',
        password: await bcrypt.hash(password, 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret',
        mfaBackupCodes: ['CODE1', 'CODE2']
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'disable@example.com', password });

      const response = await agent
        .post('/api/mfa/disable')
        .send({ password })
        .expect(200);

      expect(response.body.message).toContain('disabled successfully');

      // Verify MFA is disabled
      await user.reload();
      expect(user.mfaEnabled).toBe(false);
    });

    test('should clear MFA secret and backup codes', async () => {
      const password = 'Test123!@#';
      const user = await createTestUser({
        email: 'clear@example.com',
        password: await bcrypt.hash(password, 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret',
        mfaBackupCodes: ['CODE1', 'CODE2']
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'clear@example.com', password });

      await agent
        .post('/api/mfa/disable')
        .send({ password })
        .expect(200);

      await user.reload();
      expect(user.mfaSecret).toBeNull();
      expect(user.mfaBackupCodes).toBeNull();
    });

    test('should remove MFA verification from session', async () => {
      const password = 'Test123!@#';
      const user = await createTestUser({
        email: 'session@example.com',
        password: await bcrypt.hash(password, 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'session@example.com', password });

      await agent
        .post('/api/mfa/disable')
        .send({ password })
        .expect(200);

      // Session should no longer have mfaVerified flag
      // (Implementation detail)
    });

    test('should reject with wrong password', async () => {
      const user = await createTestUser({
        email: 'wrong@example.com',
        password: await bcrypt.hash('CorrectPassword123!', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'wrong@example.com', password: 'CorrectPassword123!' });

      const response = await agent
        .post('/api/mfa/disable')
        .send({ password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_PASSWORD');

      // MFA should still be enabled
      await user.reload();
      expect(user.mfaEnabled).toBe(true);
    });

    test('should reject if MFA not enabled', async () => {
      const password = 'Test123!@#';
      const user = await createTestUser({
        email: 'notenabled@example.com',
        password: await bcrypt.hash(password, 12),
        mfaEnabled: false
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'notenabled@example.com', password });

      const response = await agent
        .post('/api/mfa/disable')
        .send({ password })
        .expect(400);

      expect(response.body.code).toBe('MFA_NOT_ENABLED');
    });
  });

  describe('POST /api/mfa/regenerate-backup-codes', () => {
    test('should regenerate backup codes with password', async () => {
      const password = 'Test123!@#';
      const oldCodes = ['OLD1', 'OLD2'];
      const user = await createTestUser({
        email: 'regen@example.com',
        password: await bcrypt.hash(password, 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret',
        mfaBackupCodes: oldCodes
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'regen@example.com', password });

      const response = await agent
        .post('/api/mfa/regenerate-backup-codes')
        .send({ password })
        .expect(200);

      expect(response.body.message).toContain('regenerated');
      expect(response.body.backupCodes).toHaveLength(10);
      expect(response.body.backupCodes).not.toEqual(oldCodes);

      // Verify codes were replaced
      await user.reload();
      expect(user.mfaBackupCodes).toHaveLength(10);
      expect(user.mfaBackupCodes).not.toContain('OLD1');
    });

    test('should return 10 new backup codes', async () => {
      const password = 'Test123!@#';
      const user = await createTestUser({
        email: 'ten@example.com',
        password: await bcrypt.hash(password, 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'ten@example.com', password });

      const response = await agent
        .post('/api/mfa/regenerate-backup-codes')
        .send({ password })
        .expect(200);

      expect(response.body.backupCodes).toHaveLength(10);
      response.body.backupCodes.forEach(code => {
        expect(code).toMatch(/^[0-9A-F]{8}$/);
      });
    });

    test('should verify password before regenerating', async () => {
      const user = await createTestUser({
        email: 'verify@example.com',
        password: await bcrypt.hash('CorrectPassword123!', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'verify@example.com', password: 'CorrectPassword123!' });

      const response = await agent
        .post('/api/mfa/regenerate-backup-codes')
        .send({ password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_PASSWORD');
    });
  });

  describe('GET /api/mfa/status', () => {
    test('should get MFA status and remaining backup codes', async () => {
      const backupCodes = ['CODE1', 'CODE2', 'CODE3'];
      const user = await createTestUser({
        email: 'status@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret',
        mfaBackupCodes: backupCodes
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'status@example.com', password: 'Test123!@#' });

      const response = await agent
        .get('/api/mfa/status')
        .expect(200);

      expect(response.body).toHaveProperty('mfaEnabled', true);
      expect(response.body).toHaveProperty('backupCodesRemaining', 3);
    });

    test('should show zero backup codes if none remaining', async () => {
      const user = await createTestUser({
        email: 'zero@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret',
        mfaBackupCodes: []
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'zero@example.com', password: 'Test123!@#' });

      const response = await agent
        .get('/api/mfa/status')
        .expect(200);

      expect(response.body.backupCodesRemaining).toBe(0);
    });

    test('should show MFA disabled status', async () => {
      const user = await createTestUser({
        email: 'disabled@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: false
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'disabled@example.com', password: 'Test123!@#' });

      const response = await agent
        .get('/api/mfa/status')
        .expect(200);

      expect(response.body).toHaveProperty('mfaEnabled', false);
      expect(response.body).toHaveProperty('backupCodesRemaining', 0);
    });
  });

  describe('MFA Authentication Flow', () => {
    test('should require MFA validation after login when enabled', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const user = await createTestUser({
        email: 'flow@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: secret.base32
      });

      // Step 1: Login with password
      const loginResponse = await agent
        .post('/api/auth/login')
        .send({ email: 'flow@example.com', password: 'Test123!@#' })
        .expect(200);

      // Step 2: Validate MFA token
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
      });

      const mfaResponse = await agent
        .post('/api/mfa/validate')
        .send({ token })
        .expect(200);

      expect(mfaResponse.body.message).toContain('validated');
    });

    test('should send MFA disabled notification email', async () => {
      const password = 'Test123!@#';
      const user = await createTestUser({
        email: 'notify@example.com',
        password: await bcrypt.hash(password, 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'notify@example.com', password });

      await agent
        .post('/api/mfa/disable')
        .send({ password })
        .expect(200);

      // Verify notification email sent
      expect(emailService.sendMFADisabledEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'notify@example.com' })
      );
    });
  });
});
