/**
 * Exprsn DNS - Logging Configuration
 */

module.exports = {
  level: process.env.DNS_LOG_LEVEL || process.env.LOG_LEVEL || 'info',
  format: process.env.DNS_LOG_FORMAT || 'json',
  dir: process.env.DNS_LOG_DIR || './logs',
  maxSize: process.env.DNS_LOG_MAX_SIZE || '10m',
  maxFiles: process.env.DNS_LOG_MAX_FILES || '14d',

  queryLog: {
    enabled: process.env.DNS_QUERY_LOG_ENABLED !== 'false',
    sampleRate: parseFloat(process.env.DNS_QUERY_LOG_SAMPLE || '1.0')
  }
};
