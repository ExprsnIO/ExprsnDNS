/**
 * Invoice Model
 * Tracks billing invoices and payment history
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'subscription_id',
      references: {
        model: 'subscriptions',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    invoiceNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'invoice_number',
      comment: 'Human-readable invoice number (e.g., INV-2024-001234)'
    },
    stripeInvoiceId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'stripe_invoice_id'
    },
    status: {
      type: DataTypes.ENUM('draft', 'open', 'paid', 'uncollectible', 'void'),
      allowNull: false,
      defaultValue: 'draft'
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Amount before taxes and discounts'
    },
    tax: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Final amount due'
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'period_start'
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'period_end'
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'due_date'
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'paid_at'
    },
    attemptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'attempted_at'
    },
    nextPaymentAttempt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_payment_attempt'
    },
    lineItems: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'line_items',
      comment: 'Array of invoice line items with descriptions and amounts'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'invoices',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['subscription_id'] },
      { fields: ['invoice_number'], unique: true },
      { fields: ['stripe_invoice_id'] },
      { fields: ['status'] },
      { fields: ['period_start', 'period_end'] },
      { fields: ['due_date'] },
      { fields: ['paid_at'] }
    ]
  });

  return Invoice;
};
