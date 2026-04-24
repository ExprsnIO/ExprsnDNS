/**
 * Exprsn DNS - HTTP query route
 */

const express = require('express');
const queryController = require('../controllers/queryController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// /resolve is intentionally readable without auth when DNS_REQUIRE_AUTH=false
router.get('/', authenticate({ required: false }), queryController.resolve);

module.exports = router;
