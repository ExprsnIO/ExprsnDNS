/**
 * Exprsn DNS - Health & readiness routes
 */

const express = require('express');
const { sequelize } = require('../models');
const { getRedis } = require('../utils/redis');

const router = express.Router();

router.get('/live', (req, res) => {
  res.json({ status: 'ok', service: 'exprsn-dns', time: new Date().toISOString() });
});

router.get('/ready', async (req, res) => {
  const checks = { db: 'unknown', redis: 'unknown' };
  let ok = true;

  try {
    await sequelize.authenticate();
    checks.db = 'ok';
  } catch (err) {
    checks.db = `error: ${err.message}`;
    ok = false;
  }

  try {
    const redis = getRedis();
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : `unexpected: ${pong}`;
  } catch (err) {
    checks.redis = `error: ${err.message}`;
    ok = false;
  }

  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});

module.exports = router;
