/**
 * ═══════════════════════════════════════════════════════════
 * Health Routes
 * Health check endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { sequelize } = require('../models');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'exprsn-auth',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/db
 * Database health check
 */
router.get('/db', asyncHandler(async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'healthy',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
}));

/**
 * GET /health/ca
 * CA service health check
 */
router.get('/ca', asyncHandler(async (req, res) => {
  try {
    const response = await axios.get(`${config.ca.url}/health`, {
      timeout: 5000
    });

    res.json({
      status: 'healthy',
      ca: 'connected',
      caStatus: response.data
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      ca: 'disconnected',
      error: error.message
    });
  }
}));

module.exports = router;
