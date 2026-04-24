/**
 * Exprsn DNS - DNS Server Configuration
 */

module.exports = {
  udp: {
    enabled: process.env.DNS_UDP_ENABLED !== 'false',
    host: process.env.DNS_UDP_HOST || '0.0.0.0',
    port: parseInt(process.env.DNS_UDP_PORT || '53', 10)
  },
  tcp: {
    enabled: process.env.DNS_TCP_ENABLED !== 'false',
    host: process.env.DNS_TCP_HOST || '0.0.0.0',
    port: parseInt(process.env.DNS_TCP_PORT || '53', 10)
  },
  doh: {
    enabled: process.env.DNS_DOH_ENABLED === 'true',
    path: process.env.DNS_DOH_PATH || '/dns-query'
  },
  dot: {
    enabled: process.env.DNS_DOT_ENABLED === 'true',
    port: parseInt(process.env.DNS_DOT_PORT || '853', 10),
    certPath: process.env.DNS_DOT_CERT_PATH || '',
    keyPath: process.env.DNS_DOT_KEY_PATH || ''
  },

  defaultTtl: parseInt(process.env.DNS_DEFAULT_TTL || '3600', 10),
  minimumTtl: parseInt(process.env.DNS_MINIMUM_TTL || '300', 10),
  maximumTtl: parseInt(process.env.DNS_MAXIMUM_TTL || '604800', 10),
  negativeTtl: parseInt(process.env.DNS_NEGATIVE_TTL || '300', 10),

  soa: {
    refresh: parseInt(process.env.DNS_SOA_REFRESH || '3600', 10),
    retry: parseInt(process.env.DNS_SOA_RETRY || '1800', 10),
    expire: parseInt(process.env.DNS_SOA_EXPIRE || '604800', 10),
    minimum: parseInt(process.env.DNS_SOA_MINIMUM || '300', 10),
    primaryNs: process.env.DNS_SOA_PRIMARY_NS || 'ns1.exprsn.local',
    adminEmail: process.env.DNS_SOA_ADMIN_EMAIL || 'hostmaster.exprsn.local'
  },

  recursion: {
    enabled: process.env.DNS_RECURSION_ENABLED === 'true',
    upstream: (process.env.DNS_RECURSION_UPSTREAM || '1.1.1.1,8.8.8.8').split(',')
  },

  dnssec: {
    enabled: process.env.DNS_DNSSEC_ENABLED === 'true',
    algorithm: process.env.DNS_DNSSEC_ALGORITHM || 'RSASHA256'
  },

  cache: {
    enabled: process.env.DNS_CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.DNS_CACHE_TTL || '300', 10),
    maxEntries: parseInt(process.env.DNS_CACHE_MAX_ENTRIES || '10000', 10)
  },

  rateLimit: {
    enabled: process.env.DNS_RATELIMIT_ENABLED !== 'false',
    queriesPerSecond: parseInt(process.env.DNS_RATELIMIT_QPS || '50', 10),
    burst: parseInt(process.env.DNS_RATELIMIT_BURST || '100', 10)
  }
};
