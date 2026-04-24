/**
 * ═══════════════════════════════════════════════════════════
 * Stripe Integration Service
 * Centralized Stripe operations for billing
 * ═══════════════════════════════════════════════════════════
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('./logger');

// Pricing configuration based on PRICING_STRATEGY.md
const PRICING = {
  individual: {
    monthly: {
      pro: { price: 12.00, priceId: process.env.STRIPE_PRICE_PRO_MONTHLY },
      max: { price: 29.00, priceId: process.env.STRIPE_PRICE_MAX_MONTHLY },
      premium: { price: 59.00, priceId: process.env.STRIPE_PRICE_PREMIUM_MONTHLY }
    },
    annual: {
      pro: { price: 115.00, priceId: process.env.STRIPE_PRICE_PRO_ANNUAL }, // 20% discount
      max: { price: 278.00, priceId: process.env.STRIPE_PRICE_MAX_ANNUAL },
      premium: { price: 566.00, priceId: process.env.STRIPE_PRICE_PREMIUM_ANNUAL }
    }
  },
  team: {
    monthly: {
      team_small: { price: 8.00, priceId: process.env.STRIPE_PRICE_TEAM_SMALL_MONTHLY },
      team_growing: { price: 7.00, priceId: process.env.STRIPE_PRICE_TEAM_GROWING_MONTHLY },
      team_scale: { price: 6.00, priceId: process.env.STRIPE_PRICE_TEAM_SCALE_MONTHLY }
    },
    annual: {
      team_small: { price: 77.00, priceId: process.env.STRIPE_PRICE_TEAM_SMALL_ANNUAL },
      team_growing: { price: 67.00, priceId: process.env.STRIPE_PRICE_TEAM_GROWING_ANNUAL },
      team_scale: { price: 58.00, priceId: process.env.STRIPE_PRICE_TEAM_SCALE_ANNUAL }
    }
  }
};

class StripeService {
  /**
   * Create a new customer in Stripe
   */
  static async createCustomer({ email, name, userId, organizationId = null, metadata = {} }) {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
          organizationId: organizationId || '',
          ...metadata
        }
      });

      logger.info('Stripe customer created', {
        customerId: customer.id,
        userId,
        organizationId
      });

      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer', {
        error: error.message,
        userId,
        email
      });
      throw error;
    }
  }

  /**
   * Create a subscription
   */
  static async createSubscription({ customerId, tier, billingCycle, seats = null, trialDays = 0 }) {
    try {
      const isTeamPlan = tier.startsWith('team_');
      const planType = isTeamPlan ? 'team' : 'individual';
      const priceData = PRICING[planType][billingCycle][tier];

      if (!priceData || !priceData.priceId) {
        throw new Error(`No Stripe price ID configured for tier: ${tier} (${billingCycle})`);
      }

      const subscriptionParams = {
        customer: customerId,
        items: [
          {
            price: priceData.priceId,
            ...(seats && { quantity: seats })
          }
        ],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent']
      };

      if (trialDays > 0) {
        subscriptionParams.trial_period_days = trialDays;
      }

      const subscription = await stripe.subscriptions.create(subscriptionParams);

      logger.info('Stripe subscription created', {
        subscriptionId: subscription.id,
        customerId,
        tier,
        billingCycle
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to create Stripe subscription', {
        error: error.message,
        customerId,
        tier
      });
      throw error;
    }
  }

  /**
   * Update subscription (change tier or seats)
   */
  static async updateSubscription({ subscriptionId, tier, billingCycle, seats = null }) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const isTeamPlan = tier.startsWith('team_');
      const planType = isTeamPlan ? 'team' : 'individual';
      const priceData = PRICING[planType][billingCycle][tier];

      if (!priceData || !priceData.priceId) {
        throw new Error(`No Stripe price ID configured for tier: ${tier} (${billingCycle})`);
      }

      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: priceData.priceId,
            ...(seats && { quantity: seats })
          }
        ],
        proration_behavior: 'create_prorations'
      });

      logger.info('Stripe subscription updated', {
        subscriptionId,
        tier,
        seats
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update Stripe subscription', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription({ subscriptionId, cancelAtPeriodEnd = true }) {
    try {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd
      });

      logger.info('Stripe subscription canceled', {
        subscriptionId,
        cancelAtPeriodEnd,
        cancelAt: subscription.cancel_at
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to cancel Stripe subscription', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Immediately cancel subscription (no grace period)
   */
  static async cancelSubscriptionImmediately({ subscriptionId }) {
    try {
      const subscription = await stripe.subscriptions.cancel(subscriptionId);

      logger.info('Stripe subscription canceled immediately', {
        subscriptionId
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to immediately cancel Stripe subscription', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Reactivate a canceled subscription
   */
  static async reactivateSubscription({ subscriptionId }) {
    try {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
      });

      logger.info('Stripe subscription reactivated', {
        subscriptionId
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to reactivate Stripe subscription', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Create usage record for metered billing
   */
  static async createUsageRecord({ subscriptionItemId, quantity, timestamp = null, action = 'increment' }) {
    try {
      const usageRecord = await stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp: timestamp || Math.floor(Date.now() / 1000),
          action
        }
      );

      logger.debug('Stripe usage record created', {
        subscriptionItemId,
        quantity
      });

      return usageRecord;
    } catch (error) {
      logger.error('Failed to create Stripe usage record', {
        error: error.message,
        subscriptionItemId
      });
      throw error;
    }
  }

  /**
   * Retrieve customer
   */
  static async getCustomer(customerId) {
    try {
      return await stripe.customers.retrieve(customerId);
    } catch (error) {
      logger.error('Failed to retrieve Stripe customer', {
        error: error.message,
        customerId
      });
      throw error;
    }
  }

  /**
   * Retrieve subscription
   */
  static async getSubscription(subscriptionId) {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logger.error('Failed to retrieve Stripe subscription', {
        error: error.message,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * List customer invoices
   */
  static async listInvoices({ customerId, limit = 10 }) {
    try {
      return await stripe.invoices.list({
        customer: customerId,
        limit
      });
    } catch (error) {
      logger.error('Failed to list Stripe invoices', {
        error: error.message,
        customerId
      });
      throw error;
    }
  }

  /**
   * Retrieve invoice
   */
  static async getInvoice(invoiceId) {
    try {
      return await stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      logger.error('Failed to retrieve Stripe invoice', {
        error: error.message,
        invoiceId
      });
      throw error;
    }
  }

  /**
   * Create payment intent for one-time payments
   */
  static async createPaymentIntent({ amount, currency = 'usd', customerId, metadata = {} }) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        customer: customerId,
        metadata,
        automatic_payment_methods: { enabled: true }
      });

      logger.info('Stripe payment intent created', {
        paymentIntentId: paymentIntent.id,
        amount,
        customerId
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Failed to create Stripe payment intent', {
        error: error.message,
        amount,
        customerId
      });
      throw error;
    }
  }

  /**
   * Create setup intent for saving payment method
   */
  static async createSetupIntent({ customerId, metadata = {} }) {
    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        metadata,
        automatic_payment_methods: { enabled: true }
      });

      logger.info('Stripe setup intent created', {
        setupIntentId: setupIntent.id,
        customerId
      });

      return setupIntent;
    } catch (error) {
      logger.error('Failed to create Stripe setup intent', {
        error: error.message,
        customerId
      });
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload, signature, secret) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      logger.error('Failed to verify Stripe webhook signature', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = StripeService;
