/**
 * Exprsn DNS - Application Configuration
 */

module.exports = {
  name: process.env.DNS_APP_NAME || 'Exprsn DNS',
  host: process.env.DNS_API_HOST || '0.0.0.0',
  port: parseInt(process.env.DNS_API_PORT || '3053', 10),
  baseUrl: process.env.DNS_BASE_URL || 'http://localhost:3053',

  trustProxy: process.env.DNS_TRUST_PROXY === 'true',
  bodyLimit: process.env.DNS_BODY_LIMIT || '1mb',

  ca: {
    baseUrl: process.env.EXPRSN_CA_URL || 'http://localhost:3001',
    enabled: process.env.EXPRSN_CA_ENABLED !== 'false'
  },
  auth: {
    baseUrl: process.env.EXPRSN_AUTH_URL || 'http://localhost:3002',
    enabled: process.env.EXPRSN_AUTH_ENABLED !== 'false'
  }
};
