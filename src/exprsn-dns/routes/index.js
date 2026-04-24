/**
 * Exprsn DNS - API route registry
 */

const express = require('express');
const zones = require('./zones');
const query = require('./query');
const health = require('./health');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    service: 'exprsn-dns',
    version: require('../package.json').version,
    endpoints: {
      health: '/health/live',
      ready: '/health/ready',
      zones: '/api/v1/zones',
      resolve: '/api/v1/resolve?name=&type='
    }
  });
});

router.use('/health', health);
router.use('/api/v1/zones', zones);
router.use('/api/v1/resolve', query);

module.exports = router;
