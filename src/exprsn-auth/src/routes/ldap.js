/**
 * ═══════════════════════════════════════════════════════════
 * LDAP Routes
 * LDAP/Active Directory configuration and management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const ldapService = require('../services/ldapService');
const { LdapConfig } = require('../models');
const { requireAuth } = require('../middleware/requireAuth');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Validation schemas
 */
const ldapConfigSchema = Joi.object({
  organizationId: Joi.string().uuid().allow(null).optional(),
  name: Joi.string().min(1).max(255).required(),
  host: Joi.string().hostname().required(),
  port: Joi.number().integer().min(1).max(65535).default(389),
  useSSL: Joi.boolean().default(false),
  useTLS: Joi.boolean().default(true),
  bindDN: Joi.string().required(),
  bindPassword: Joi.string().required(),
  baseDN: Joi.string().required(),
  userSearchBase: Joi.string().required(),
  userSearchFilter: Joi.string().default('(&(objectClass=person)(uid={{username}}))'),
  userObjectClass: Joi.string().default('person'),
  groupSearchBase: Joi.string().allow('', null).optional(),
  groupSearchFilter: Joi.string().default('(objectClass=groupOfNames)'),
  groupObjectClass: Joi.string().default('groupOfNames'),
  attributeMapping: Joi.object().default({
    username: 'uid',
    email: 'mail',
    firstName: 'givenName',
    lastName: 'sn',
    displayName: 'displayName',
    phone: 'telephoneNumber',
    title: 'title',
    department: 'department',
    memberOf: 'memberOf'
  }),
  groupMapping: Joi.object().default({}),
  syncEnabled: Joi.boolean().default(false),
  syncInterval: Joi.number().integer().min(60000).default(3600000),
  syncUsers: Joi.boolean().default(true),
  syncGroups: Joi.boolean().default(true),
  autoCreateUsers: Joi.boolean().default(true),
  defaultUserRole: Joi.string().default('user'),
  updateUserOnLogin: Joi.boolean().default(true),
  allowWeakCiphers: Joi.boolean().default(false),
  verifyCertificate: Joi.boolean().default(true),
  timeout: Joi.number().integer().min(1000).max(60000).default(10000),
  poolSize: Joi.number().integer().min(1).max(20).default(5),
  status: Joi.string().valid('active', 'disabled', 'error', 'testing').default('active'),
  metadata: Joi.object().default({})
});

/**
 * Authorization middleware - require admin role
 */
async function requireAdmin(req, res, next) {
  try {
    // Check if user has admin role
    const hasAdminRole = req.user && req.user.roles &&
      req.user.roles.some(role => role.name === 'admin' || role.name === 'system_admin');

    if (!hasAdminRole) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ldap/configs
 * Create new LDAP configuration
 */
router.post('/configs', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = ldapConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    // Create config
    const config = await LdapConfig.create(value);

    logger.info('LDAP configuration created', { configId: config.id, userId: req.user.id });

    res.status(201).json({
      success: true,
      config: {
        ...config.toJSON(),
        bindPassword: '***REDACTED***' // Don't send password back
      }
    });
  } catch (error) {
    logger.error('Failed to create LDAP config', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/ldap/configs
 * List all LDAP configurations
 */
router.get('/configs', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { organizationId } = req.query;

    const where = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const configs = await LdapConfig.findAll({
      where,
      attributes: { exclude: ['bindPassword'] }, // Don't expose passwords
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      configs
    });
  } catch (error) {
    logger.error('Failed to list LDAP configs', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/ldap/configs/:id
 * Get LDAP configuration by ID
 */
router.get('/configs/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id, {
      attributes: { exclude: ['bindPassword'] }
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Failed to get LDAP config', { error: error.message });
    next(error);
  }
});

/**
 * PUT /api/ldap/configs/:id
 * Update LDAP configuration
 */
router.put('/configs/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    // Validate input
    const { error, value } = ldapConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    // Update config
    await config.update(value);

    // Restart periodic sync if enabled
    if (config.syncEnabled) {
      ldapService.stopPeriodicSync(config.id);
      await ldapService.startPeriodicSync(config.id);
    } else {
      ldapService.stopPeriodicSync(config.id);
    }

    logger.info('LDAP configuration updated', { configId: config.id, userId: req.user.id });

    res.json({
      success: true,
      config: {
        ...config.toJSON(),
        bindPassword: '***REDACTED***'
      }
    });
  } catch (error) {
    logger.error('Failed to update LDAP config', { error: error.message });
    next(error);
  }
});

/**
 * DELETE /api/ldap/configs/:id
 * Delete LDAP configuration
 */
router.delete('/configs/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    // Stop periodic sync
    ldapService.stopPeriodicSync(config.id);

    // Soft delete
    await config.destroy();

    logger.info('LDAP configuration deleted', { configId: config.id, userId: req.user.id });

    res.json({
      success: true,
      message: 'LDAP configuration deleted'
    });
  } catch (error) {
    logger.error('Failed to delete LDAP config', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/ldap/configs/:id/test
 * Test LDAP connection
 */
router.post('/configs/:id/test', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    // Set status to testing
    await config.update({ status: 'testing' });

    // Test connection
    const result = await ldapService.testConnection(config);

    // Update status based on result
    await config.update({
      status: result.success ? 'active' : 'error',
      lastSyncError: result.success ? null : result.message
    });

    logger.info('LDAP connection tested', { configId: config.id, success: result.success });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    // Update status to error
    await LdapConfig.update(
      { status: 'error', lastSyncError: error.message },
      { where: { id: req.params.id } }
    );

    logger.error('LDAP connection test failed', { configId: req.params.id, error: error.message });

    res.status(500).json({
      success: false,
      error: 'LDAP_TEST_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/ldap/configs/:id/sync/users
 * Sync users from LDAP
 */
router.post('/configs/:id/sync/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    logger.info('Starting LDAP user sync', { configId: config.id, userId: req.user.id });

    // Start sync (async)
    const results = await ldapService.syncUsers(config.id);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error('LDAP user sync failed', { configId: req.params.id, error: error.message });

    res.status(500).json({
      success: false,
      error: 'LDAP_SYNC_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/ldap/configs/:id/sync/groups
 * Sync groups from LDAP
 */
router.post('/configs/:id/sync/groups', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    logger.info('Starting LDAP group sync', { configId: config.id, userId: req.user.id });

    // Start sync (async)
    const results = await ldapService.syncGroups(config.id);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error('LDAP group sync failed', { configId: req.params.id, error: error.message });

    res.status(500).json({
      success: false,
      error: 'LDAP_SYNC_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/ldap/configs/:id/sync/all
 * Sync both users and groups from LDAP
 */
router.post('/configs/:id/sync/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    logger.info('Starting full LDAP sync', { configId: config.id, userId: req.user.id });

    // Start sync (async)
    const results = await ldapService.syncAll(config.id);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error('Full LDAP sync failed', { configId: req.params.id, error: error.message });

    res.status(500).json({
      success: false,
      error: 'LDAP_SYNC_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/ldap/configs/:id/sync/start
 * Start periodic sync
 */
router.post('/configs/:id/sync/start', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    // Enable sync
    await config.update({ syncEnabled: true });

    // Start periodic sync
    await ldapService.startPeriodicSync(config.id);

    logger.info('LDAP periodic sync started', { configId: config.id, userId: req.user.id });

    res.json({
      success: true,
      message: 'Periodic sync started'
    });
  } catch (error) {
    logger.error('Failed to start LDAP periodic sync', { configId: req.params.id, error: error.message });
    next(error);
  }
});

/**
 * POST /api/ldap/configs/:id/sync/stop
 * Stop periodic sync
 */
router.post('/configs/:id/sync/stop', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    // Disable sync
    await config.update({ syncEnabled: false });

    // Stop periodic sync
    ldapService.stopPeriodicSync(config.id);

    logger.info('LDAP periodic sync stopped', { configId: config.id, userId: req.user.id });

    res.json({
      success: true,
      message: 'Periodic sync stopped'
    });
  } catch (error) {
    logger.error('Failed to stop LDAP periodic sync', { configId: req.params.id, error: error.message });
    next(error);
  }
});

/**
 * GET /api/ldap/configs/:id/stats
 * Get LDAP configuration statistics
 */
router.get('/configs/:id/stats', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await LdapConfig.findByPk(req.params.id, {
      attributes: ['id', 'name', 'status', 'stats', 'lastSyncAt', 'lastSyncStatus', 'syncEnabled']
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'LDAP configuration not found'
      });
    }

    res.json({
      success: true,
      stats: config
    });
  } catch (error) {
    logger.error('Failed to get LDAP stats', { error: error.message });
    next(error);
  }
});

module.exports = router;
