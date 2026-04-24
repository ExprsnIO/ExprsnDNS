/**
 * ═══════════════════════════════════════════════════════════
 * Billing Routes
 * Subscription management and billing operations
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { Sequelize } = require('sequelize');
const {
  validateCAToken,
  requirePermissions,
  asyncHandler,
  AppError,
  StripeService,
  requireMinTier
} = require('@exprsn/shared');

// Import models (initialized in index.js)
let Subscription, UsageRecord, Invoice, FeatureFlag;

function initModels(models) {
  Subscription = models.Subscription;
  UsageRecord = models.UsageRecord;
  Invoice = models.Invoice;
  FeatureFlag = models.FeatureFlag;
}

// ═══════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════

const createSubscriptionSchema = Joi.object({
  tier: Joi.string().valid('pro', 'max', 'premium', 'team_small', 'team_growing', 'team_scale').required(),
  billingCycle: Joi.string().valid('monthly', 'annual').required(),
  organizationId: Joi.string().uuid().optional(),
  seats: Joi.number().integer().min(5).optional(),
  paymentMethodId: Joi.string().optional()
});

const updateSubscriptionSchema = Joi.object({
  tier: Joi.string().valid('pro', 'max', 'premium', 'team_small', 'team_growing', 'team_scale').optional(),
  billingCycle: Joi.string().valid('monthly', 'annual').optional(),
  seats: Joi.number().integer().min(5).optional()
});

const cancelSubscriptionSchema = Joi.object({
  immediately: Joi.boolean().default(false)
});

// ═══════════════════════════════════════════════════════════
// Subscription Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/subscriptions/user/:userId
 * Get user's subscription
 */
router.get('/user/:userId',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    // Users can only view their own subscription unless admin
    if (req.user.id !== userId && !req.user.roles?.includes('admin')) {
      throw new AppError('FORBIDDEN', 'Cannot view other users\' subscriptions', 403);
    }

    let subscription = await Subscription.findOne({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });

    // Create free tier subscription if none exists
    if (!subscription) {
      subscription = await Subscription.create({
        userId,
        tier: 'free',
        status: 'active'
      });
    }

    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * GET /api/subscriptions/organization/:organizationId
 * Get organization's subscription
 */
router.get('/organization/:organizationId',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.params;

    // TODO: Check if user is member of organization

    let subscription = await Subscription.findOne({
      where: { organizationId },
      order: [['createdAt', 'DESC']]
    });

    if (!subscription) {
      subscription = await Subscription.create({
        organizationId,
        tier: 'free',
        status: 'active'
      });
    }

    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * POST /api/subscriptions
 * Create or upgrade subscription
 */
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createSubscriptionSchema.validate(req.body);
    if (error) {
      throw new AppError('VALIDATION_ERROR', error.details[0].message, 400);
    }

    const { tier, billingCycle, organizationId, seats, paymentMethodId } = value;
    const userId = organizationId ? null : req.user.id;

    // Check if subscription already exists
    const existing = await Subscription.findOne({
      where: organizationId ? { organizationId } : { userId }
    });

    if (existing && existing.tier !== 'free') {
      throw new AppError('SUBSCRIPTION_EXISTS', 'Active subscription already exists. Use update endpoint to change tier.', 400);
    }

    // Create Stripe customer if doesn't exist
    let stripeCustomerId = existing?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await StripeService.createCustomer({
        email: req.user.email,
        name: req.user.username,
        userId: req.user.id,
        organizationId
      });
      stripeCustomerId = customer.id;
    }

    // Create Stripe subscription
    const stripeSubscription = await StripeService.createSubscription({
      customerId: stripeCustomerId,
      tier,
      billingCycle,
      seats,
      trialDays: 14 // 14-day trial
    });

    // Create or update subscription record
    const subscriptionData = {
      userId,
      organizationId,
      tier,
      status: stripeSubscription.status === 'trialing' ? 'trialing' : 'active',
      billingCycle,
      stripeCustomerId,
      stripeSubscriptionId: stripeSubscription.id,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
      trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
      seats
    };

    let subscription;
    if (existing) {
      await existing.update(subscriptionData);
      subscription = existing;
    } else {
      subscription = await Subscription.create(subscriptionData);
    }

    res.status(201).json({
      success: true,
      data: {
        subscription,
        clientSecret: stripeSubscription.latest_invoice?.payment_intent?.client_secret
      }
    });
  })
);

/**
 * PATCH /api/subscriptions/:id
 * Update subscription (change tier or seats)
 */
router.patch('/:id',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error, value } = updateSubscriptionSchema.validate(req.body);

    if (error) {
      throw new AppError('VALIDATION_ERROR', error.details[0].message, 400);
    }

    const subscription = await Subscription.findByPk(id);
    if (!subscription) {
      throw new AppError('NOT_FOUND', 'Subscription not found', 404);
    }

    // Authorization check
    if (subscription.userId && subscription.userId !== req.user.id && !req.user.roles?.includes('admin')) {
      throw new AppError('FORBIDDEN', 'Cannot modify other users\' subscriptions', 403);
    }

    const { tier, billingCycle, seats } = value;

    // Update Stripe subscription if tier or seats changed
    if (tier || seats) {
      await StripeService.updateSubscription({
        subscriptionId: subscription.stripeSubscriptionId,
        tier: tier || subscription.tier,
        billingCycle: billingCycle || subscription.billingCycle,
        seats: seats || subscription.seats
      });
    }

    await subscription.update({
      ...(tier && { tier }),
      ...(billingCycle && { billingCycle }),
      ...(seats && { seats })
    });

    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel subscription
 */
router.post('/:id/cancel',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error, value } = cancelSubscriptionSchema.validate(req.body);

    if (error) {
      throw new AppError('VALIDATION_ERROR', error.details[0].message, 400);
    }

    const subscription = await Subscription.findByPk(id);
    if (!subscription) {
      throw new AppError('NOT_FOUND', 'Subscription not found', 404);
    }

    // Authorization check
    if (subscription.userId && subscription.userId !== req.user.id && !req.user.roles?.includes('admin')) {
      throw new AppError('FORBIDDEN', 'Cannot cancel other users\' subscriptions', 403);
    }

    const { immediately } = value;

    if (immediately) {
      await StripeService.cancelSubscriptionImmediately({
        subscriptionId: subscription.stripeSubscriptionId
      });

      await subscription.update({
        status: 'canceled',
        canceledAt: new Date(),
        cancelAtPeriodEnd: false
      });
    } else {
      await StripeService.cancelSubscription({
        subscriptionId: subscription.stripeSubscriptionId,
        cancelAtPeriodEnd: true
      });

      await subscription.update({
        cancelAtPeriodEnd: true
      });
    }

    res.json({
      success: true,
      data: subscription
    });
  })
);

/**
 * POST /api/subscriptions/:id/reactivate
 * Reactivate a canceled subscription
 */
router.post('/:id/reactivate',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subscription = await Subscription.findByPk(id);
    if (!subscription) {
      throw new AppError('NOT_FOUND', 'Subscription not found', 404);
    }

    // Authorization check
    if (subscription.userId && subscription.userId !== req.user.id && !req.user.roles?.includes('admin')) {
      throw new AppError('FORBIDDEN', 'Cannot reactivate other users\' subscriptions', 403);
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new AppError('INVALID_STATE', 'Subscription is not scheduled for cancellation', 400);
    }

    await StripeService.reactivateSubscription({
      subscriptionId: subscription.stripeSubscriptionId
    });

    await subscription.update({
      cancelAtPeriodEnd: false,
      status: 'active'
    });

    res.json({
      success: true,
      data: subscription
    });
  })
);

// ═══════════════════════════════════════════════════════════
// Feature Flags Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/features
 * List all feature flags
 */
router.get('/features',
  asyncHandler(async (req, res) => {
    const features = await FeatureFlag.findAll({
      where: { enabled: true },
      attributes: ['id', 'featureKey', 'featureName', 'description', 'category', 'tiers']
    });

    res.json({
      success: true,
      data: features
    });
  })
);

/**
 * GET /api/features/my
 * Get features available to current user
 */
router.get('/features/my',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const organizationId = req.headers['x-organization-id'] || req.query.organizationId;

    // Get user's subscription
    const subscription = await Subscription.findOne({
      where: organizationId ? { organizationId } : { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    }) || { tier: 'free', status: 'active' };

    // Get all features
    const features = await FeatureFlag.findAll({
      where: { enabled: true }
    });

    // Filter features available to user's tier
    const availableFeatures = features
      .filter(feature => {
        const tierValue = feature.tiers[subscription.tier];
        return tierValue !== false && tierValue !== 0 && tierValue !== 'none';
      })
      .map(feature => ({
        featureKey: feature.featureKey,
        featureName: feature.featureName,
        description: feature.description,
        category: feature.category,
        limit: feature.tiers[subscription.tier]
      }));

    res.json({
      success: true,
      data: {
        tier: subscription.tier,
        status: subscription.status,
        features: availableFeatures
      }
    });
  })
);

// ═══════════════════════════════════════════════════════════
// Usage & Billing Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/subscriptions/:id/usage
 * Get usage summary for current billing period
 */
router.get('/:id/usage',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subscription = await Subscription.findByPk(id);
    if (!subscription) {
      throw new AppError('NOT_FOUND', 'Subscription not found', 404);
    }

    // Authorization check
    if (subscription.userId && subscription.userId !== req.user.id && !req.user.roles?.includes('admin')) {
      throw new AppError('FORBIDDEN', 'Cannot view other users\' usage', 403);
    }

    // Get current billing period
    const periodStart = subscription.currentPeriodStart || new Date();
    const periodEnd = subscription.currentPeriodEnd || new Date();

    // Aggregate usage by metric type
    const usage = await UsageRecord.findAll({
      where: {
        subscriptionId: id,
        periodStart: { [Sequelize.Op.gte]: periodStart },
        periodEnd: { [Sequelize.Op.lte]: periodEnd }
      },
      attributes: [
        'metricType',
        [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalQuantity'],
        [Sequelize.fn('SUM', Sequelize.col('cost')), 'totalCost'],
        'unit'
      ],
      group: ['metricType', 'unit'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        periodStart,
        periodEnd,
        usage
      }
    });
  })
);

/**
 * GET /api/subscriptions/:id/invoices
 * List invoices for subscription
 */
router.get('/:id/invoices',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const subscription = await Subscription.findByPk(id);
    if (!subscription) {
      throw new AppError('NOT_FOUND', 'Subscription not found', 404);
    }

    // Authorization check
    if (subscription.userId && subscription.userId !== req.user.id && !req.user.roles?.includes('admin')) {
      throw new AppError('FORBIDDEN', 'Cannot view other users\' invoices', 403);
    }

    const invoices = await Invoice.findAll({
      where: { subscriptionId: id },
      order: [['createdAt', 'DESC']],
      limit
    });

    res.json({
      success: true,
      data: invoices
    });
  })
);

module.exports = { router, initModels };
