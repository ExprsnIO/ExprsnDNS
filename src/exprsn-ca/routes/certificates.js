const express = require('express');
const router = express.Router();
const certificateService = require('../services/certificate');
const { asyncHandler } = require('../../shared');

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
 * GET /certificates
 * List user's certificates
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const certificates = await certificateService.listCertificates({
    userId: req.session.user.id
  });

  res.render('certificates/index', {
    title: 'Certificates',
    user: req.session.user,
    certificates
  });
}));

/**
 * GET /certificates/new
 * New certificate form
 */
router.get('/new', requireAuth, (req, res) => {
  res.render('certificates/new', {
    title: 'New Certificate',
    user: req.session.user
  });
});

/**
 * GET /certificates/:id
 * View certificate details (with ownership check)
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const certificate = await certificateService.getCertificate(req.params.id);

  if (!certificate) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Certificate not found',
      user: req.session.user
    });
  }

  // Authorization check: user must own the certificate or be an admin
  const { Role } = require('../models');
  const userWithRoles = await req.session.user.constructor.findByPk(req.session.user.id, {
    include: [{ model: Role, as: 'roles' }]
  });

  const isAdmin = userWithRoles && userWithRoles.roles &&
    userWithRoles.roles.some(role => ['admin', 'super-admin', 'ca-admin'].includes(role.slug));

  if (certificate.userId !== req.session.user.id && !isAdmin) {
    return res.status(403).render('error', {
      title: 'Forbidden',
      message: 'You do not have permission to view this certificate',
      user: req.session.user
    });
  }

  res.render('certificates/view', {
    title: 'Certificate Details',
    user: req.session.user,
    certificate
  });
}));

module.exports = router;
