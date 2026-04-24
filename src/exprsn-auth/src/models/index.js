/**
 * ═══════════════════════════════════════════════════════════
 * Database Models
 * Sequelize ORM models for Auth service
 * ═══════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const config = require('../config');

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool
  }
);

// Import models
const User = require('./User')(sequelize);
const Group = require('./Group')(sequelize);
const UserGroup = require('./UserGroup')(sequelize);
const Organization = require('./Organization')(sequelize);
const OrganizationMember = require('./OrganizationMember')(sequelize);
const Role = require('./Role')(sequelize);
const Permission = require('./Permission')(sequelize);
const UserRole = require('./UserRole')(sequelize);
const GroupRole = require('./GroupRole')(sequelize);
const Application = require('./Application')(sequelize);
const OAuth2Client = require('./OAuth2Client')(sequelize);
const OAuth2Token = require('./OAuth2Token')(sequelize);
const OAuth2AuthorizationCode = require('./OAuth2AuthorizationCode')(sequelize);
const Session = require('./Session')(sequelize);
const LdapConfig = require('./LdapConfig')(sequelize);

// Store models in object for association
const models = {
  User,
  Group,
  UserGroup,
  Organization,
  OrganizationMember,
  Role,
  Permission,
  UserRole,
  GroupRole,
  Application,
  OAuth2Client,
  OAuth2Token,
  OAuth2AuthorizationCode,
  Session,
  LdapConfig
};

/**
 * ═══════════════════════════════════════════════════════════
 * Model Associations
 * ═══════════════════════════════════════════════════════════
 */

// Call associate methods on models that have them
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Additional associations not defined in model files

// User <-> Group (Many-to-Many)
// Note: User side only - Group side is handled in Group.associate() with alias 'members'
User.belongsToMany(Group, {
  through: UserGroup,
  foreignKey: 'userId',
  otherKey: 'groupId',
  as: 'groups'
});

// User <-> Role (Many-to-Many)
// Note: User side only - Role side is in Role.associate()
User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: 'userId',
  otherKey: 'roleId',
  as: 'roles'
});

// Note: Group <-> Role associations are handled in Group.associate() and Role.associate()

// User <-> Organization (Many-to-Many)
// Note: User side only - Organization side is handled in Organization.associate() with alias 'members'
User.belongsToMany(Organization, {
  through: OrganizationMember,
  foreignKey: 'userId',
  otherKey: 'organizationId',
  as: 'organizations'
});

// OAuth2Token relationships
User.hasMany(OAuth2Token, {
  foreignKey: 'userId',
  as: 'oauth2Tokens'
});

OAuth2Token.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

OAuth2Client.hasMany(OAuth2Token, {
  foreignKey: 'clientId',
  as: 'tokens'
});

OAuth2Token.belongsTo(OAuth2Client, {
  foreignKey: 'clientId',
  as: 'client'
});

// OAuth2AuthorizationCode relationships
OAuth2Client.hasMany(OAuth2AuthorizationCode, {
  foreignKey: 'clientId',
  as: 'authorizationCodes'
});

OAuth2AuthorizationCode.belongsTo(OAuth2Client, {
  foreignKey: 'clientId',
  as: 'client'
});

User.hasMany(OAuth2AuthorizationCode, {
  foreignKey: 'userId',
  as: 'authorizationCodes'
});

OAuth2AuthorizationCode.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Session relationships
User.hasMany(Session, {
  foreignKey: 'userId',
  as: 'sessions'
});

Session.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

/**
 * ═══════════════════════════════════════════════════════════
 * Initialize System Data
 * ═══════════════════════════════════════════════════════════
 */

async function initializeSystemData() {
  try {
    // Create system permissions
    await Permission.createSystemPermissions();
    console.log('✅ System permissions initialized');

    // Create system roles
    await Role.createSystemRoles();
    console.log('✅ System roles initialized');
  } catch (error) {
    console.error('Error initializing system data:', error);
  }
}

module.exports = {
  sequelize,
  Sequelize,
  User,
  Group,
  UserGroup,
  Organization,
  OrganizationMember,
  Role,
  Permission,
  UserRole,
  GroupRole,
  Application,
  OAuth2Client,
  OAuth2Token,
  OAuth2AuthorizationCode,
  Session,
  LdapConfig,
  initializeSystemData
};
