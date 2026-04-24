/**
 * Jest Test Setup
 * Configure test environment and global mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AUTH_DB_NAME = 'exprsn_auth_test';
process.env.REDIS_ENABLED = 'false'; // Disable Redis for unit tests
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CA_URL = 'http://localhost:3000';

// Mock logger to prevent console spam during tests
jest.mock('../src/services/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock email service
jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendMFADisabledEmail: jest.fn().mockResolvedValue(true),
}));

// Mock CA token service
jest.mock('../src/services/tokenService', () => ({
  generateServiceToken: jest.fn().mockResolvedValue('mock-ca-token-12345'),
  validateCAToken: jest.fn().mockResolvedValue({
    valid: true,
    token: { id: 'mock-token-id', userId: 'mock-user-id' }
  }),
  refreshServiceToken: jest.fn().mockResolvedValue('mock-refreshed-token'),
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});
