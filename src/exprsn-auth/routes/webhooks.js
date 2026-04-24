/**
 * ═══════════════════════════════════════════════════════════
 * Stripe Webhook Handler
 * Process Stripe webhook events for subscription updates
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { StripeService, logger, asyncHandler } = require('@exprsn/shared');

// Import models (initialized in index.js)
let Subscription, Invoice, UsageRecord;

function initModels(models) {
  Subscription = models.Subscription;
  Invoice = models.Invoice;
  UsageRecord = models.UsageRecord;
}

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 *
 * IMPORTANT: This route must use express.raw() middleware to access raw body
 * for signature verification
 */
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;
    try {
      event = StripeService.verifyWebhookSignature(
        req.body,
        signature,
        webhookSecret
      );
    } catch (error) {
      logger.error('Webhook signature verification failed', {
        error: error.message
      });
      return res.status(400).json({ error: 'Invalid signature' });
    }

    logger.info('Stripe webhook received', {
      type: event.type,
      id: event.id
    });

    try {
      switch (event.type) {
        // Subscription events
        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        case 'customer.subscription.trial_will_end':
          await handleTrialWillEnd(event.data.object);
          break;

        // Invoice events
        case 'invoice.created':
          await handleInvoiceCreated(event.data.object);
          break;

        case 'invoice.paid':
          await handleInvoicePaid(event.data.object);
          break;

        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object);
          break;

        case 'invoice.finalized':
          await handleInvoiceFinalized(event.data.object);
          break;

        // Payment events
        case 'payment_intent.succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        default:
          logger.debug('Unhandled webhook event type', { type: event.type });
      }

      res.json({ received: true });
    } catch (error) {
      logger.error('Error processing webhook', {
        type: event.type,
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  })
);

// ═══════════════════════════════════════════════════════════
// Webhook Event Handlers
// ═══════════════════════════════════════════════════════════

async function handleSubscriptionCreated(stripeSubscription) {
  logger.info('Processing subscription.created', {
    subscriptionId: stripeSubscription.id
  });

  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeSubscription.id }
  });

  if (subscription) {
    await subscription.update({
      status: stripeSubscription.status,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000)
    });
  }
}

async function handleSubscriptionUpdated(stripeSubscription) {
  logger.info('Processing subscription.updated', {
    subscriptionId: stripeSubscription.id,
    status: stripeSubscription.status
  });

  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeSubscription.id }
  });

  if (!subscription) {
    logger.warn('Subscription not found for webhook', {
      stripeSubscriptionId: stripeSubscription.id
    });
    return;
  }

  await subscription.update({
    status: stripeSubscription.status,
    currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
  });

  // If subscription was canceled, downgrade to free tier
  if (stripeSubscription.status === 'canceled') {
    await subscription.update({
      tier: 'free',
      status: 'canceled'
    });

    logger.info('Subscription downgraded to free tier', {
      subscriptionId: subscription.id
    });
  }
}

async function handleSubscriptionDeleted(stripeSubscription) {
  logger.info('Processing subscription.deleted', {
    subscriptionId: stripeSubscription.id
  });

  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeSubscription.id }
  });

  if (subscription) {
    await subscription.update({
      tier: 'free',
      status: 'canceled',
      canceledAt: new Date()
    });
  }
}

async function handleTrialWillEnd(stripeSubscription) {
  logger.info('Processing subscription.trial_will_end', {
    subscriptionId: stripeSubscription.id,
    trialEnd: stripeSubscription.trial_end
  });

  // TODO: Send notification to user about trial ending
  // This would integrate with exprsn-herald for email notifications
}

async function handleInvoiceCreated(stripeInvoice) {
  logger.info('Processing invoice.created', {
    invoiceId: stripeInvoice.id
  });

  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeInvoice.subscription }
  });

  if (!subscription) {
    logger.warn('Subscription not found for invoice', {
      stripeSubscriptionId: stripeInvoice.subscription
    });
    return;
  }

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber();

  // Create invoice record
  await Invoice.create({
    subscriptionId: subscription.id,
    invoiceNumber,
    stripeInvoiceId: stripeInvoice.id,
    status: 'draft',
    subtotal: stripeInvoice.subtotal / 100,
    tax: stripeInvoice.tax || 0,
    discount: stripeInvoice.discount || 0,
    total: stripeInvoice.total / 100,
    currency: stripeInvoice.currency.toUpperCase(),
    periodStart: new Date(stripeInvoice.period_start * 1000),
    periodEnd: new Date(stripeInvoice.period_end * 1000),
    dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null,
    lineItems: stripeInvoice.lines.data.map(line => ({
      description: line.description,
      amount: line.amount / 100,
      quantity: line.quantity,
      currency: line.currency.toUpperCase()
    }))
  });
}

async function handleInvoiceFinalized(stripeInvoice) {
  logger.info('Processing invoice.finalized', {
    invoiceId: stripeInvoice.id
  });

  const invoice = await Invoice.findOne({
    where: { stripeInvoiceId: stripeInvoice.id }
  });

  if (invoice) {
    await invoice.update({
      status: 'open',
      dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null
    });
  }
}

async function handleInvoicePaid(stripeInvoice) {
  logger.info('Processing invoice.paid', {
    invoiceId: stripeInvoice.id
  });

  const invoice = await Invoice.findOne({
    where: { stripeInvoiceId: stripeInvoice.id }
  });

  if (invoice) {
    await invoice.update({
      status: 'paid',
      paidAt: new Date()
    });
  }

  // Update subscription status if it was past_due
  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeInvoice.subscription }
  });

  if (subscription && subscription.status === 'past_due') {
    await subscription.update({
      status: 'active'
    });
  }
}

async function handleInvoicePaymentFailed(stripeInvoice) {
  logger.warn('Processing invoice.payment_failed', {
    invoiceId: stripeInvoice.id,
    attemptCount: stripeInvoice.attempt_count
  });

  const invoice = await Invoice.findOne({
    where: { stripeInvoiceId: stripeInvoice.id }
  });

  if (invoice) {
    await invoice.update({
      attemptedAt: new Date(),
      nextPaymentAttempt: stripeInvoice.next_payment_attempt
        ? new Date(stripeInvoice.next_payment_attempt * 1000)
        : null
    });
  }

  // Update subscription status to past_due
  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId: stripeInvoice.subscription }
  });

  if (subscription) {
    await subscription.update({
      status: 'past_due'
    });
  }

  // TODO: Send payment failed notification to user
}

async function handlePaymentSucceeded(paymentIntent) {
  logger.info('Processing payment_intent.succeeded', {
    paymentIntentId: paymentIntent.id
  });

  // Handle one-time payments if needed
}

async function handlePaymentFailed(paymentIntent) {
  logger.warn('Processing payment_intent.payment_failed', {
    paymentIntentId: paymentIntent.id
  });

  // Handle payment failures
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');

  // Get count of invoices this month
  const count = await Invoice.count({
    where: {
      invoiceNumber: {
        [require('sequelize').Op.like]: `INV-${year}-${month}-%`
      }
    }
  });

  const sequence = String(count + 1).padStart(6, '0');
  return `INV-${year}-${month}-${sequence}`;
}

module.exports = { router, initModels };
