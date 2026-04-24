/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Modular Configuration
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This modular configuration system separates concerns into individual
 * modules for better maintainability, testability, and reusability.
 *
 * Each module handles a specific domain:
 *   - app.js          - Application settings
 *   - ca.js           - Certificate Authority settings
 *   - database.js     - PostgreSQL configuration
 *   - cache.js        - Redis cache configuration
 *   - security.js     - Security settings
 *   - session.js      - Session configuration
 *   - jwt.js          - JWT configuration
 *   - storage.js      - Storage backends
 *   - ocsp.js         - OCSP responder
 *   - crl.js          - CRL configuration
 *   - logging.js      - Logging configuration
 *   - token.js        - Token specification settings
 *   - permissions.js  - Permissions system
 *   - validator.js    - Configuration validation
 */

const dotenv = require('dotenv');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════
// Load Environment Variables
// ═══════════════════════════════════════════════════════════════════════

// Load .env file from project root
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

// ═══════════════════════════════════════════════════════════════════════
// Import Configuration Modules
// ═══════════════════════════════════════════════════════════════════════

const app = require('./app');
const ca = require('./ca');
const database = require('./database');
const cache = require('./cache');
const security = require('./security');
const session = require('./session');
const jwt = require('./jwt');
const storage = require('./storage');
const ocsp = require('./ocsp');
const crl = require('./crl');
const logging = require('./logging');
const token = require('./token');
const permissions = require('./permissions');
const { validateConfig } = require('./validator');

// ═══════════════════════════════════════════════════════════════════════
// Aggregate Configuration Object
// ═══════════════════════════════════════════════════════════════════════

/**
 * Main configuration object
 * Aggregates all configuration modules for backwards compatibility
 *
 * @type {Object}
 */
const config = {
  app,
  ca,
  database,
  redis: cache,  // Alias 'cache' as 'redis' for backwards compatibility
  security,
  session,
  jwt,
  storage,
  ocsp,
  crl,
  logging,
  token,
  permissions
};

// ═══════════════════════════════════════════════════════════════════════
// Configuration Validation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate configuration on module load
 * Errors are logged and process exits in production
 */
const validationErrors = validateConfig(config);

if (validationErrors.length > 0 && app.env === 'development') {
  console.warn('═══════════════════════════════════════════════════════════');
  console.warn('Configuration Warnings (development mode):');
  console.warn('═══════════════════════════════════════════════════════════');
  validationErrors.forEach(err => console.warn(`  ⚠ ${err}`));
  console.warn('═══════════════════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

/**
 * Export the aggregated configuration object
 * This maintains backwards compatibility with existing code
 */
module.exports = config;

/**
 * Export the validation function for testing
 * When called as config.validate(), it automatically passes the config object
 */
module.exports.validate = () => validateConfig(config);

/**
 * Export individual modules for granular imports
 * Allows importing specific configuration modules:
 *
 * @example
 * const { database } = require('./config');
 * const dbConfig = database;
 *
 * @example
 * const appConfig = require('./config/app');
 */
module.exports.modules = {
  app,
  ca,
  database,
  cache,
  security,
  session,
  jwt,
  storage,
  ocsp,
  crl,
  logging,
  token,
  permissions
};
