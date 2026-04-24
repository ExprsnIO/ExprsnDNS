/**
 * Exprsn DNS - Redis Cache Configuration
 */

module.exports = {
  host: process.env.DNS_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.DNS_REDIS_PORT || process.env.REDIS_PORT || '6379', 10),
  password: process.env.DNS_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.DNS_REDIS_DB || '3', 10),

  keyPrefix: process.env.DNS_REDIS_PREFIX || 'exprsn:dns:',
  enableOfflineQueue: true,

  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  }
};
