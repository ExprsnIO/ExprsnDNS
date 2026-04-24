/**
 * Exprsn DNS - Redis Client
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('./logger');

let client = null;

function getRedis() {
  if (client) return client;

  client = new Redis({
    host: config.cache.host,
    port: config.cache.port,
    password: config.cache.password,
    db: config.cache.db,
    keyPrefix: config.cache.keyPrefix,
    enableOfflineQueue: config.cache.enableOfflineQueue,
    maxRetriesPerRequest: config.cache.maxRetriesPerRequest,
    retryStrategy: config.cache.retryStrategy,
    lazyConnect: true
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('ready', () => logger.debug('Redis ready'));
  client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
}

async function connect() {
  const r = getRedis();
  if (r.status === 'wait' || r.status === 'end') {
    await r.connect();
  }
  return r;
}

async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = { getRedis, connect, disconnect };
