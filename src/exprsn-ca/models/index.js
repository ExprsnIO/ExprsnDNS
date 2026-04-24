/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Database Models
 * ═══════════════════════════════════════════════════════════════════════
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
    pool: config.database.pool,
    logging: config.database.logging,
    dialectOptions: config.database.ssl ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    } : {}
  }
);

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
  PasswordReset
};

module.exports = db;
