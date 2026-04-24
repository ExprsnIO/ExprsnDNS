/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage CA configurations
 */

const express = require('express');
const router = express.Router();
const db = require('../models');
const { Certificate, Token } = db;
const config = require('../config/app');
const caConfig = require('../config/ca');
const ocspConfig = require('../config/ocsp');
const tokenConfig = require('../config/token');
const logger = require('../utils/logger');

/**
 * GET /api/config/:sectionId
 * Fetch configuration for a specific section
 */
router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'cert-root':
        data = await getRootCertificateConfig();
        break;

      case 'cert-intermediate':
        data = await getIntermediateCertificateConfig();
        break;

      case 'cert-tokens':
        data = await getTokenConfig();
        break;

      case 'cert-ocsp':
        data = await getOCSPConfig();
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/config/:sectionId
 * Update configuration for a specific section
 */
router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'cert-root':
        result = await updateRootCertificateConfig(configData);
        break;

      case 'cert-intermediate':
        result = await updateIntermediateCertificateConfig(configData);
        break;

      case 'cert-tokens':
        result = await updateTokenConfig(configData);
        break;

      case 'cert-ocsp':
        result = await updateOCSPConfig(configData);
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Configuration Fetching Functions
// ========================================

async function getRootCertificateConfig() {
  // Fetch root certificates
  const rootCerts = await Certificate.findAll({
    where: { type: 'root' },
    order: [['created_at', 'DESC']],
    limit: 10
  });

  return {
    title: 'Root Certificates',
    description: 'Manage root CA certificates and trust anchors',
    fields: [
      { name: 'commonName', label: 'Common Name', type: 'text', value: caConfig.ca.commonName || 'Exprsn Root CA' },
      { name: 'country', label: 'Country', type: 'text', value: caConfig.ca.country || 'US' },
      { name: 'organization', label: 'Organization', type: 'text', value: caConfig.ca.organization || 'Exprsn' },
      { name: 'organizationalUnit', label: 'Organizational Unit', type: 'text', value: caConfig.ca.organizationalUnit || '' },
      { name: 'validity', label: 'Validity (days)', type: 'number', value: caConfig.ca.validity || 3650 },
      { name: 'keySize', label: 'Key Size', type: 'select', options: ['2048', '4096'], value: String(caConfig.ca.keySize || 2048) }
    ],
    table: {
      headers: ['Serial Number', 'Subject', 'Valid Until', 'Status'],
      rows: rootCerts.map(cert => [
        cert.serial_number,
        cert.subject,
        new Date(cert.not_after).toLocaleDateString(),
        cert.status
      ])
    }
  };
}

async function getIntermediateCertificateConfig() {
  // Fetch intermediate certificates
  const intermediateCerts = await Certificate.findAll({
    where: { type: 'intermediate' },
    order: [['created_at', 'DESC']],
    limit: 10
  });

  // Get root certificates for parent selection
  const rootCerts = await Certificate.findAll({
    where: { type: 'root', status: 'valid' }
  });

  return {
    title: 'Intermediate Certificates',
    description: 'Manage intermediate CA certificates for delegated signing',
    fields: [
      { name: 'commonName', label: 'Common Name', type: 'text', value: 'Exprsn Intermediate CA' },
      { name: 'parentCA', label: 'Parent CA', type: 'select', options: rootCerts.map(c => c.subject), value: rootCerts[0]?.subject || '' },
      { name: 'validity', label: 'Validity (days)', type: 'number', value: 1825 },
      { name: 'pathLength', label: 'Path Length Constraint', type: 'number', value: 0 }
    ],
    table: {
      headers: ['Serial Number', 'Subject', 'Issuer', 'Valid Until', 'Status'],
      rows: intermediateCerts.map(cert => [
        cert.serial_number,
        cert.subject,
        cert.issuer,
        new Date(cert.not_after).toLocaleDateString(),
        cert.status
      ])
    }
  };
}

async function getTokenConfig() {
  // Get token statistics
  const totalTokens = await Token.count();
  const activeTokens = await Token.count({ where: { status: 'active' } });
  const expiredTokens = await Token.count({ where: { status: 'expired' } });
  const revokedTokens = await Token.count({ where: { status: 'revoked' } });

  return {
    title: 'CA Tokens',
    description: 'Configure CA token generation and validation settings (Spec v1.0)',
    fields: [
      { name: 'defaultExpiry', label: 'Default Expiry (seconds)', type: 'number', value: tokenConfig.token.defaultExpiry || 3600 },
      { name: 'maxExpiry', label: 'Maximum Expiry (seconds)', type: 'number', value: tokenConfig.token.maxExpiry || 86400 },
      { name: 'algorithm', label: 'Signature Algorithm', type: 'select', options: ['RSA-SHA256', 'RSA-SHA512'], value: tokenConfig.token.signatureAlgorithm || 'RSA-SHA256' },
      { name: 'enableCaching', label: 'Enable Validation Caching', type: 'checkbox', value: tokenConfig.token.enableCaching !== false },
      { name: 'cacheTime', label: 'Cache Time (seconds)', type: 'number', value: tokenConfig.token.cacheTime || 300 }
    ],
    stats: {
      total: totalTokens,
      active: activeTokens,
      expired: expiredTokens,
      revoked: revokedTokens
    }
  };
}

async function getOCSPConfig() {
  return {
    title: 'OCSP / CRL Settings',
    description: 'Configure Online Certificate Status Protocol and Certificate Revocation Lists',
    fields: [
      { name: 'ocspEnabled', label: 'Enable OCSP', type: 'checkbox', value: ocspConfig.ocsp.enabled !== false },
      { name: 'ocspPort', label: 'OCSP Port', type: 'number', value: ocspConfig.ocsp.port || 2560 },
      { name: 'ocspResponderUrl', label: 'OCSP Responder URL', type: 'text', value: ocspConfig.ocsp.responderUrl || `http://localhost:${ocspConfig.ocsp.port || 2560}` },
      { name: 'crlEnabled', label: 'Enable CRL', type: 'checkbox', value: config.crl.enabled !== false },
      { name: 'crlUpdateInterval', label: 'CRL Update Interval (hours)', type: 'number', value: config.crl.updateInterval || 24 },
      { name: 'crlDistributionPoint', label: 'CRL Distribution Point', type: 'text', value: config.crl.distributionPoint || 'http://localhost:3000/crl' }
    ]
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updateRootCertificateConfig(configData) {
  // Update CA configuration
  // Note: In production, these would be written to a config file or database
  logger.info('Root certificate configuration updated:', configData);

  return {
    message: 'Root certificate configuration updated successfully',
    config: configData
  };
}

async function updateIntermediateCertificateConfig(configData) {
  logger.info('Intermediate certificate configuration updated:', configData);

  return {
    message: 'Intermediate certificate configuration updated successfully',
    config: configData
  };
}

async function updateTokenConfig(configData) {
  logger.info('Token configuration updated:', configData);

  // Update runtime configuration
  if (configData.defaultExpiry) {
    tokenConfig.token.defaultExpiry = parseInt(configData.defaultExpiry);
  }
  if (configData.maxExpiry) {
    tokenConfig.token.maxExpiry = parseInt(configData.maxExpiry);
  }
  if (configData.algorithm) {
    tokenConfig.token.signatureAlgorithm = configData.algorithm;
  }
  if (configData.enableCaching !== undefined) {
    tokenConfig.token.enableCaching = configData.enableCaching;
  }
  if (configData.cacheTime) {
    tokenConfig.token.cacheTime = parseInt(configData.cacheTime);
  }

  return {
    message: 'Token configuration updated successfully',
    config: configData
  };
}

async function updateOCSPConfig(configData) {
  logger.info('OCSP/CRL configuration updated:', configData);

  return {
    message: 'OCSP/CRL configuration updated successfully',
    config: configData
  };
}

module.exports = router;
