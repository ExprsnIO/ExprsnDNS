/**
 * ═══════════════════════════════════════════════════════════
 * Session Model
 * User sessions for session management
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Session = sequelize.define('Session', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },

    userAgent: {
      type: DataTypes.STRING,
      allowNull: true
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },

    lastActivityAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },

    data: {
      type: DataTypes.JSON,
      defaultValue: {}
    },

    // Status
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'sessions',
    timestamps: true,
    indexes: [
      { fields: ['sessionId'] },
      { fields: ['userId'] },
      { fields: ['active'] },
      { fields: ['expiresAt'] }
    ]
  });

  return Session;
};
