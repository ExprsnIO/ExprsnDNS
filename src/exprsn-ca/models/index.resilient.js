/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Database Models (Resilient Version)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This is an example implementation using the resilient database connection
 * that automatically falls back to SQLite when PostgreSQL is unavailable.
 *
 * To use this version, rename this file to index.js
 */

const { Sequelize } = require('sequelize');
const { createResilientConnection } = require('../../shared/database/resilientConnection');
const config = require('../config');
const logger = require('../utils/logger');

let dbConnection = null;
let sequelize = null;

/**
 * Initialize database connection with resilient fallback
 */
async function initializeDatabase() {
  try {
    dbConnection = await createResilientConnection({
      serviceName: 'exprsn-ca',

      // PostgreSQL configuration (primary)
      primary: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        username: config.database.username,
        password: config.database.password,
        pool: config.database.pool,
        ssl: config.database.ssl,
        logging: config.database.logging
      },

      // SQLite configuration (fallback)
      fallback: {
        storageDir: process.env.SQLITE_DIR || './data/sqlite',
        logging: config.env === 'development' ? console.log : false
      },

      // Connection options
      options: {
        // Only allow SQLite fallback in development/test
        allowSQLiteFallback: config.env !== 'production',
        autoReconnect: true,
        maxRetries: process.env.DB_MAX_RETRIES || 5,
        retryDelay: process.env.DB_RETRY_DELAY || 2000,
        healthCheckInterval: process.env.DB_HEALTH_CHECK_INTERVAL || 30000
      },

      // Custom logger
      logger: logger
    });

    sequelize = dbConnection.getSequelize();

    // Log connection status
    const status = dbConnection.getStatus();
    if (status.fallback) {
      logger.warn('CA Service running in SQLite fallback mode');
      logger.warn('Some features may be limited. Start PostgreSQL for full functionality.');
    } else {
      logger.info('CA Service connected to PostgreSQL');
    }

    // Listen for connection events
    dbConnection.on('recovered', ({ from, to }) => {
      logger.info(`Database connection recovered: ${from} → ${to}`);
      logger.info('Full PostgreSQL functionality restored');
    });

    dbConnection.on('healthCheckFailed', ({ dialect, error }) => {
      logger.error(`Database health check failed (${dialect}):`, {
        error: error.message,
        code: error.code
      });
    });

    return sequelize;

  } catch (error) {
    logger.error('Failed to initialize database connection', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Initialize connection immediately
const initPromise = initializeDatabase();

// Import models (these will use the sequelize instance once initialized)
// We export a promise that resolves to the db object
async function getDb() {
  await initPromise;

  // Import models
  const User = require('./User')(sequelize, Sequelize.DataTypes);
  const Profile = require('./Profile')(sequelize, Sequelize.DataTypes);
  const Group = require('./Group')(sequelize, Sequelize.DataTypes);
  const Role = require('./Role')(sequelize, Sequelize.DataTypes);
  const RoleSet = require('./RoleSet')(sequelize, Sequelize.DataTypes);
  const Certificate = require('./Certificate')(sequelize, Sequelize.DataTypes);
  const Token = require('./Token')(sequelize, Sequelize.DataTypes);
  const Ticket = require('./Ticket')(sequelize, Sequelize.DataTypes);
  const RevocationList = require('./RevocationList')(sequelize, Sequelize.DataTypes);
  const AuditLog = require('./AuditLog')(sequelize, Sequelize.DataTypes);
  const RateLimit = require('./RateLimit')(sequelize, Sequelize.DataTypes);
  const PasswordReset = require('./PasswordReset')(sequelize, Sequelize.DataTypes);

  // ═══════════════════════════════════════════════════════════════════════
  // Model Associations
  // ═══════════════════════════════════════════════════════════════════════

  // User <-> Profile (One-to-Many)
  User.hasMany(Profile, { foreignKey: 'userId', as: 'profiles', onDelete: 'CASCADE' });
  Profile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User <-> Group (Many-to-Many)
  User.belongsToMany(Group, { through: 'UserGroups', as: 'groups', foreignKey: 'userId' });
  Group.belongsToMany(User, { through: 'UserGroups', as: 'users', foreignKey: 'groupId' });

  // User <-> Role (Many-to-Many)
  User.belongsToMany(Role, { through: 'UserRoles', as: 'roles', foreignKey: 'userId' });
  Role.belongsToMany(User, { through: 'UserRoles', as: 'users', foreignKey: 'roleId' });

  // Role <-> RoleSet (Many-to-Many)
  Role.belongsToMany(RoleSet, { through: 'RoleSetRoles', as: 'roleSets', foreignKey: 'roleId' });
  RoleSet.belongsToMany(Role, { through: 'RoleSetRoles', as: 'roles', foreignKey: 'roleSetId' });

  // Group <-> RoleSet (Many-to-Many)
  Group.belongsToMany(RoleSet, { through: 'GroupRoleSets', as: 'roleSets', foreignKey: 'groupId' });
  RoleSet.belongsToMany(Group, { through: 'GroupRoleSets', as: 'groups', foreignKey: 'roleSetId' });

  // Certificate <-> User (Many-to-One)
  Certificate.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(Certificate, { foreignKey: 'userId', as: 'certificates' });

  // Certificate <-> Certificate (Self-referential for CA hierarchy)
  Certificate.belongsTo(Certificate, { foreignKey: 'issuerId', as: 'issuer' });
  Certificate.hasMany(Certificate, { foreignKey: 'issuerId', as: 'issued' });

  // Token <-> Certificate (Many-to-One)
  Token.belongsTo(Certificate, { foreignKey: 'certificateId', as: 'certificate' });
  Certificate.hasMany(Token, { foreignKey: 'certificateId', as: 'tokens' });

  // Token <-> User (Many-to-One)
  Token.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(Token, { foreignKey: 'userId', as: 'tokens' });

  // Ticket <-> User (Many-to-One)
  Ticket.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(Ticket, { foreignKey: 'userId', as: 'tickets' });

  // RevocationList <-> Certificate (Many-to-One)
  RevocationList.belongsTo(Certificate, { foreignKey: 'certificateId', as: 'certificate' });
  Certificate.hasMany(RevocationList, { foreignKey: 'certificateId', as: 'revocations' });

  // AuditLog <-> User (Many-to-One)
  AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });

  // Group <-> Group (Self-referential for group nesting)
  Group.belongsTo(Group, { foreignKey: 'parentId', as: 'parent' });
  Group.hasMany(Group, { foreignKey: 'parentId', as: 'children' });

  // RateLimit <-> User (Many-to-One)
  RateLimit.belongsTo(User, { foreignKey: 'targetId', as: 'user', constraints: false });
  User.hasMany(RateLimit, { foreignKey: 'targetId', as: 'rateLimits', constraints: false });

  // RateLimit <-> Group (Many-to-One)
  RateLimit.belongsTo(Group, { foreignKey: 'targetId', as: 'group', constraints: false });
  Group.hasMany(RateLimit, { foreignKey: 'targetId', as: 'rateLimits', constraints: false });

  // PasswordReset <-> User (Many-to-One)
  PasswordReset.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(PasswordReset, { foreignKey: 'userId', as: 'passwordResets' });

  // PasswordReset <-> User (initiatedBy)
  PasswordReset.belongsTo(User, { foreignKey: 'initiatedBy', as: 'initiator' });
  User.hasMany(PasswordReset, { foreignKey: 'initiatedBy', as: 'initiatedResets' });

  const db = {
    sequelize,
    Sequelize,
    User,
    Profile,
    Group,
    Role,
    RoleSet,
    Certificate,
    Token,
    Ticket,
    RevocationList,
    AuditLog,
    RateLimit,
    PasswordReset,
    // Add connection management methods
    connection: dbConnection,
    getStatus: () => dbConnection.getStatus(),
    isFallbackMode: () => dbConnection.isFallbackMode(),
    reconnect: () => dbConnection.reconnect(),
    disconnect: () => dbConnection.disconnect()
  };

  return db;
}

// For backward compatibility, export the db object directly
// but it will only be fully initialized after the connection is ready
module.exports = new Proxy({}, {
  get: function(target, prop) {
    // If accessing the db promise itself, return it
    if (prop === 'ready') {
      return initPromise.then(() => getDb());
    }

    // For synchronous access (backward compatibility),
    // return the sequelize instance or models once initialized
    if (!sequelize) {
      throw new Error(
        'Database not initialized. Use `await db.ready` or ensure connection is established.'
      );
    }

    return target[prop];
  }
});

// Also export the async getter for better compatibility
module.exports.getDb = getDb;
module.exports.ready = initPromise.then(() => getDb());
