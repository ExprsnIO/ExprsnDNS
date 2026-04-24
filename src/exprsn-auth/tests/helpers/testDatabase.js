/**
 * Test Database Helpers
 * Utilities for managing test database
 */

const { Sequelize } = require('sequelize');

let sequelize;
let models;

/**
 * Initialize test database connection
 */
async function setupTestDatabase() {
  const config = {
    host: process.env.AUTH_DB_HOST || 'localhost',
    port: parseInt(process.env.AUTH_DB_PORT) || 5432,
    database: process.env.AUTH_DB_NAME || 'exprsn_auth_test',
    username: process.env.AUTH_DB_USER || 'postgres',
    password: process.env.AUTH_DB_PASSWORD || 'postgres',
    dialect: 'postgres',
    logging: false, // Disable logging in tests
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  sequelize = new Sequelize(config);

  // Test connection
  try {
    await sequelize.authenticate();
    console.log('Test database connection established');
  } catch (error) {
    console.error('Unable to connect to test database:', error.message);
    throw error;
  }

  // Initialize models
  const User = require('../../src/models/User')(sequelize);
  const Role = require('../../src/models/Role')(sequelize);
  const Permission = require('../../src/models/Permission')(sequelize);
  const Organization = require('../../src/models/Organization')(sequelize);
  const Session = require('../../src/models/Session')(sequelize);
  const OAuth2Client = require('../../src/models/OAuth2Client')(sequelize);
  const OAuth2Token = require('../../src/models/OAuth2Token')(sequelize);
  const OAuth2AuthorizationCode = require('../../src/models/OAuth2AuthorizationCode')(sequelize);

  // Set up associations
  User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
  Session.belongsTo(User, { foreignKey: 'userId' });

  User.belongsToMany(Role, { through: 'user_roles', foreignKey: 'userId' });
  Role.belongsToMany(User, { through: 'user_roles', foreignKey: 'roleId' });

  Role.belongsToMany(Permission, { through: 'role_permissions', foreignKey: 'roleId' });
  Permission.belongsToMany(Role, { through: 'role_permissions', foreignKey: 'permissionId' });

  Organization.belongsToMany(User, { through: 'organization_members', foreignKey: 'organizationId', as: 'members' });
  User.belongsToMany(Organization, { through: 'organization_members', foreignKey: 'userId', as: 'organizations' });

  OAuth2Client.hasMany(OAuth2Token, { foreignKey: 'clientId', as: 'tokens' });
  OAuth2Token.belongsTo(OAuth2Client, { foreignKey: 'clientId' });
  OAuth2Token.belongsTo(User, { foreignKey: 'userId' });

  OAuth2AuthorizationCode.belongsTo(OAuth2Client, { foreignKey: 'clientId' });
  OAuth2AuthorizationCode.belongsTo(User, { foreignKey: 'userId' });

  models = {
    User,
    Role,
    Permission,
    Organization,
    Session,
    OAuth2Client,
    OAuth2Token,
    OAuth2AuthorizationCode,
  };

  // Sync database (create tables)
  await sequelize.sync({ force: true });

  return { sequelize, models };
}

/**
 * Clean up test database
 */
async function teardownTestDatabase() {
  if (sequelize) {
    await sequelize.close();
    console.log('Test database connection closed');
  }
}

/**
 * Clear all data from tables
 */
async function clearDatabase() {
  if (!models) return;

  const tableNames = Object.keys(models);
  for (const tableName of tableNames) {
    await models[tableName].destroy({ where: {}, truncate: true, cascade: true });
  }
}

/**
 * Create test user
 */
async function createTestUser(overrides = {}) {
  const bcrypt = require('bcrypt');
  const { v4: uuidv4 } = require('uuid');

  const defaultUser = {
    id: uuidv4(),
    email: `test-${Date.now()}@example.com`,
    username: `testuser${Date.now()}`,
    password: await bcrypt.hash('Test123!@#', 12),
    emailVerified: true,
    mfaEnabled: false,
    loginAttempts: 0,
    ...overrides
  };

  return await models.User.create(defaultUser);
}

/**
 * Create test organization
 */
async function createTestOrganization(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultOrg = {
    id: uuidv4(),
    name: `Test Org ${Date.now()}`,
    slug: `test-org-${Date.now()}`,
    ...overrides
  };

  return await models.Organization.create(defaultOrg);
}

/**
 * Create test role
 */
async function createTestRole(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultRole = {
    id: uuidv4(),
    name: `test-role-${Date.now()}`,
    description: 'Test role',
    ...overrides
  };

  return await models.Role.create(defaultRole);
}

/**
 * Create test permission
 */
async function createTestPermission(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultPermission = {
    id: uuidv4(),
    name: `test:permission:${Date.now()}`,
    description: 'Test permission',
    resource: 'test',
    action: 'read',
    ...overrides
  };

  return await models.Permission.create(defaultPermission);
}

/**
 * Create test OAuth2 client
 */
async function createTestOAuth2Client(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultClient = {
    id: uuidv4(),
    clientId: `test-client-${Date.now()}`,
    clientSecret: 'test-secret',
    name: 'Test Client',
    redirectUris: ['http://localhost:3000/callback'],
    grants: ['authorization_code', 'refresh_token'],
    ...overrides
  };

  return await models.OAuth2Client.create(defaultClient);
}

module.exports = {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestOrganization,
  createTestRole,
  createTestPermission,
  createTestOAuth2Client,
  getModels: () => models,
  getSequelize: () => sequelize,
};
