/**
 * ═══════════════════════════════════════════════════════════
 * Application Routes
 * OAuth2/OIDC application management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Application, Organization } = require('../models');
const rbacService = require('../services/rbacService');
const organizationService = require('../services/organizationService');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * POST /api/applications
 * Create new application (OAuth2/OIDC client)
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { organizationId } = req.body;

    // Check if user can create applications in this organization
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(organizationId, req.user.id);

    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization owners and admins can create applications'
      });
    }

    const app = await Application.create({
      ...req.body,
      ownerId: req.user.id
    });

    res.status(201).json({
      success: true,
      application: app
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/applications
 * Get applications (filtered by organization or user)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { organizationId } = req.query;

    const where = {};

    if (organizationId) {
      // Check if user is member of organization
      const isMember = await organizationService.isMember(organizationId, req.user.id);
      if (!isMember) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization'
        });
      }

      where.organizationId = organizationId;
    } else {
      // Get user's organizations
      const orgs = await organizationService.getUserOrganizations(req.user.id);
      where.organizationId = orgs.map(o => o.id);
    }

    const apps = await Application.findAll({
      where,
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'slug']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      applications: apps
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/applications/:id
 * Get application by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const app = await Application.findByPk(req.params.id, {
      include: [
        {
          model: Organization,
          as: 'organization'
        }
      ]
    });

    if (!app) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Application not found'
      });
    }

    // Check access
    const isMember = await organizationService.isMember(app.organizationId, req.user.id);
    if (!isMember) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You do not have access to this application'
      });
    }

    res.json({
      success: true,
      application: app
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/applications/:id
 * Update application
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const app = await Application.findByPk(req.params.id);

    if (!app) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Application not found'
      });
    }

    // Check permissions
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(app.organizationId, req.user.id);

    if (!isOwnerOrAdmin && app.ownerId !== req.user.id) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only application owners and organization admins can update applications'
      });
    }

    // Prevent changing certain fields
    delete req.body.clientId;
    delete req.body.clientSecret;
    delete req.body.organizationId;

    await app.update(req.body);

    res.json({
      success: true,
      application: app
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/applications/:id
 * Delete application
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const app = await Application.findByPk(req.params.id);

    if (!app) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Application not found'
      });
    }

    // Check permissions
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(app.organizationId, req.user.id);

    if (!isOwnerOrAdmin && app.ownerId !== req.user.id) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only application owners and organization admins can delete applications'
      });
    }

    await app.destroy();

    res.json({
      success: true,
      message: 'Application deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/applications/:id/regenerate-secret
 * Regenerate client secret
 */
router.post('/:id/regenerate-secret', requireAuth, async (req, res, next) => {
  try {
    const app = await Application.findByPk(req.params.id);

    if (!app) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Application not found'
      });
    }

    // Only owner can regenerate secret
    if (app.ownerId !== req.user.id) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only application owner can regenerate secret'
      });
    }

    const crypto = require('crypto');
    app.clientSecret = crypto.randomBytes(32).toString('hex');
    await app.save();

    res.json({
      success: true,
      clientSecret: app.clientSecret,
      message: 'Client secret regenerated. Please update your application configuration.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/applications/:id/check-access
 * Check if user can access application
 */
router.get('/:id/check-access', requireAuth, async (req, res, next) => {
  try {
    const { userId = req.user.id } = req.query;

    const result = await rbacService.checkApplicationAccess(userId, req.params.id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
