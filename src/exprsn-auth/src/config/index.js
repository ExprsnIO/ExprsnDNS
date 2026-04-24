/**
 * ═══════════════════════════════════════════════════════════
 * Configuration
 * Central configuration for Auth service
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  // Service configuration
  service: {
    port: process.env.AUTH_SERVICE_PORT || 3001,
    host: process.env.AUTH_SERVICE_HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // Database configuration
  database: {
    host: process.env.AUTH_DB_HOST || 'localhost',
    port: parseInt(process.env.AUTH_DB_PORT) || 5432,
    database: process.env.AUTH_DB_NAME || 'exprsn_auth',
    username: process.env.AUTH_DB_USER || 'postgres',
    password: process.env.AUTH_DB_PASSWORD || 'postgres',
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  },

  // Redis configuration
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null
  },

  // CA configuration
  ca: {
    url: process.env.CA_URL || 'http://localhost:3000',
    domain: process.env.AUTH_CA_DOMAIN || 'auth.exprsn.io',
    certificateSerial: process.env.AUTH_CERT_SERIAL,
    privateKeyPath: process.env.AUTH_PRIVATE_KEY_PATH,
    certificatePath: process.env.AUTH_CERTIFICATE_PATH,
    rootCertPath: process.env.CA_ROOT_CERT_PATH,
    ocspUrl: process.env.OCSP_RESPONDER_URL || 'http://localhost:2560'
  },

  // Session configuration
  session: {
    secret: process.env.SESSION_SECRET || 'exprsn-auth-secret-change-in-production',
    lifetime: parseInt(process.env.SESSION_LIFETIME) || 3600000, // 1 hour
    idleTimeout: parseInt(process.env.SESSION_IDLE_TIMEOUT) || 900000 // 15 minutes
  },

  // OAuth2 configuration
  oauth2: {
    authorizationCodeLifetime: 300, // 5 minutes
    accessTokenLifetime: 3600, // 1 hour
    refreshTokenLifetime: 86400 * 7, // 7 days
    requireClientAuthentication: {
      authorization_code: false,
      refresh_token: true
    }
  },

  // External OAuth providers
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback'
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/auth/github/callback'
    }
  },

  // Security
  security: {
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900000, // 15 minutes
    passwordMinLength: 12,
    requireMFA: process.env.REQUIRE_MFA === 'true'
  },

  // Token defaults
  tokenDefaults: {
    expiryType: 'time',
    expirySeconds: 3600, // 1 hour
    resourceType: 'url'
  }
};
