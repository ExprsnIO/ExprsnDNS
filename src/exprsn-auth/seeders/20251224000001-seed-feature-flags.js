/**
 * Seeder: Feature Flags
 * Populates feature flags table with tier-based feature availability
 * Based on PRICING_STRATEGY.md
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const features = [
      // Core Services
      {
        feature_key: 'timeline_enabled',
        feature_name: 'Timeline & Social Feed',
        description: 'Access to social timeline, posts, likes, and comments',
        category: 'service',
        tiers: {
          free: true,
          pro: true,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'messaging_enabled',
        feature_name: 'Real-time Messaging (Spark)',
        description: 'End-to-end encrypted messaging',
        category: 'service',
        tiers: {
          free: true,
          pro: true,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'groups_enabled',
        feature_name: 'Groups & Events (Nexus)',
        description: 'Create and join groups, manage events',
        category: 'service',
        tiers: {
          free: true,
          pro: true,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },

      // Premium Services
      {
        feature_key: 'crm_enabled',
        feature_name: 'CRM (Forge)',
        description: 'Full CRM with contacts, leads, opportunities, deals',
        category: 'service',
        tiers: {
          free: false,
          pro: true,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'workflow_enabled',
        feature_name: 'Workflow Automation',
        description: 'Visual workflow builder with conditional logic',
        category: 'service',
        tiers: {
          free: false,
          pro: true,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'live_streaming_enabled',
        feature_name: 'Live Streaming',
        description: 'Broadcast live video streams',
        category: 'service',
        tiers: {
          free: false,
          pro: true,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'payments_enabled',
        feature_name: 'Payment Processing',
        description: 'Stripe, PayPal, Authorize.Net integration',
        category: 'integration',
        tiers: {
          free: false,
          pro: false,
          max: true,
          premium: true,
          team_small: false,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'geospatial_enabled',
        feature_name: 'Geospatial & Mapping (Atlas)',
        description: 'PostGIS mapping, geocoding, route planning',
        category: 'service',
        tiers: {
          free: false,
          pro: false,
          max: true,
          premium: true,
          team_small: false,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'lowcode_enabled',
        feature_name: 'Low-Code Platform',
        description: 'Visual application builder with form/grid designers',
        category: 'service',
        tiers: {
          free: false,
          pro: false,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },

      // Storage Limits
      {
        feature_key: 'storage_limit_gb',
        feature_name: 'File Storage Limit',
        description: 'Maximum file storage in GB',
        category: 'storage',
        tiers: {
          free: 5,
          pro: 50,
          max: -1, // unlimited
          premium: -1,
          team_small: 100,
          team_growing: 500,
          team_scale: 1000,
          enterprise: -1
        }
      },
      {
        feature_key: 'bandwidth_limit_gb',
        feature_name: 'Monthly Bandwidth Limit',
        description: 'Maximum monthly bandwidth in GB',
        category: 'storage',
        tiers: {
          free: 10,
          pro: 100,
          max: -1,
          premium: -1,
          team_small: 200,
          team_growing: 1000,
          team_scale: 5000,
          enterprise: -1
        }
      },

      // Workflow Limits
      {
        feature_key: 'workflow_executions_monthly',
        feature_name: 'Monthly Workflow Executions',
        description: 'Maximum workflow executions per month',
        category: 'compute',
        tiers: {
          free: 0,
          pro: 1000,
          max: 10000,
          premium: -1,
          team_small: 5000,
          team_growing: 25000,
          team_scale: 100000,
          enterprise: -1
        }
      },

      // API Limits
      {
        feature_key: 'api_calls_per_minute',
        feature_name: 'API Rate Limit',
        description: 'Maximum API calls per minute',
        category: 'compute',
        tiers: {
          free: 60,
          pro: 120,
          max: 300,
          premium: 600,
          team_small: 180,
          team_growing: 360,
          team_scale: 720,
          enterprise: 1200
        }
      },

      // Security Features
      {
        feature_key: 'sso_enabled',
        feature_name: 'SSO / SAML Authentication',
        description: 'Single Sign-On with SAML 2.0',
        category: 'security',
        tiers: {
          free: false,
          pro: false,
          max: false,
          premium: true,
          team_small: false,
          team_growing: false,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'advanced_permissions',
        feature_name: 'Advanced Permissions',
        description: 'Role-based access control with custom roles',
        category: 'security',
        tiers: {
          free: false,
          pro: false,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'audit_logs',
        feature_name: 'Audit Logs',
        description: 'Comprehensive audit logging and compliance reports',
        category: 'security',
        tiers: {
          free: false,
          pro: false,
          max: false,
          premium: true,
          team_small: false,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },

      // Support Features
      {
        feature_key: 'support_level',
        feature_name: 'Support Level',
        description: 'Level of customer support',
        category: 'support',
        tiers: {
          free: 'community',
          pro: 'email',
          max: 'priority',
          premium: 'dedicated',
          team_small: 'email',
          team_growing: 'priority',
          team_scale: 'priority',
          enterprise: 'dedicated'
        }
      },
      {
        feature_key: 'sla_uptime',
        feature_name: 'SLA Uptime Guarantee',
        description: 'Guaranteed uptime percentage',
        category: 'support',
        tiers: {
          free: 'best-effort',
          pro: 'best-effort',
          max: '99.5%',
          premium: '99.9%',
          team_small: 'best-effort',
          team_growing: '99.5%',
          team_scale: '99.9%',
          enterprise: '99.95%'
        }
      },

      // Advanced Features
      {
        feature_key: 'white_label',
        feature_name: 'White Label / Custom Branding',
        description: 'Remove Exprsn branding, use custom domain',
        category: 'service',
        tiers: {
          free: false,
          pro: false,
          max: false,
          premium: true,
          team_small: false,
          team_growing: false,
          team_scale: false,
          enterprise: true
        }
      },
      {
        feature_key: 'custom_integrations',
        feature_name: 'Custom Integrations',
        description: 'Build custom integrations and API endpoints',
        category: 'integration',
        tiers: {
          free: false,
          pro: false,
          max: true,
          premium: true,
          team_small: false,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      },
      {
        feature_key: 'ai_moderation',
        feature_name: 'AI Content Moderation',
        description: 'Automated content moderation with AI',
        category: 'service',
        tiers: {
          free: false,
          pro: false,
          max: true,
          premium: true,
          team_small: true,
          team_growing: true,
          team_scale: true,
          enterprise: true
        }
      }
    ];

    const now = new Date();
    const records = features.map(feature => ({
      id: uuidv4(),
      ...feature,
      enabled: true,
      metadata: {},
      created_at: now,
      updated_at: now
    }));

    await queryInterface.bulkInsert('feature_flags', records);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('feature_flags', null, {});
  }
};
