/**
 * ═══════════════════════════════════════════════════════════
 * Admin Routes
 * Administrative interface for managing authentication system
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { User, Organization, Application, Role, Session } = require('../models');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * Admin Dashboard
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [
      userCount,
      orgCount,
      appCount,
      activeSessionCount
    ] = await Promise.all([
      User.count(),
      Organization.count(),
      Application.count(),
      Session.count({ where: { active: true } })
    ]);

    const recentUsers = await User.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'username', 'email', 'createdAt', 'emailVerified']
    });

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        users: userCount,
        organizations: orgCount,
        applications: appCount,
        activeSessions: activeSessionCount
      },
      recentUsers,
      user: req.user
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load dashboard' });
  }
});

/**
 * User Management
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const { rows: users, count } = await User.findAndCountAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'username', 'email', 'emailVerified', 'enabled', 'createdAt', 'lastLogin']
    });

    const totalPages = Math.ceil(count / limit);

    res.render('admin/users', {
      title: 'User Management',
      users,
      pagination: {
        page,
        totalPages,
        total: count
      },
      user: req.user
    });
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load users' });
  }
});

router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Organization, as: 'organizations' },
        { model: Role, as: 'roles' }
      ]
    });

    if (!user) {
      return res.status(404).render('error', { title: 'Error', error: 'User not found' });
    }

    const sessions = await Session.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    res.render('admin/user-detail', {
      title: `User: ${user.username}`,
      targetUser: user,
      sessions,
      user: req.user
    });
  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load user details' });
  }
});

/**
 * Organization Management
 */
router.get('/organizations', requireAdmin, async (req, res) => {
  try {
    const organizations = await Organization.findAll({
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'members',
        through: { attributes: [] },
        attributes: ['id', 'username']
      }]
    });

    res.render('admin/organizations', {
      title: 'Organization Management',
      organizations,
      user: req.user
    });
  } catch (error) {
    console.error('Organizations list error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load organizations' });
  }
});

router.get('/organizations/:id', requireAdmin, async (req, res) => {
  try {
    const organization = await Organization.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'members',
        through: { attributes: ['role'] },
        attributes: ['id', 'username', 'email']
      }]
    });

    if (!organization) {
      return res.status(404).render('error', { title: 'Error', error: 'Organization not found' });
    }

    res.render('admin/organization-detail', {
      title: `Organization: ${organization.name}`,
      organization,
      user: req.user
    });
  } catch (error) {
    console.error('Organization detail error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load organization details' });
  }
});

/**
 * Application Management
 */
router.get('/applications', requireAdmin, async (req, res) => {
  try {
    const applications = await Application.findAll({
      order: [['createdAt', 'DESC']],
      include: [{
        model: Organization,
        as: 'organization',
        attributes: ['id', 'name']
      }]
    });

    res.render('admin/applications', {
      title: 'Application Management',
      applications,
      user: req.user
    });
  } catch (error) {
    console.error('Applications list error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load applications' });
  }
});

router.get('/applications/:id', requireAdmin, async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.id, {
      include: [{
        model: Organization,
        as: 'organization',
        attributes: ['id', 'name']
      }]
    });

    if (!application) {
      return res.status(404).render('error', { title: 'Error', error: 'Application not found' });
    }

    res.render('admin/application-detail', {
      title: `Application: ${application.name}`,
      application,
      user: req.user
    });
  } catch (error) {
    console.error('Application detail error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load application details' });
  }
});

/**
 * Role Management
 */
router.get('/roles', requireAdmin, async (req, res) => {
  try {
    const roles = await Role.findAll({
      order: [['name', 'ASC']],
      include: [{
        model: User,
        as: 'users',
        through: { attributes: [] },
        attributes: ['id', 'username']
      }]
    });

    res.render('admin/roles', {
      title: 'Role Management',
      roles,
      user: req.user
    });
  } catch (error) {
    console.error('Roles list error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load roles' });
  }
});

/**
 * Active Sessions
 */
router.get('/sessions', requireAdmin, async (req, res) => {
  try {
    const sessions = await Session.findAll({
      where: { active: true },
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'email']
      }]
    });

    res.render('admin/sessions', {
      title: 'Active Sessions',
      sessions,
      user: req.user
    });
  } catch (error) {
    console.error('Sessions list error:', error);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load sessions' });
  }
});

/**
 * Settings
 */
router.get('/settings', requireAdmin, async (req, res) => {
  res.render('admin/settings', {
    title: 'System Settings',
    settings: {
      sessionLifetime: process.env.SESSION_LIFETIME || 3600000,
      mfaRequired: process.env.MFA_REQUIRED === 'true',
      emailVerificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED === 'true',
      oauth2Enabled: process.env.OAUTH2_ENABLED !== 'false',
      samlEnabled: process.env.SAML_ENABLED === 'true',
      oidcEnabled: process.env.OIDC_ENABLED !== 'false'
    },
    user: req.user
  });
});

module.exports = router;
