/**
 * Exprsn DNS - Security Configuration
 */

module.exports = {
  apiKey: process.env.DNS_API_KEY || '',
  requireAuth: process.env.DNS_REQUIRE_AUTH !== 'false',

  jwt: {
    secret: process.env.DNS_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production',
    issuer: process.env.DNS_JWT_ISSUER || 'exprsn-auth',
    audience: process.env.DNS_JWT_AUDIENCE || 'exprsn-dns',
    algorithms: (process.env.DNS_JWT_ALGORITHMS || 'HS256,RS256').split(',')
  },

  cors: {
    origin: (process.env.DNS_CORS_ORIGIN || '*').split(','),
    credentials: process.env.DNS_CORS_CREDENTIALS === 'true'
  },

  rateLimit: {
    windowMs: parseInt(process.env.DNS_API_RATE_WINDOW || '60000', 10),
    max: parseInt(process.env.DNS_API_RATE_MAX || '120', 10)
  },

  tsig: {
    enabled: process.env.DNS_TSIG_ENABLED === 'true',
    defaultAlgorithm: process.env.DNS_TSIG_ALGO || 'hmac-sha256'
  }
};
