/**
 * ═══════════════════════════════════════════════════════════
 * User Model
 * User accounts with authentication and profile data
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const config = require('../config');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Authentication
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },

    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true // Null for OAuth-only accounts
    },

    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    emailVerificationToken: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // OAuth provider IDs
    googleId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true
    },

    githubId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true
    },

    // Profile
    displayName: {
      type: DataTypes.STRING,
      allowNull: true
    },

    firstName: {
      type: DataTypes.STRING,
      allowNull: true
    },

    lastName: {
      type: DataTypes.STRING,
      allowNull: true
    },

    avatarUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // MFA
    mfaEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    mfaSecret: {
      type: DataTypes.STRING,
      allowNull: true
    },

    mfaBackupCodes: {
      type: DataTypes.JSON,
      allowNull: true
    },

    // Security
    loginAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    lockedUntil: {
      type: DataTypes.BIGINT,
      allowNull: true
    },

    lastLoginAt: {
      type: DataTypes.BIGINT,
      allowNull: true
    },

    passwordChangedAt: {
      type: DataTypes.BIGINT,
      allowNull: true
    },

    resetPasswordToken: {
      type: DataTypes.STRING,
      allowNull: true
    },

    resetPasswordExpires: {
      type: DataTypes.BIGINT,
      allowNull: true
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      defaultValue: 'active'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'users',
    timestamps: true,
    indexes: [
      { fields: ['email'] },
      { fields: ['googleId'] },
      { fields: ['githubId'] },
      { fields: ['status'] }
    ]
  });

  /**
   * Hash password before creating user
   */
  User.beforeCreate(async (user) => {
    if (user.passwordHash) {
      user.passwordHash = await bcrypt.hash(user.passwordHash, config.security.bcryptRounds);
    }
  });

  /**
   * Hash password before updating user
   */
  User.beforeUpdate(async (user) => {
    if (user.changed('passwordHash') && user.passwordHash) {
      user.passwordHash = await bcrypt.hash(user.passwordHash, config.security.bcryptRounds);
      user.passwordChangedAt = Date.now();
    }
  });

  /**
   * Instance methods
   */

  User.prototype.incrementLoginAttempts = async function() {
    this.loginAttempts += 1;

    // Lock account after max attempts
    if (this.loginAttempts >= config.security.maxLoginAttempts) {
      this.lockedUntil = Date.now() + config.security.lockoutDuration;
    }

    await this.save();
  };

  User.prototype.resetLoginAttempts = async function() {
    this.loginAttempts = 0;
    this.lockedUntil = null;
    await this.save();
  };

  User.prototype.toSafeObject = function() {
    const { passwordHash, mfaSecret, mfaBackupCodes, resetPasswordToken, ...safeUser } = this.toJSON();
    return safeUser;
  };

  return User;
};
