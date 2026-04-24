/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup Wizard Routes - First-Run Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const setupService = require('../services/setup');
const logger = require('../utils/logger');

/**
 * GET /setup
 * Display setup wizard page
 */
router.get('/', async (req, res) => {
  try {
    // Check if setup is already complete
    const isComplete = await setupService.isSetupComplete();

    if (isComplete) {
      return res.redirect('/?setup=complete');
    }

    res.render('setup/wizard', {
      title: 'Setup Wizard - Exprsn CA',
      step: 'welcome'
    });
  } catch (error) {
    logger.error('Error loading setup wizard:', error);
    res.status(500).render('error', {
      title: 'Setup Error',
      message: 'Failed to load setup wizard',
      error
    });
  }
});

/**
 * GET /setup/status
 * Check if setup is complete
 */
router.get('/status', async (req, res) => {
  try {
    const isComplete = await setupService.isSetupComplete();

    res.json({
      setupComplete: isComplete
    });
  } catch (error) {
    logger.error('Error checking setup status:', error);
    res.status(500).json({
      error: 'Failed to check setup status',
      message: error.message
    });
  }
});

/**
 * POST /setup/test-database
 * Test database connection
 */
router.post('/test-database', async (req, res) => {
  try {
    const { host, port, database, username, password } = req.body;

    const result = await setupService.testDatabaseConnection({
      host,
      port: parseInt(port),
      database,
      username,
      password
    });

    res.json(result);
  } catch (error) {
    logger.error('Database test failed:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/test-redis
 * Test Redis connection
 */
router.post('/test-redis', async (req, res) => {
  try {
    const { host, port, password, db } = req.body;

    const result = await setupService.testRedisConnection({
      host,
      port: parseInt(port),
      password,
      db: parseInt(db || 0)
    });

    res.json(result);
  } catch (error) {
    logger.error('Redis test failed:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/run
 * Execute the setup process
 */
router.post('/run', async (req, res) => {
  try {
    // Check if setup is already complete
    const isComplete = await setupService.isSetupComplete();

    if (isComplete) {
      return res.status(400).json({
        error: 'Setup already complete',
        message: 'The system has already been set up. Please contact an administrator to reconfigure.'
      });
    }

    // Validate required fields
    const requiredFields = [
      'admin.email',
      'admin.password',
      'ca.name',
      'ca.domain',
      'ca.country',
      'ca.organization',
      'ca.email',
      'database.host',
      'database.database',
      'database.username',
      'database.password'
    ];

    const missingFields = [];
    for (const field of requiredFields) {
      const parts = field.split('.');
      let value = req.body;
      for (const part of parts) {
        value = value?.[part];
      }
      if (!value) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: missingFields
      });
    }

    // Run setup
    const result = await setupService.runSetup(req.body);

    res.json({
      success: true,
      message: 'Setup completed successfully',
      data: {
        adminUserId: result.adminUser.id,
        rootCertId: result.rootCert.id,
        intermediateCertId: result.intermediateCert?.id,
        groupsCreated: result.groups.length,
        rolesCreated: result.roles.length
      }
    });
  } catch (error) {
    logger.error('Setup execution failed:', error);
    res.status(500).json({
      error: 'Setup failed',
      message: error.message,
      details: error.stack
    });
  }
});

/**
 * POST /setup/test-smtp
 * Test SMTP connection
 */
router.post('/test-smtp', async (req, res) => {
  try {
    const { host, port, user, password, secure, from } = req.body;

    const result = await setupService.testSMTPConnection({
      host,
      port: parseInt(port),
      user,
      password,
      secure,
      from
    });

    res.json(result);
  } catch (error) {
    logger.error('SMTP test failed:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/validate-sso
 * Validate SAML/SSO configuration
 */
router.post('/validate-sso', async (req, res) => {
  try {
    const { provider, entityId, idpMetadataUrl, idpSsoUrl, idpCert, acsUrl } = req.body;

    const result = await setupService.validateSSOConfiguration({
      provider,
      entityId,
      idpMetadataUrl,
      idpSsoUrl,
      idpCert,
      acsUrl
    });

    res.json(result);
  } catch (error) {
    logger.error('SSO validation failed:', error);
    res.json({
      valid: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/upload-ddl
 * Upload and apply database schema (DDL)
 */
router.post('/upload-ddl', async (req, res) => {
  try {
    const { host, port, database, username, password, ssl } = req.body;

    const result = await setupService.uploadDatabaseSchema({
      host,
      port: parseInt(port),
      database,
      username,
      password,
      ssl
    });

    res.json(result);
  } catch (error) {
    logger.error('DDL upload failed:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/create-service-databases
 * Create databases for selected services
 */
router.post('/create-service-databases', async (req, res) => {
  try {
    const { host, port, username, password, ssl, databases } = req.body;

    const result = await setupService.createServiceDatabases({
      host,
      port: parseInt(port),
      username,
      password,
      ssl,
      databases
    });

    res.json(result);
  } catch (error) {
    logger.error('Service database creation failed:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/create-s3-buckets
 * Create S3 buckets for selected services
 */
router.post('/create-s3-buckets', async (req, res) => {
  try {
    const { provider, bucket, region, endpoint, accessKey, secretKey, forcePathStyle, buckets } = req.body;

    const result = await setupService.createS3Buckets({
      provider,
      bucket,
      region,
      endpoint,
      accessKey,
      secretKey,
      forcePathStyle,
      buckets
    });

    res.json(result);
  } catch (error) {
    logger.error('S3 bucket creation failed:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/test-s3
 * Test S3 connection
 */
router.post('/test-s3', async (req, res) => {
  try {
    const { provider, bucket, region, endpoint, accessKey, secretKey, forcePathStyle } = req.body;

    const result = await setupService.testS3Connection({
      provider,
      bucket,
      region,
      endpoint,
      accessKey,
      secretKey,
      forcePathStyle
    });

    res.json(result);
  } catch (error) {
    logger.error('S3 test failed:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /setup/validate
 * Validate setup configuration without running it
 */
router.post('/validate', async (req, res) => {
  try {
    const errors = [];
    const warnings = [];

    // Validate admin user
    if (!req.body.admin?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.admin.email)) {
      errors.push('Valid admin email is required');
    }

    if (!req.body.admin?.password || req.body.admin.password.length < 8) {
      errors.push('Admin password must be at least 8 characters');
    }

    // Validate CA settings
    if (!req.body.ca?.name) {
      errors.push('CA name is required');
    }

    if (!req.body.ca?.domain) {
      errors.push('CA domain is required');
    }

    if (!req.body.ca?.country || req.body.ca.country.length !== 2) {
      errors.push('CA country code must be 2 characters (ISO 3166-1 alpha-2)');
    }

    if (!req.body.ca?.organization) {
      errors.push('CA organization is required');
    }

    if (!req.body.ca?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.ca.email)) {
      errors.push('Valid CA email is required');
    }

    // Validate database settings
    if (!req.body.database?.host) {
      errors.push('Database host is required');
    }

    if (!req.body.database?.database) {
      errors.push('Database name is required');
    }

    if (!req.body.database?.username) {
      errors.push('Database username is required');
    }

    if (!req.body.database?.password) {
      warnings.push('Database password is not set');
    }

    // Validate Redis settings (if enabled)
    if (req.body.redis?.enabled) {
      if (!req.body.redis?.host) {
        errors.push('Redis host is required when Redis is enabled');
      }
    }

    // Validate key sizes
    if (req.body.ca?.rootKeySize && ![2048, 4096].includes(parseInt(req.body.ca.rootKeySize))) {
      errors.push('Root key size must be 2048 or 4096');
    }

    if (req.body.ca?.intermediateKeySize && ![2048, 4096].includes(parseInt(req.body.ca.intermediateKeySize))) {
      errors.push('Intermediate key size must be 2048 or 4096');
    }

    res.json({
      valid: errors.length === 0,
      errors,
      warnings
    });
  } catch (error) {
    logger.error('Validation failed:', error);
    res.status(500).json({
      error: 'Validation failed',
      message: error.message
    });
  }
});

module.exports = router;
