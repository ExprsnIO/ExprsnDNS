/**
 * ═══════════════════════════════════════════════════════════════════════
 * CA Administration Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const certificateService = require('../services/certificate');

router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('ca/index', { title: 'CA Administration', user: req.session.user });
});

router.get('/initialize', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('ca/initialize', { title: 'Initialize CA', user: req.session.user });
});

router.post('/initialize', async (req, res) => {
  try {
    const rootCert = await certificateService.createRootCertificate(req.body, req.session.user.id);
    res.redirect('/ca?success=initialized');
  } catch (error) {
    res.status(500).render('error', { title: 'Error', message: 'Failed to initialize CA', error });
  }
});

router.get('/certificates/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('ca/certificate-dashboard', {
    title: 'Certificate Dashboard',
    user: req.session.user
  });
});

router.get('/tokens/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('ca/token-dashboard', {
    title: 'Token Dashboard',
    user: req.session.user
  });
});

module.exports = router;
