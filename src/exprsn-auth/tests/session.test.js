/**
 * Session Tests
 * Tests for session creation, management, and revocation
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  getModels
} = require('./helpers/testDatabase');

describe('Sessions', () => {
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

  describe('Session Creation', () => {
    test('should create session on login', async () => {
      const user = await createTestUser({
        email: 'session@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const response = await agent
        .post('/api/auth/login')
        .send({
          email: 'session@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      expect(response.body.message).toContain('Login successful');

      // Verify session was created in database
      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session).toBeTruthy();
      expect(session.active).toBe(true);
    });

    test('should store user data in session', async () => {
      const user = await createTestUser({
        email: 'data@example.com',
        password: await bcrypt.hash('Test123!@#', 12),
        displayName: 'Test User'
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'data@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session).toBeTruthy();
      expect(session.userId).toBe(user.id);
    });

    test('should set session expiration', async () => {
      const user = await createTestUser({
        email: 'expire@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'expire@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session.expiresAt).toBeTruthy();
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('should store IP address and user agent', async () => {
      const user = await createTestUser({
        email: 'tracking@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 Test Browser')
        .send({
          email: 'tracking@example.com',
          password: 'Test123!@#'
        })
        .expect(200);

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      expect(session.ipAddress).toBeTruthy();
      expect(session.userAgent).toBeTruthy();
    });
  });

  describe('Session Management', () => {
    test('should get active sessions for user', async () => {
      const user = await createTestUser({
        email: 'active@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create multiple sessions
      await models.Session.create({
        sessionId: 'session-1',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser 1',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await models.Session.create({
        sessionId: 'session-2',
        userId: user.id,
        ipAddress: '127.0.0.2',
        userAgent: 'Browser 2',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'active@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      expect(response.body.sessions).toHaveLength(3); // 2 created + 1 from login
      expect(response.body.sessions[0]).toHaveProperty('id');
      expect(response.body.sessions[0]).toHaveProperty('sessionId');
      expect(response.body.sessions[0]).toHaveProperty('ipAddress');
      expect(response.body.sessions[0]).toHaveProperty('userAgent');
      expect(response.body.sessions[0]).toHaveProperty('lastActivityAt');
    });

    test('should mark current session in list', async () => {
      const user = await createTestUser({
        email: 'current@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'current@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      const currentSession = response.body.sessions.find(s => s.isCurrent);
      expect(currentSession).toBeTruthy();
    });

    test('should get current session details', async () => {
      const user = await createTestUser({
        email: 'details@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'details@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions/current')
        .expect(200);

      expect(response.body.session).toBeTruthy();
      expect(response.body.session.isCurrent).toBe(true);
      expect(response.body.session).toHaveProperty('sessionId');
      expect(response.body.session).toHaveProperty('expiresAt');
    });

    test('should filter out expired sessions', async () => {
      const user = await createTestUser({
        email: 'expired@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create active session
      await models.Session.create({
        sessionId: 'active-session',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      // Create expired session
      await models.Session.create({
        sessionId: 'expired-session',
        userId: user.id,
        ipAddress: '127.0.0.2',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() - 1000), // Expired
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'expired@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      // Should only include non-expired sessions
      expect(response.body.sessions.every(s =>
        new Date(s.expiresAt).getTime() > Date.now()
      )).toBe(true);
    });

    test('should filter out inactive sessions', async () => {
      const user = await createTestUser({
        email: 'inactive@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create inactive session
      await models.Session.create({
        sessionId: 'inactive-session',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: false,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'inactive@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .get('/api/sessions')
        .expect(200);

      // Should only include active sessions
      expect(response.body.sessions.every(s =>
        s.ipAddress !== '127.0.0.1' // Inactive session
      )).toBe(true);
    });
  });

  describe('Session Revocation', () => {
    test('should revoke specific session', async () => {
      const user = await createTestUser({
        email: 'revoke@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const sessionToRevoke = await models.Session.create({
        sessionId: 'revoke-this',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'revoke@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .delete(`/api/sessions/${sessionToRevoke.id}`)
        .expect(200);

      expect(response.body.message).toContain('revoked');

      // Verify session is inactive
      await sessionToRevoke.reload();
      expect(sessionToRevoke.active).toBe(false);
    });

    test('should prevent revoking current session', async () => {
      const user = await createTestUser({
        email: 'current@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'current@example.com',
          password: 'Test123!@#'
        });

      // Get current session
      const currentResponse = await agent
        .get('/api/sessions/current')
        .expect(200);

      const currentSessionId = currentResponse.body.session.id;

      // Try to revoke current session
      const response = await agent
        .delete(`/api/sessions/${currentSessionId}`)
        .expect(400);

      expect(response.body.code).toBe('CANNOT_REVOKE_CURRENT_SESSION');
    });

    test('should revoke all sessions except current', async () => {
      const user = await createTestUser({
        email: 'all@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create multiple sessions
      const session1 = await models.Session.create({
        sessionId: 'session-1',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser 1',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      const session2 = await models.Session.create({
        sessionId: 'session-2',
        userId: user.id,
        ipAddress: '127.0.0.2',
        userAgent: 'Browser 2',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      // Login to create current session
      await agent
        .post('/api/auth/login')
        .send({
          email: 'all@example.com',
          password: 'Test123!@#'
        });

      const response = await agent
        .delete('/api/sessions')
        .expect(200);

      expect(response.body.message).toContain('revoked');
      expect(response.body.revokedCount).toBe(2);

      // Verify other sessions are inactive
      await session1.reload();
      await session2.reload();
      expect(session1.active).toBe(false);
      expect(session2.active).toBe(false);

      // Verify current session still active
      const currentSession = await models.Session.findOne({
        where: { userId: user.id, active: true }
      });
      expect(currentSession).toBeTruthy();
    });

    test('should only revoke own sessions', async () => {
      const user1 = await createTestUser({
        email: 'user1@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const user2 = await createTestUser({
        email: 'user2@example.com'
      });

      const user2Session = await models.Session.create({
        sessionId: 'user2-session',
        userId: user2.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() + 86400000),
        lastActivityAt: new Date()
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'user1@example.com',
          password: 'Test123!@#'
        });

      // Try to revoke another user's session
      const response = await agent
        .delete(`/api/sessions/${user2Session.id}`)
        .expect(404);

      expect(response.body.code).toBe('SESSION_NOT_FOUND');

      // Verify session is still active
      await user2Session.reload();
      expect(user2Session.active).toBe(true);
    });
  });

  describe('Session Timeout', () => {
    test('should handle session timeout', async () => {
      const user = await createTestUser({
        email: 'timeout@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create expired session
      const expiredSession = await models.Session.create({
        sessionId: 'expired-session',
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Browser',
        active: true,
        expiresAt: new Date(Date.now() - 1000), // Expired
        lastActivityAt: new Date(Date.now() - 1000)
      });

      // Sessions should automatically be filtered by expiry
      const activeSessions = await models.Session.findAll({
        where: {
          userId: user.id,
          active: true,
          expiresAt: {
            [require('sequelize').Op.gt]: new Date()
          }
        }
      });

      expect(activeSessions).toHaveLength(0);
    });

    test('should refresh session expiry on activity', async () => {
      const user = await createTestUser({
        email: 'refresh@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'refresh@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      const originalExpiry = session.expiresAt;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Make a request to refresh session
      const response = await agent
        .post('/api/sessions/refresh')
        .expect(200);

      expect(response.body.message).toContain('refreshed');

      // Verify expiry was extended
      await session.reload();
      expect(session.expiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());
    });

    test('should update last activity timestamp', async () => {
      const user = await createTestUser({
        email: 'activity@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'activity@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      const originalActivity = session.lastActivityAt;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refresh session
      await agent
        .post('/api/sessions/refresh')
        .expect(200);

      // Verify last activity was updated
      await session.reload();
      expect(session.lastActivityAt.getTime()).toBeGreaterThan(originalActivity.getTime());
    });
  });

  describe('Session Security', () => {
    test('should require authentication to view sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect(401);

      expect(response.body.code).toBe('NOT_AUTHENTICATED');
    });

    test('should require authentication to revoke sessions', async () => {
      const response = await request(app)
        .delete('/api/sessions/some-session-id')
        .expect(401);

      expect(response.body.code).toBe('NOT_AUTHENTICATED');
    });

    test('should destroy session on logout', async () => {
      const user = await createTestUser({
        email: 'logout@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'logout@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id, active: true }
      });

      expect(session).toBeTruthy();

      // Logout
      await agent
        .post('/api/auth/logout')
        .expect(200);

      // Verify session is destroyed or inactive
      await session.reload();
      expect(session.active).toBe(false);
    });

    test('should store session data securely', async () => {
      const user = await createTestUser({
        email: 'secure@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({
          email: 'secure@example.com',
          password: 'Test123!@#'
        });

      const session = await models.Session.findOne({
        where: { userId: user.id }
      });

      // Session should not contain sensitive data directly
      expect(session).not.toHaveProperty('password');
      expect(session).not.toHaveProperty('passwordHash');
    });
  });

  describe('Multiple Sessions', () => {
    test('should allow multiple active sessions per user', async () => {
      const user = await createTestUser({
        email: 'multi@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      // Create first session
      const agent1 = request.agent(app);
      await agent1
        .post('/api/auth/login')
        .send({
          email: 'multi@example.com',
          password: 'Test123!@#'
        });

      // Create second session
      const agent2 = request.agent(app);
      await agent2
        .post('/api/auth/login')
        .send({
          email: 'multi@example.com',
          password: 'Test123!@#'
        });

      // Verify both sessions exist
      const sessions = await models.Session.findAll({
        where: { userId: user.id, active: true }
      });

      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    test('should track sessions independently', async () => {
      const user = await createTestUser({
        email: 'independent@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const agent1 = request.agent(app);
      await agent1
        .post('/api/auth/login')
        .send({
          email: 'independent@example.com',
          password: 'Test123!@#'
        });

      const agent2 = request.agent(app);
      await agent2
        .post('/api/auth/login')
        .send({
          email: 'independent@example.com',
          password: 'Test123!@#'
        });

      // Get sessions from each agent
      const response1 = await agent1
        .get('/api/sessions')
        .expect(200);

      const response2 = await agent2
        .get('/api/sessions')
        .expect(200);

      // Each should see the same total number of sessions
      expect(response1.body.sessions.length).toBe(response2.body.sessions.length);

      // But each should mark a different session as current
      const current1 = response1.body.sessions.find(s => s.isCurrent);
      const current2 = response2.body.sessions.find(s => s.isCurrent);

      expect(current1.sessionId).not.toBe(current2.sessionId);
    });
  });
});
