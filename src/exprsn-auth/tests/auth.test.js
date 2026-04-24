/**
 * Authentication Tests
 * Tests for user registration, login, email verification, and password management
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  getModels
} = require('./helpers/testDatabase');
const emailService = require('../src/services/emailService');
const tokenService = require('../src/services/tokenService');

describe('Authentication', () => {
  let models;

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
  });

  describe('POST /api/auth/register', () => {
    test('should register new user with valid credentials', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'Test123!@#Strong',
        displayName: 'New User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.displayName).toBe(userData.displayName);
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify user was created in database
      const user = await models.User.findOne({ where: { email: userData.email } });
      expect(user).toBeTruthy();
      expect(user.emailVerified).toBe(false);
      expect(user.emailVerificationToken).toBeTruthy();

      // Verify emails were sent
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: userData.email }),
        expect.any(String)
      );
      expect(emailService.sendWelcomeEmail).toHaveBeenCalled();

      // Verify CA token was generated
      expect(tokenService.generateServiceToken).toHaveBeenCalled();
    });

    test('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'weak',
        displayName: 'Test User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.code).toBe('WEAK_PASSWORD');
      expect(response.body.message).toContain('at least');
    });

    test('should reject registration with existing email', async () => {
      const existingUser = await createTestUser({
        email: 'existing@example.com'
      });

      const userData = {
        email: 'existing@example.com',
        password: 'Test123!@#Strong',
        displayName: 'Test User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.code).toBe('USER_EXISTS');
    });

    test('should generate email verification token on registration', async () => {
      const userData = {
        email: 'verify@example.com',
        password: 'Test123!@#Strong'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const user = await models.User.findOne({ where: { email: userData.email } });
      expect(user.emailVerificationToken).toBeTruthy();
      expect(user.emailVerificationToken).toHaveLength(64);
      expect(user.emailVerified).toBe(false);
    });

    test('should return CA token on successful registration', async () => {
      const userData = {
        email: 'token@example.com',
        password: 'Test123!@#Strong'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.token).toBeTruthy();
      expect(response.body.token).toBe('mock-ca-token-12345');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const user = await createTestUser({
        email: 'login@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        emailVerified: true
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('login@example.com');
    });

    test('should reject login with invalid credentials', async () => {
      await createTestUser({
        email: 'test@example.com',
        password: await bcrypt.hash('CorrectPassword123!', 12)
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.code).toBe('AUTH_FAILED');
    });

    test('should return CA token on successful login', async () => {
      await createTestUser({
        email: 'token@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'token@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body.token).toBeTruthy();
      expect(tokenService.generateServiceToken).toHaveBeenCalled();
    });

    test('should handle MFA requirement if enabled', async () => {
      const user = await createTestUser({
        email: 'mfa@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        mfaEnabled: true,
        mfaSecret: 'test-secret'
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'mfa@example.com',
          password: 'Test123!@#'
        });

      // Should succeed but require MFA verification
      expect(response.status).toBe(200);
    });

    test('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123!@#'
        })
        .expect(401);

      expect(response.body.code).toBe('AUTH_FAILED');
    });
  });

  describe('POST /api/auth/verify-email', () => {
    test('should verify email with valid token', async () => {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const user = await createTestUser({
        email: 'verify@example.com',
        emailVerified: false,
        emailVerificationToken: verificationToken
      });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: verificationToken })
        .expect(200);

      expect(response.body.message).toContain('verified');

      // Verify in database
      await user.reload();
      expect(user.emailVerified).toBe(true);
      expect(user.emailVerificationToken).toBeNull();
    });

    test('should reject invalid verification token', async () => {
      await createTestUser({
        email: 'test@example.com',
        emailVerificationToken: 'valid-token'
      });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'invalid-token' })
        .expect(400);

      expect(response.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    test('should resend verification email', async () => {
      const user = await createTestUser({
        email: 'resend@example.com',
        emailVerified: false,
        emailVerificationToken: 'old-token'
      });

      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'resend@example.com' })
        .expect(200);

      expect(response.body.message).toContain('verification');

      // Verify new token was generated
      await user.reload();
      expect(user.emailVerificationToken).not.toBe('old-token');
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });

    test('should prevent resending if already verified', async () => {
      await createTestUser({
        email: 'verified@example.com',
        emailVerified: true
      });

      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'verified@example.com' })
        .expect(200);

      expect(response.body.message).toContain('already verified');
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    test('should not reveal if email does not exist', async () => {
      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toBeTruthy();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    test('should request password reset with valid email', async () => {
      const user = await createTestUser({
        email: 'reset@example.com'
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@example.com' })
        .expect(200);

      expect(response.body.message).toContain('password reset');

      // Verify reset token was generated
      await user.reload();
      expect(user.resetPasswordToken).toBeTruthy();
      expect(user.resetPasswordExpires).toBeTruthy();
      expect(new Date(user.resetPasswordExpires)).toBeInstanceOf(Date);

      // Verify email was sent
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    test('should not reveal if email does not exist', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.message).toContain('password reset');
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    test('should generate reset token with expiration', async () => {
      const user = await createTestUser({
        email: 'expire@example.com'
      });

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'expire@example.com' })
        .expect(200);

      await user.reload();
      expect(user.resetPasswordToken).toHaveLength(64);
      expect(user.resetPasswordExpires).toBeTruthy();

      // Should expire in approximately 1 hour
      const expiryTime = new Date(user.resetPasswordExpires).getTime();
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      expect(expiryTime - now).toBeGreaterThan(oneHour - 60000); // Allow 1 min tolerance
      expect(expiryTime - now).toBeLessThan(oneHour + 60000);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    test('should reset password with valid token', async () => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const user = await createTestUser({
        email: 'reset@example.com',
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() + 3600000 // 1 hour from now
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewPassword123!@#'
        })
        .expect(200);

      expect(response.body.message).toContain('reset successful');

      // Verify password was changed and token cleared
      await user.reload();
      expect(user.resetPasswordToken).toBeNull();
      expect(user.resetPasswordExpires).toBeNull();

      // Verify new password works
      const isValid = await bcrypt.compare('NewPassword123!@#', user.passwordHash);
      expect(isValid).toBe(true);
    });

    test('should reject expired reset token', async () => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await createTestUser({
        email: 'expired@example.com',
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() - 1000 // Expired 1 second ago
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewPassword123!@#'
        })
        .expect(400);

      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    test('should reject weak new password', async () => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await createTestUser({
        email: 'reset@example.com',
        resetPasswordToken: resetToken,
        resetPasswordExpires: Date.now() + 3600000
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'weak'
        })
        .expect(400);

      expect(response.body.code).toBe('WEAK_PASSWORD');
    });
  });

  describe('POST /api/auth/change-password', () => {
    test('should change password for authenticated user', async () => {
      const user = await createTestUser({
        email: 'change@example.com',
        password: await bcrypt.hash('OldPassword123!', 12)
      });

      // Login first to get session
      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'change@example.com',
          password: 'OldPassword123!'
        });

      const response = await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!@#'
        })
        .expect(200);

      expect(response.body.message).toContain('changed successfully');

      // Verify password was changed
      await user.reload();
      const isValid = await bcrypt.compare('NewPassword123!@#', user.passwordHash);
      expect(isValid).toBe(true);

      // Verify security alert email was sent
      expect(emailService.sendSecurityAlertEmail).toHaveBeenCalled();
    });

    test('should verify current password before changing', async () => {
      await createTestUser({
        email: 'verify@example.com',
        password: await bcrypt.hash('CurrentPassword123!', 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'verify@example.com',
          password: 'CurrentPassword123!'
        });

      const response = await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!@#'
        })
        .expect(401);

      expect(response.body.code).toBe('INVALID_PASSWORD');
    });

    test('should reject if new password same as current', async () => {
      const password = 'SamePassword123!@#';
      await createTestUser({
        email: 'same@example.com',
        password: await bcrypt.hash(password, 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'same@example.com',
          password
        });

      const response = await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: password,
          newPassword: password
        })
        .expect(400);

      expect(response.body.code).toBe('SAME_PASSWORD');
    });

    test('should send security alert email after change', async () => {
      await createTestUser({
        email: 'alert@example.com',
        password: await bcrypt.hash('OldPassword123!', 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'alert@example.com',
          password: 'OldPassword123!'
        });

      await agent
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!@#'
        })
        .expect(200);

      expect(emailService.sendSecurityAlertEmail).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          type: 'Password Changed'
        })
      );
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout authenticated user', async () => {
      await createTestUser({
        email: 'logout@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'logout@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.message).toContain('Logout successful');

      // Verify subsequent requests are not authenticated
      await agent
        .get('/api/auth/me')
        .expect(401);
    });

    test('should reject logout for unauthenticated user', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.code).toBe('NOT_AUTHENTICATED');
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return current authenticated user', async () => {
      const user = await createTestUser({
        email: 'me@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        displayName: 'Test User'
      });

      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({
          email: 'me@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/auth/me')
        .expect(200);

      expect(response.body.user).toHaveProperty('id', user.id);
      expect(response.body.user).toHaveProperty('email', 'me@example.com');
      expect(response.body.user).toHaveProperty('displayName', 'Test User');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    test('should reject request for unauthenticated user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.code).toBe('NOT_AUTHENTICATED');
    });
  });
});
