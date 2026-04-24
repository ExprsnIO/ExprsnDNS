/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRL Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const crlService = require('../services/crl');

/**
 * GET /crl - Download CRL (PEM format)
 */
router.get('/', (req, res) => {
  try {
    const crl = crlService.getCurrentCRL('pem');

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="ca.crl"');
    res.send(crl);
  } catch (error) {
    req.logger.error('CRL download failed:', error);

    res.status(500).json({
      error: 'CRL_UNAVAILABLE',
      message: 'Certificate Revocation List is not available'
    });
  }
});

/**
 * GET /crl/der - Download CRL (DER format)
 */
router.get('/der', (req, res) => {
  try {
    const crl = crlService.getCurrentCRL('der');

    res.setHeader('Content-Type', 'application/pkix-crl');
    res.setHeader('Content-Disposition', 'attachment; filename="ca.crl"');
    res.send(crl);
  } catch (error) {
    req.logger.error('CRL download failed:', error);

    res.status(500).json({
      error: 'CRL_UNAVAILABLE',
      message: 'Certificate Revocation List is not available'
    });
  }
});

/**
 * GET /crl/info - CRL information
 */
router.get('/info', (req, res) => {
  try {
    const info = crlService.getCRLInfo();

    if (!info) {
      return res.status(503).json({
        error: 'CRL_UNAVAILABLE',
        message: 'CRL not yet generated'
      });
    }

    res.status(200).json({
      success: true,
      crl: info
    });
  } catch (error) {
    req.logger.error('Failed to get CRL info:', error);

    res.status(500).json({
      error: 'CRL_ERROR',
      message: 'Failed to get CRL information'
    });
  }
});

module.exports = router;
