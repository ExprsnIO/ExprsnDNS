/**
 * Exprsn DNS - Answer Cache
 *
 * Redis-backed cache keyed by (qname, qtype, qclass). Values are the JSON
 * representation of answer records, already formatted for dns2.
 */

const { getRedis } = require('../utils/redis');
const config = require('../config');
const logger = require('../utils/logger');

function cacheKey(qname, qtype, qclass = 'IN') {
  return `q:${qclass}:${qtype}:${qname.toLowerCase()}`;
}

async function get(qname, qtype, qclass) {
  if (!config.dns.cache.enabled) return null;
  try {
    const raw = await getRedis().get(cacheKey(qname, qtype, qclass));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.debug('Cache get failed', { error: err.message });
    return null;
  }
}

async function set(qname, qtype, qclass, payload, ttlSeconds) {
  if (!config.dns.cache.enabled) return;
  const ttl = Math.max(1, Math.min(ttlSeconds || config.dns.cache.ttl, config.dns.maximumTtl));
  try {
    await getRedis().setex(cacheKey(qname, qtype, qclass), ttl, JSON.stringify(payload));
  } catch (err) {
    logger.debug('Cache set failed', { error: err.message });
  }
}

async function invalidateZone(zoneName) {
  if (!config.dns.cache.enabled) return 0;
  const pattern = `*:*:*${zoneName.toLowerCase()}`;
  let cursor = '0';
  let removed = 0;
  const redis = getRedis();
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    if (keys.length) {
      removed += await redis.del(...keys);
    }
  } while (cursor !== '0');
  return removed;
}

module.exports = { get, set, invalidateZone, cacheKey };
