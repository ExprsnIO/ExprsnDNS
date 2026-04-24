/**
 * ═══════════════════════════════════════════════════════════
 * UserGroup Model
 * Junction table for User-Group many-to-many relationship
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserGroup = sequelize.define('UserGroup', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'groups',
        key: 'id'
      }
    },

    // Role within the group
    role: {
      type: DataTypes.ENUM('member', 'admin', 'owner'),
      defaultValue: 'member'
    }
  }, {
    tableName: 'user_groups',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['groupId'] },
      { unique: true, fields: ['userId', 'groupId'] }
    ]
  });

  return UserGroup;
};
