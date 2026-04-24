/**
 * Exprsn DNS - Zone Controller
 */

const { Zone, Record } = require('../models');
const dnsName = require('../utils/dnsName');
const cache = require('../services/cache');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const { limit = 50, offset = 0, q } = req.query;
    const where = {};
    if (q) {
      where.name = { [require('sequelize').Op.iLike]: `%${q.toLowerCase()}%` };
    }
    const { rows, count } = await Zone.findAndCountAll({
      where,
      limit: Math.min(parseInt(limit, 10) || 50, 500),
      offset: parseInt(offset, 10) || 0,
      order: [['name', 'ASC']]
    });
    res.json({ zones: rows, total: count });
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const zone = await Zone.findByPk(req.params.id, { include: [{ model: Record, as: 'records' }] });
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });
    res.json({ zone });
  } catch (err) { next(err); }
}

async function getByName(req, res, next) {
  try {
    const name = dnsName.normalize(req.params.name);
    const zone = await Zone.findOne({ where: { name } });
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });
    res.json({ zone });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const zone = await Zone.create({
      ...req.body,
      ownerId: req.auth?.subject,
      serial: Math.floor(Date.now() / 1000)
    });
    await cache.invalidateZone(zone.name).catch(() => {});
    logger.info('Zone created', { zoneId: zone.id, name: zone.name });
    res.status(201).json({ zone });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'conflict', message: 'Zone already exists' });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const zone = await Zone.findByPk(req.params.id);
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });
    Object.assign(zone, req.body);
    zone.bumpSerial();
    await zone.save();
    await cache.invalidateZone(zone.name).catch(() => {});
    res.json({ zone });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const zone = await Zone.findByPk(req.params.id);
    if (!zone) return res.status(404).json({ error: 'not_found', message: 'Zone not found' });
    const name = zone.name;
    await zone.destroy();
    await cache.invalidateZone(name).catch(() => {});
    logger.info('Zone deleted', { name });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { list, get, getByName, create, update, remove };
