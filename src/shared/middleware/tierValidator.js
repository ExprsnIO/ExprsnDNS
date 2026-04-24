/**
 * ═══════════════════════════════════════════════════════════
 * Tier Validation Middleware
 * Enforce subscription tier limits and feature access
 * ═══════════════════════════════════════════════════════════
 */

const { AppError, asyncHandler } = require('./errorHandler');
const logger = require('../utils/logger');
const { serviceRequest } = require('../utils/serviceToken');

// Cache for subscription and feature data (5-minute TTL)
const subscriptionCache = new Map();
const featureFlagsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch user's subscription from Auth service
 */
async function fetchSubscription(userId, organizationId = null) {
  const cacheKey = organizationId || userId;
  const cached = subscriptionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const authUrl = process.env.AUTH_URL || 'http://localhost:3001';
    const endpoint = organizationId
      ? `/api/subscriptions/organization/${organizationId}`
      : `/api/subscriptions/user/${userId}`;

    const response = await serviceRequest({
      method: 'GET',
      url: `${authUrl}${endpoint}`,
      serviceName: process.env.SERVICE_NAME || 'exprsn-service',
      resource: `${authUrl}/api/subscriptions/*`,
      permissions: { read: true }
    });

    const subscription = response.data.data || { tier: 'free', status: 'active' };

    subscriptionCache.set(cacheKey, {
      data: subscription,
      timestamp: Date.now()
    });

    return subscription;
  } catch (error) {
    logger.warn('Failed to fetch subscription, defaulting to free tier', {
      userId,
      organizationId,
      error: error.message
    });

    // Default to free tier on error
    return { tier: 'free', status: 'active' };
  }
}

/**
 * Fetch feature flags from Auth service
 */
async function fetchFeatureFlags() {
  const cached = featureFlagsCache.get('all');

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const authUrl = process.env.AUTH_URL || 'http://localhost:3001';
    const response = await serviceRequest({
      method: 'GET',
      url: `${authUrl}/api/features`,
      serviceName: process.env.SERVICE_NAME || 'exprsn-service',
      resource: `${authUrl}/api/features`,
      permissions: { read: true }
    });

    const features = response.data.data || [];
    const featureMap = {};

    features.forEach(feature => {
      featureMap[feature.featureKey] = feature.tiers;
    });

    featureFlagsCache.set('all', {
      data: featureMap,
      timestamp: Date.now()
    });

    return featureMap;
  } catch (error) {
    logger.error('Failed to fetch feature flags', { error: error.message });
    return {};
  }
}

/**
 * Check if a feature is enabled for a tier
 */
function isFeatureEnabled(featureTiers, tier) {
  if (!featureTiers) return false;

  const tierValue = featureTiers[tier];

  // Boolean features
  if (typeof tierValue === 'boolean') {
    return tierValue;
  }

  // Numeric features (-1 = unlimited, 0 = disabled, > 0 = limit)
  if (typeof tierValue === 'number') {
    return tierValue !== 0;
  }

  // String features (for support levels, SLAs, etc.)
  if (typeof tierValue === 'string') {
    return tierValue !== 'none' && tierValue !== 'disabled';
  }

  return false;
}

/**
 * Get feature limit for a tier
 */
function getFeatureLimit(featureTiers, tier) {
  if (!featureTiers) return 0;

  const tierValue = featureTiers[tier];

  // -1 = unlimited
  if (tierValue === -1) return Infinity;

  // Boolean = 1 if true, 0 if false
  if (typeof tierValue === 'boolean') return tierValue ? 1 : 0;

  // Number = actual limit
  if (typeof tierValue === 'number') return tierValue;

  return 0;
}

/**
 * Middleware: Require specific feature to be enabled
 * Usage: requireFeature('crm_enabled')
 */
const requireFeature = (featureKey) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = req.headers['x-organization-id'] || req.query.organizationId;
    const subscription = await fetchSubscription(req.user.id, organizationId);

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      throw new AppError('SUBSCRIPTION_INACTIVE', 'Your subscription is not active', 403);
    }

    const features = await fetchFeatureFlags();
    const featureTiers = features[featureKey];

    if (!isFeatureEnabled(featureTiers, subscription.tier)) {
      logger.warn('Feature access denied', {
        userId: req.user.id,
        featureKey,
        tier: subscription.tier
      });

      throw new AppError(
        'FEATURE_NOT_AVAILABLE',
        `This feature requires a higher subscription tier. Current tier: ${subscription.tier}`,
        403,
        { featureKey, currentTier: subscription.tier }
      );
    }

    // Attach subscription to request for downstream use
    req.subscription = subscription;
    next();
  });
};

/**
 * Middleware: Check usage limit for a feature
 * Usage: checkUsageLimit('workflow_executions_monthly', currentUsage)
 */
const checkUsageLimit = (featureKey) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = req.headers['x-organization-id'] || req.query.organizationId;
    const subscription = await fetchSubscription(req.user.id, organizationId);

    const features = await fetchFeatureFlags();
    const featureTiers = features[featureKey];
    const limit = getFeatureLimit(featureTiers, subscription.tier);

    // Attach limit to request so the route handler can check current usage
    req.subscription = subscription;
    req.featureLimit = limit;

    next();
  });
};

/**
 * Middleware: Require minimum tier
 * Usage: requireMinTier('pro')
 */
const requireMinTier = (minTier) => {
  const tierHierarchy = [
    'free',
    'pro',
    'max',
    'premium',
    'team_small',
    'team_growing',
    'team_scale',
    'enterprise'
  ];

  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = req.headers['x-organization-id'] || req.query.organizationId;
    const subscription = await fetchSubscription(req.user.id, organizationId);

    const userTierIndex = tierHierarchy.indexOf(subscription.tier);
    const minTierIndex = tierHierarchy.indexOf(minTier);

    if (userTierIndex < minTierIndex) {
      throw new AppError(
        'TIER_REQUIRED',
        `This feature requires ${minTier} tier or higher`,
        403,
        { currentTier: subscription.tier, requiredTier: minTier }
      );
    }

    req.subscription = subscription;
    next();
  });
};

/**
 * Helper: Check if user has access to feature (no middleware)
 */
async function hasFeatureAccess(userId, featureKey, organizationId = null) {
  try {
    const subscription = await fetchSubscription(userId, organizationId);

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return false;
    }

    const features = await fetchFeatureFlags();
    const featureTiers = features[featureKey];

    return isFeatureEnabled(featureTiers, subscription.tier);
  } catch (error) {
    logger.error('Error checking feature access', { error: error.message, userId, featureKey });
    return false;
  }
}

/**
 * Helper: Get feature limit for user (no middleware)
 */
async function getFeatureLimitForUser(userId, featureKey, organizationId = null) {
  try {
    const subscription = await fetchSubscription(userId, organizationId);
    const features = await fetchFeatureFlags();
    const featureTiers = features[featureKey];

    return getFeatureLimit(featureTiers, subscription.tier);
  } catch (error) {
    logger.error('Error getting feature limit', { error: error.message, userId, featureKey });
    return 0;
  }
}

/**
 * Clear caches (useful for testing or when subscription changes)
 */
function clearCaches() {
  subscriptionCache.clear();
  featureFlagsCache.clear();
}

module.exports = {
  requireFeature,
  checkUsageLimit,
  requireMinTier,
  hasFeatureAccess,
  getFeatureLimitForUser,
  clearCaches
};
