/**
 * Exprsn DNS - Record Controller
 */

const { Zone, Record } = require('../models');
const rdataSvc = require('../services/rdata');
const cache = require('../services/cache');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const zone = await Zone.findByPk(req.params.zoneId);
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });
    const { type, name } = req.query;
    const where = { zoneId: zone.id };
    if (type) where.type = type.toUpperCase();
    if (name) where.name = name.toLowerCase();
    const records = await Record.findAll({ where, order: [['name', 'ASC'], ['type', 'ASC']] });
    res.json({ records, zone: { id: zone.id, name: zone.name } });
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const record = await Record.findOne({
      where: { id: req.params.recordId, zoneId: req.params.zoneId }
    });
    if (!record) return res.status(404).json({ error: 'not_found', message: 'Record not found' });
    res.json({ record });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const zone = await Zone.findByPk(req.params.zoneId);
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });

    const type = req.body.type.toUpperCase();
    if (!Record.SUPPORTED_TYPES.includes(type)) {
      return res.status(400).json({ error: 'unsupported_type', message: `Unsupported record type: ${type}` });
    }

    const { rdata, data } = rdataSvc.normalizeRdata(type, req.body.rdata, req.body.data);

    const record = await Record.create({
      zoneId: zone.id,
      name: (req.body.name || '@').toLowerCase(),
      type,
      class: req.body.class || 'IN',
      ttl: req.body.ttl ?? null,
      priority: req.body.priority ?? null,
      weight: req.body.weight ?? null,
      port: req.body.port ?? null,
      rdata,
      data,
      disabled: !!req.body.disabled,
      comment: req.body.comment || null
    });

    zone.bumpSerial();
    await zone.save();
    await cache.invalidateZone(zone.name).catch(() => {});
    logger.info('Record created', { zoneId: zone.id, recordId: record.id, type });
    res.status(201).json({ record });
  } catch (err) {
    if (err.message && err.message.startsWith('Invalid')) {
      return res.status(400).json({ error: 'invalid_rdata', message: err.message });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const zone = await Zone.findByPk(req.params.zoneId);
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });

    const record = await Record.findOne({ where: { id: req.params.recordId, zoneId: zone.id } });
    if (!record) return res.status(404).json({ error: 'not_found', message: 'Record not found' });

    const type = (req.body.type || record.type).toUpperCase();
    if (req.body.rdata !== undefined || req.body.data !== undefined) {
      const { rdata, data } = rdataSvc.normalizeRdata(type, req.body.rdata ?? record.rdata, req.body.data ?? record.data);
      record.rdata = rdata;
      record.data = data;
    }
    ['name', 'class', 'ttl', 'priority', 'weight', 'port', 'disabled', 'comment'].forEach((k) => {
      if (req.body[k] !== undefined) record[k] = req.body[k];
    });
    record.type = type;
    await record.save();

    zone.bumpSerial();
    await zone.save();
    await cache.invalidateZone(zone.name).catch(() => {});
    res.json({ record });
  } catch (err) {
    if (err.message && err.message.startsWith('Invalid')) {
      return res.status(400).json({ error: 'invalid_rdata', message: err.message });
    }
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const zone = await Zone.findByPk(req.params.zoneId);
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });

    const record = await Record.findOne({ where: { id: req.params.recordId, zoneId: zone.id } });
    if (!record) return res.status(404).json({ error: 'not_found', message: 'Record not found' });

    await record.destroy();
    zone.bumpSerial();
    await zone.save();
    await cache.invalidateZone(zone.name).catch(() => {});
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update, remove };
