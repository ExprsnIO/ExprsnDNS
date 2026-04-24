/**
 * Exprsn DNS - Joi schemas for zone/record payloads
 */

const Joi = require('joi');

const zoneCreate = Joi.object({
  name: Joi.string().min(1).max(253).required(),
  kind: Joi.string().valid('primary', 'secondary', 'forward').default('primary'),
  primaryNs: Joi.string().max(253).required(),
  adminEmail: Joi.string().max(253).required(),
  defaultTtl: Joi.number().integer().min(60).max(2592000).default(3600),
  refresh: Joi.number().integer().min(60).default(3600),
  retry: Joi.number().integer().min(60).default(1800),
  expire: Joi.number().integer().min(3600).default(604800),
  minimum: Joi.number().integer().min(60).default(300),
  masters: Joi.array().items(Joi.string()).default([]),
  allowTransfer: Joi.array().items(Joi.string()).default([]),
  allowUpdate: Joi.array().items(Joi.string()).default([]),
  notify: Joi.array().items(Joi.string()).default([]),
  dnssecEnabled: Joi.boolean().default(false),
  organizationId: Joi.string().uuid().optional(),
  metadata: Joi.object().default({})
});

const zoneUpdate = zoneCreate.fork(
  ['name', 'primaryNs', 'adminEmail'],
  (s) => s.optional()
);

const recordCreate = Joi.object({
  name: Joi.string().min(1).max(253).default('@'),
  type: Joi.string().uppercase().required(),
  class: Joi.string().uppercase().valid('IN', 'CH', 'HS').default('IN'),
  ttl: Joi.number().integer().min(0).max(2592000).optional(),
  rdata: Joi.string().allow('', null).optional(),
  data: Joi.object().optional(),
  priority: Joi.number().integer().optional(),
  weight: Joi.number().integer().optional(),
  port: Joi.number().integer().optional(),
  disabled: Joi.boolean().default(false),
  comment: Joi.string().allow('', null).optional()
}).custom((value, helpers) => {
  if (!value.rdata && (!value.data || Object.keys(value.data).length === 0)) {
    return helpers.error('any.custom', { message: 'rdata or structured data is required' });
  }
  return value;
});

const recordUpdate = recordCreate.fork(['type'], (s) => s.optional());

module.exports = { zoneCreate, zoneUpdate, recordCreate, recordUpdate };
