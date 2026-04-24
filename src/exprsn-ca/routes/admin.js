/**
 * ═══════════════════════════════════════════════════════════════════════
 * Admin Dashboard Routes
 * Real-time administration interface with Socket.IO
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Certificate, Token, User, Group, Role, AuditLog, Ticket } = require('../models');
const { Op } = require('sequelize');
const db = require('../models');
const {
  generateCertificateSchema,
  generateTokenSchema,
  revokeTokenSchema,
  validate
} = require('../validators');

/**
 * Middleware: Require authentication
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
}

/**
 * Middleware: Require admin role with proper RBAC
 */
async function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }

  try {
    const { User, Role } = require('../models');

    // Get user with roles
    const user = await User.findByPk(req.session.user.id, {
      include: [{
        model: Role,
        as: 'roles',
        where: {
          status: 'active'
        },
        required: false
      }]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not found'
      });
    }

    // Check if user has admin role
    const hasAdminRole = user.roles && user.roles.some(role =>
      role.slug === 'admin' || role.slug === 'super-admin' || role.slug === 'ca-admin'
    );

    if (!hasAdminRole) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Admin access required'
      });
    }

    // Attach user roles to request for further use
    req.userRoles = user.roles;
    next();
  } catch (error) {
    req.logger.error('Admin authorization error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to verify admin access'
    });
  }
}

/**
 * Admin Dashboard - Main View
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.session.user,
      activePage: 'dashboard'
    });
  } catch (error) {
    req.logger.error('Admin dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load admin dashboard',
      error
    });
  }
});

/**
 * Admin Operations - Certificate & Token Management
 */
router.get('/operations', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.render('admin/operations', {
      title: 'Admin Operations',
      user: req.session.user,
      activePage: 'operations'
    });
  } catch (error) {
    req.logger.error('Admin operations error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load admin operations',
      error
    });
  }
});

/**
 * API: Get Dashboard Statistics
 */
router.get('/api/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Overall statistics
    const stats = {
      // Certificate statistics
      certificates: {
        total: await Certificate.count(),
        active: await Certificate.count({ where: { status: 'active' } }),
        revoked: await Certificate.count({ where: { status: 'revoked' } }),
        expired: await Certificate.count({ where: { status: 'expired' } }),
        last24h: await Certificate.count({ where: { createdAt: { [Op.gte]: oneDayAgo } } }),
        lastWeek: await Certificate.count({ where: { createdAt: { [Op.gte]: oneWeekAgo } } }),
        lastMonth: await Certificate.count({ where: { createdAt: { [Op.gte]: oneMonthAgo } } }),
        byType: await Certificate.findAll({
          attributes: [
            'certificateType',
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
          ],
          group: ['certificateType']
        })
      },

      // Token statistics
      tokens: {
        total: await Token.count(),
        active: await Token.count({ where: { status: 'active' } }),
        revoked: await Token.count({ where: { status: 'revoked' } }),
        expired: await Token.count({ where: { status: 'expired' } }),
        last24h: await Token.count({ where: { createdAt: { [Op.gte]: oneDayAgo } } }),
        lastWeek: await Token.count({ where: { createdAt: { [Op.gte]: oneWeekAgo } } }),
        lastMonth: await Token.count({ where: { createdAt: { [Op.gte]: oneMonthAgo } } }),
        byExpiryType: await Token.findAll({
          attributes: [
            'expiryType',
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
          ],
          group: ['expiryType']
        })
      },

      // User statistics
      users: {
        total: await User.count(),
        active: await User.count({ where: { status: 'active' } }),
        locked: await User.count({ where: { locked: true } }),
        last24h: await User.count({ where: { createdAt: { [Op.gte]: oneDayAgo } } }),
        lastWeek: await User.count({ where: { createdAt: { [Op.gte]: oneWeekAgo } } }),
        lastMonth: await User.count({ where: { createdAt: { [Op.gte]: oneMonthAgo } } })
      },

      // Group statistics
      groups: {
        total: await Group.count()
      },

      // Role statistics
      roles: {
        total: await Role.count()
      },

      // Ticket statistics
      tickets: {
        total: await Ticket.count(),
        unused: await Ticket.count({ where: { used: false } }),
        used: await Ticket.count({ where: { used: true } }),
        expired: await Ticket.count({ where: { expiresAt: { [Op.lt]: now } } })
      },

      // Recent audit log count
      auditLogs: {
        last24h: await AuditLog.count({ where: { timestamp: { [Op.gte]: oneDayAgo } } }),
        lastWeek: await AuditLog.count({ where: { timestamp: { [Op.gte]: oneWeekAgo } } })
      },

      // System info
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    };

    res.json(stats);
  } catch (error) {
    req.logger.error('Failed to fetch dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * API: Get Recent Activity
 */
router.get('/api/activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const activities = await AuditLog.findAll({
      limit,
      offset,
      order: [['timestamp', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        }
      ]
    });

    const total = await AuditLog.count();

    res.json({
      activities,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    req.logger.error('Failed to fetch activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

/**
 * API: Get Recent Certificates
 */
router.get('/api/certificates/recent', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const certificates = await Certificate.findAll({
      limit,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        }
      ]
    });

    res.json(certificates);
  } catch (error) {
    req.logger.error('Failed to fetch recent certificates:', error);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

/**
 * API: Get Recent Tokens
 */
router.get('/api/tokens/recent', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const tokens = await Token.findAll({
      limit,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        },
        {
          model: Certificate,
          as: 'certificate',
          attributes: ['id', 'commonName', 'serialNumber']
        }
      ]
    });

    res.json(tokens);
  } catch (error) {
    req.logger.error('Failed to fetch recent tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

/**
 * API: Get Time Series Data
 */
router.get('/api/timeseries/:type', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const days = parseInt(req.query.days) || 7;
    const interval = req.query.interval || 'day'; // hour, day, week

    let Model;
    switch (type) {
      case 'certificates':
        Model = Certificate;
        break;
      case 'tokens':
        Model = Token;
        break;
      case 'users':
        Model = User;
        break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build time series query
    let dateFormat;
    if (interval === 'hour') {
      dateFormat = '%Y-%m-%d %H:00:00';
    } else if (interval === 'day') {
      dateFormat = '%Y-%m-%d';
    } else {
      dateFormat = '%Y-%W';
    }

    const results = await Model.findAll({
      attributes: [
        [db.sequelize.fn('DATE_FORMAT', db.sequelize.col('createdAt'), dateFormat), 'date'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
      ],
      where: {
        createdAt: { [Op.gte]: startDate }
      },
      group: [db.sequelize.fn('DATE_FORMAT', db.sequelize.col('createdAt'), dateFormat)],
      order: [[db.sequelize.fn('DATE_FORMAT', db.sequelize.col('createdAt'), dateFormat), 'ASC']]
    });

    res.json(results);
  } catch (error) {
    req.logger.error('Failed to fetch time series:', error);
    res.status(500).json({ error: 'Failed to fetch time series data' });
  }
});

/**
 * API: Get System Health
 */
router.get('/api/health', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Database health
    let dbHealth = 'healthy';
    let dbLatency = 0;
    try {
      const start = Date.now();
      await db.sequelize.authenticate();
      dbLatency = Date.now() - start;
    } catch (error) {
      dbHealth = 'unhealthy';
    }

    // Redis health (if enabled)
    let redisHealth = 'disabled';
    let redisLatency = 0;
    try {
      const config = require('../config');
      if (config.cache.enabled) {
        const cache = require('../utils/cache');
        const start = Date.now();
        await cache.ping();
        redisLatency = Date.now() - start;
        redisHealth = 'healthy';
      }
    } catch (error) {
      redisHealth = 'unhealthy';
    }

    // System metrics
    const health = {
      status: dbHealth === 'healthy' ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      uptime: process.uptime(),
      database: {
        status: dbHealth,
        latency: dbLatency
      },
      cache: {
        status: redisHealth,
        latency: redisLatency
      },
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
      },
      cpu: {
        user: process.cpuUsage().user,
        system: process.cpuUsage().system
      }
    };

    res.json(health);
  } catch (error) {
    req.logger.error('Failed to fetch health:', error);
    res.status(500).json({ error: 'Failed to fetch health data' });
  }
});

/**
 * API: Get Users List
 */
router.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';

    const where = search ? {
      [Op.or]: [
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ]
    } : {};

    const users = await User.findAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'username', 'email', 'status', 'locked', 'createdAt', 'lastLoginAt']
    });

    const total = await User.count({ where });

    res.json({
      users,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    req.logger.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * API: Get Groups List
 */
router.get('/api/groups', requireAuth, requireAdmin, async (req, res) => {
  try {
    const groups = await Group.findAll({
      order: [['name', 'ASC']],
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'username'],
          through: { attributes: [] }
        }
      ]
    });

    res.json(groups);
  } catch (error) {
    req.logger.error('Failed to fetch groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

/**
 * API: Get Roles List
 */
router.get('/api/roles', requireAuth, requireAdmin, async (req, res) => {
  try {
    const roles = await Role.findAll({
      order: [['name', 'ASC']]
    });

    res.json(roles);
  } catch (error) {
    req.logger.error('Failed to fetch roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Certificate Operations
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * API: Issue Certificate
 */
router.post('/api/certificates/issue',
  requireAuth,
  requireAdmin,
  validate(generateCertificateSchema),
  async (req, res) => {
  try {
    const certificateService = require('../services/certificate');
    const { type, commonName, organization, country, state, locality, email, keySize, validityDays } = req.body;

    // Validate required fields
    if (!type || !commonName) {
      return res.status(400).json({ error: 'Type and common name are required' });
    }

    let certificate;
    if (type === 'root') {
      certificate = await certificateService.createRootCertificate({
        commonName,
        organization,
        country,
        state,
        locality,
        email
      }, req.session.user.id);
    } else {
      certificate = await certificateService.createCertificate({
        type,
        commonName,
        organization,
        country,
        state,
        locality,
        email,
        keySize,
        validityDays
      }, req.session.user.id);
    }

    req.logger.info('Certificate issued', { certificateId: certificate.id });
    res.json({ success: true, certificate });
  } catch (error) {
    req.logger.error('Failed to issue certificate:', error);
    res.status(500).json({ error: error.message || 'Failed to issue certificate' });
  }
});

/**
 * API: Revoke Certificate
 */
router.post('/api/certificates/:id/revoke', requireAuth, requireAdmin, async (req, res) => {
  try {
    const certificateService = require('../services/certificate');
    const { id } = req.params;
    const { reason } = req.body;

    await certificateService.revokeCertificate(id, reason, req.session.user.id);

    req.logger.info('Certificate revoked', { certificateId: id });
    res.json({ success: true });
  } catch (error) {
    req.logger.error('Failed to revoke certificate:', error);
    res.status(500).json({ error: error.message || 'Failed to revoke certificate' });
  }
});

/**
 * API: Download Certificate
 */
router.get('/api/certificates/:id/download', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const certificate = await Certificate.findByPk(id);

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${certificate.commonName}.pem"`);
    res.send(certificate.certificatePem);
  } catch (error) {
    req.logger.error('Failed to download certificate:', error);
    res.status(500).json({ error: 'Failed to download certificate' });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Operations
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * API: Generate Token
 */
router.post('/api/tokens/generate',
  requireAuth,
  requireAdmin,
  validate(generateTokenSchema),
  async (req, res) => {
  try {
    const tokenService = require('../services/token');
    const { certificateId, permissions, resourceType, resourceValue, expiryType, expiryValue } = req.body;

    // Validate required fields
    if (!certificateId || !resourceType || !resourceValue) {
      return res.status(400).json({ error: 'Certificate ID, resource type, and resource value are required' });
    }

    const token = await tokenService.generateToken({
      certificateId,
      permissions: permissions || { read: true },
      resourceType,
      resourceValue,
      expiryType: expiryType || 'time',
      expiryValue: expiryValue || 3600
    }, req.session.user.id);

    req.logger.info('Token generated', { tokenId: token.id });
    res.json({ success: true, token });
  } catch (error) {
    req.logger.error('Failed to generate token:', error);
    res.status(500).json({ error: error.message || 'Failed to generate token' });
  }
});

/**
 * API: Validate Token
 */
router.post('/api/tokens/validate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tokenService = require('../services/token');
    const { tokenId, resourceValue, requiredPermission } = req.body;

    if (!tokenId) {
      return res.status(400).json({ error: 'Token ID is required' });
    }

    const validation = await tokenService.validateToken(tokenId, {
      resourceValue,
      requiredPermission
    });

    res.json({ success: true, validation });
  } catch (error) {
    req.logger.error('Failed to validate token:', error);
    res.status(500).json({ error: error.message || 'Failed to validate token' });
  }
});

/**
 * API: Revoke Token
 */
router.post('/api/tokens/:id/revoke',
  requireAuth,
  requireAdmin,
  validate(revokeTokenSchema),
  async (req, res) => {
  try {
    const tokenService = require('../services/token');
    const { id } = req.params;

    await tokenService.revokeToken(id, req.session.user.id);

    req.logger.info('Token revoked', { tokenId: id });
    res.json({ success: true });
  } catch (error) {
    req.logger.error('Failed to revoke token:', error);
    res.status(500).json({ error: error.message || 'Failed to revoke token' });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * OCSP & CRL Operations
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * API: Get OCSP Status
 */
router.get('/api/ocsp/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = require('../config');
    const ocspService = require('../services/ocsp');

    const status = {
      enabled: config.ocsp.enabled,
      url: config.ocsp.url,
      port: config.ocsp.port,
      healthy: true
    };

    // Check if OCSP service is responding
    try {
      await fetch(`http://localhost:${config.ocsp.port}/status`);
    } catch (error) {
      status.healthy = false;
    }

    res.json(status);
  } catch (error) {
    req.logger.error('Failed to get OCSP status:', error);
    res.status(500).json({ error: 'Failed to get OCSP status' });
  }
});

/**
 * API: Get CRL Status
 */
router.get('/api/crl/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = require('../config');
    const RevocationList = require('../models').RevocationList;

    const latestCRL = await RevocationList.findOne({
      order: [['createdAt', 'DESC']]
    });

    const status = {
      enabled: config.crl.enabled,
      url: config.crl.url,
      latestGenerated: latestCRL ? latestCRL.createdAt : null,
      revokedCount: latestCRL ? latestCRL.revokedCertificates.length : 0
    };

    res.json(status);
  } catch (error) {
    req.logger.error('Failed to get CRL status:', error);
    res.status(500).json({ error: 'Failed to get CRL status' });
  }
});

/**
 * API: Generate CRL
 */
router.post('/api/crl/generate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const crlService = require('../services/crl');

    await crlService.generateCRL();

    req.logger.info('CRL generated');
    res.json({ success: true, message: 'CRL generated successfully' });
  } catch (error) {
    req.logger.error('Failed to generate CRL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate CRL' });
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Configuration Management
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * API: Get Configuration (SECURE - No secret exposure)
 */
router.get('/api/config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = require('../config');

    // Return ONLY safe configuration values
    // NEVER expose secrets, passwords, or private keys
    const safeConfig = {
      app: {
        env: config.app.env,
        port: config.app.port,
        host: config.app.host,
        url: config.app.url
      },
      ca: {
        name: config.ca.name,
        country: config.ca.country,
        state: config.ca.state,
        locality: config.ca.locality,
        organization: config.ca.organization,
        organizationalUnit: config.ca.organizationalUnit
      },
      ocsp: {
        enabled: config.ocsp.enabled,
        port: config.ocsp.port
      },
      crl: {
        enabled: config.crl.enabled,
        updateInterval: config.crl.updateInterval
      },
      storage: {
        type: config.storage.type
      },
      database: {
        host: config.database?.host || process.env.DB_HOST,
        port: config.database?.port || process.env.DB_PORT,
        name: config.database?.name || process.env.DB_NAME,
        // Password is MASKED
        hasPassword: !!process.env.DB_PASSWORD
      },
      redis: {
        enabled: !!process.env.REDIS_HOST,
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
        // Password is MASKED
      },
      tls: {
        enabled: process.env.TLS_ENABLED === 'true'
      }
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    req.logger.error('Failed to get configuration:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get configuration'
    });
  }
});

/**
 * API: Update Configuration (SECURE - Controlled key updates only)
 */
router.post('/api/config/update', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = require('../config');
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Updates object is required'
      });
    }

    // WHITELIST of allowed configuration keys
    // These are the ONLY keys that can be updated via API
    const allowedKeys = [
      'CA_NAME',
      'CA_COUNTRY',
      'CA_STATE',
      'CA_LOCALITY',
      'CA_ORGANIZATION',
      'CA_ORGANIZATIONAL_UNIT',
      'OCSP_ENABLED',
      'OCSP_PORT',
      'CRL_ENABLED',
      'CRL_UPDATE_INTERVAL',
      'TLS_ENABLED'
    ];

    // Validate that only allowed keys are being updated
    const requestedKeys = Object.keys(updates);
    const unauthorizedKeys = requestedKeys.filter(key => !allowedKeys.includes(key));

    if (unauthorizedKeys.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Cannot update keys: ${unauthorizedKeys.join(', ')}`,
        details: {
          allowedKeys,
          unauthorizedKeys
        }
      });
    }

    // Audit log the configuration change
    await AuditLog.log({
      userId: req.session.user.id,
      action: 'config.update',
      status: 'success',
      severity: 'warning',
      message: 'Configuration updated via API',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        updatedKeys: requestedKeys,
        updates: updates
      }
    });

    req.logger.warn('Configuration update requested', {
      userId: req.session.user.id,
      updates: requestedKeys
    });

    // NOTE: In production, these updates should be applied through
    // proper configuration management (e.g., environment variable updates,
    // configuration service, etc.) rather than direct file writes

    res.json({
      success: true,
      message: 'Configuration update request logged. Manual restart required to apply changes.',
      warning: 'Direct .env updates are disabled for security. Please update environment variables manually.'
    });
  } catch (error) {
    req.logger.error('Failed to update configuration:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message || 'Failed to update configuration'
    });
  }
});

/**
 * API: Get All Certificates (with filters)
 */
router.get('/api/certificates', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (type) where.certificateType = type;

    const certificates = await Certificate.findAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        }
      ]
    });

    const total = await Certificate.count({ where });

    res.json({
      certificates,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    req.logger.error('Failed to fetch certificates:', error);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

/**
 * API: Get All Tokens (with filters)
 */
router.get('/api/tokens', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, expiryType, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (expiryType) where.expiryType = expiryType;

    const tokens = await Token.findAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        },
        {
          model: Certificate,
          as: 'certificate',
          attributes: ['id', 'commonName', 'serialNumber']
        }
      ]
    });

    const total = await Token.count({ where });

    res.json({
      tokens,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    req.logger.error('Failed to fetch tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

module.exports = router;
