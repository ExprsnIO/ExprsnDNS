/**
 * ═══════════════════════════════════════════════════════════════════════
 * Profile Model - Users can have multiple profiles
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const Profile = sequelize.define('Profile', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('personal', 'business', 'developer', 'service'),
      defaultValue: 'personal',
      allowNull: false
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_primary'
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    organization: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    department: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'profiles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['type'] },
      { fields: ['is_primary'] }
    ]
  });

  return Profile;
};
