/**
 * ═══════════════════════════════════════════════════════════
 * Organization Routes
 * Organization management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const organizationService = require('../services/organizationService');
const rbacService = require('../services/rbacService');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * POST /api/organizations
 * Create new organization
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const org = await organizationService.createOrganization(req.body, req.user.id);

    res.status(201).json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations
 * Get user's organizations
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const orgs = await organizationService.getUserOrganizations(req.user.id);

    res.json({
      success: true,
      organizations: orgs
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations/:id
 * Get organization by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    // Check if user is a member
    const isMember = await organizationService.isMember(req.params.id, req.user.id);

    if (!isMember) {
      const hasPermission = await rbacService.checkPermission(req.user.id, 'org:read');
      if (!hasPermission.allowed) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization'
        });
      }
    }

    const org = await organizationService.getOrganizationById(req.params.id, {
      includeMembers: req.query.include_members === 'true',
      includeGroups: req.query.include_groups === 'true',
      includeApplications: req.query.include_applications === 'true'
    });

    res.json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/organizations/:id
 * Update organization
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    // Check if user is owner or admin
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization owners and admins can update settings'
      });
    }

    const org = await organizationService.updateOrganization(req.params.id, req.body);

    res.json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/organizations/:id
 * Delete organization
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const org = await organizationService.getOrganizationById(req.params.id);

    // Only owner can delete
    if (org.ownerId !== req.user.id) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only organization owner can delete the organization'
      });
    }

    await organizationService.deleteOrganization(req.params.id);

    res.json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations/:id/members
 * Get organization members
 */
router.get('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const isMember = await organizationService.isMember(req.params.id, req.user.id);

    if (!isMember) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You must be a member to view members'
      });
    }

    const members = await organizationService.getMembers(req.params.id, {
      status: req.query.status,
      role: req.query.role
    });

    res.json({
      success: true,
      members
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/organizations/:id/members
 * Add member to organization
 */
router.post('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only owners and admins can add members'
      });
    }

    const { userId, role } = req.body;

    const member = await organizationService.addMember(req.params.id, userId, {
      role,
      invitedBy: req.user.id
    });

    res.status(201).json({
      success: true,
      member
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/organizations/:id/members/:userId
 * Remove member from organization
 */
router.delete('/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin && req.params.userId !== req.user.id) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only owners and admins can remove members'
      });
    }

    await organizationService.removeMember(req.params.id, req.params.userId);

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/organizations/:id/members/:userId
 * Update member role
 */
router.patch('/:id/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const isOwnerOrAdmin = await organizationService.isOwnerOrAdmin(req.params.id, req.user.id);

    if (!isOwnerOrAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only owners and admins can update member roles'
      });
    }

    const { role } = req.body;

    const member = await organizationService.updateMemberRole(req.params.id, req.params.userId, role);

    res.json({
      success: true,
      member
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/organizations/:id/transfer-ownership
 * Transfer organization ownership
 */
router.post('/:id/transfer-ownership', requireAuth, async (req, res, next) => {
  try {
    const { newOwnerId } = req.body;

    const org = await organizationService.transferOwnership(
      req.params.id,
      req.user.id,
      newOwnerId
    );

    res.json({
      success: true,
      organization: org
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
