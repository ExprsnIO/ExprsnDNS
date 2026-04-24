/**
 * ═══════════════════════════════════════════════════════════════════════
 * OCSP Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const ocspService = require('../services/ocsp');

/**
 * POST /ocsp - OCSP responder endpoint
 */
router.post('/', async (req, res) => {
  try {
    const { serialNumber } = req.body;

    if (!serialNumber) {
      return res.status(400).json({
        error: 'SERIAL_NUMBER_REQUIRED',
        message: 'Certificate serial number is required'
      });
    }

    const response = await ocspService.checkStatus(serialNumber);

    res.status(200).json(response);
  } catch (error) {
    req.logger.error('OCSP check failed:', error);

    res.status(500).json({
      status: 'error',
      message: 'OCSP service unavailable'
    });
  }
});

/**
 * POST /ocsp/batch - Batch OCSP check
 */
router.post('/batch', async (req, res) => {
  try {
    const { serialNumbers } = req.body;

    if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'serialNumbers array is required'
      });
    }

    const responses = await ocspService.checkStatusBatch(serialNumbers);

    res.status(200).json({
      success: true,
      responses
    });
  } catch (error) {
    req.logger.error('OCSP batch check failed:', error);

    res.status(500).json({
      error: 'OCSP_UNAVAILABLE',
      message: 'OCSP service unavailable'
    });
  }
});

/**
 * GET /ocsp/status - OCSP service status
 */
router.get('/status', (req, res) => {
  const stats = ocspService.getCacheStats();

  res.status(200).json({
    status: 'operational',
    cache: stats,
    url: require('../config').ocsp.url
  });
});

module.exports = router;
