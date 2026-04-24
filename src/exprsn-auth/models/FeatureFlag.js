/**
 * Feature Flag Model
 * Defines features available at each subscription tier
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FeatureFlag = sequelize.define('FeatureFlag', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    featureKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'feature_key',
      comment: 'Unique identifier for the feature (e.g., crm_enabled, workflow_executions)'
    },
    featureName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'feature_name',
      comment: 'Human-readable feature name'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.ENUM('service', 'storage', 'compute', 'integration', 'security', 'support'),
      allowNull: false
    },
    tiers: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Object mapping tier names to feature limits or boolean availability',
      defaultValue: {
        free: false,
        pro: false,
        max: false,
        premium: false,
        team_small: false,
        team_growing: false,
        team_scale: false,
        enterprise: false
      }
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'feature_flags',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['feature_key'], unique: true },
      { fields: ['category'] },
      { fields: ['enabled'] }
    ]
  });

  return FeatureFlag;
};
