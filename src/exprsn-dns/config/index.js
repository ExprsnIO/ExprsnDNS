/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn DNS - Configuration Aggregator
 * ═══════════════════════════════════════════════════════════════════════
 */

const dotenv = require('dotenv');
const path = require('path');

const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

const app = require('./app');
const dns = require('./dns');
const database = require('./database');
const cache = require('./cache');
const logging = require('./logging');
const security = require('./security');

const config = {
  app,
  dns,
  database,
  cache,
  logging,
  security,

  env: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
};

module.exports = config;
