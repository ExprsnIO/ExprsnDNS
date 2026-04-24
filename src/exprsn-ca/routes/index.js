/**
 * ═══════════════════════════════════════════════════════════════════════
 * Main Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Certificate, Token, User } = require('../models');
const config = require('../config');

/**
 * Home page
 */
router.get('/', async (req, res) => {
  try {
    const stats = {
      totalCertificates: await Certificate.count(),
      activeCertificates: await Certificate.count({ where: { status: 'active' } }),
      totalTokens: await Token.count(),
      activeTokens: await Token.count({ where: { status: 'active' } }),
      totalUsers: await User.count()
    };

    res.render('index', {
      title: 'Exprsn Certificate Authority',
      user: req.session.user || null,
      stats,
      config: {
        ca: config.ca,
        ocsp: config.ocsp,
        crl: config.crl
      }
    });
  } catch (error) {
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load dashboard',
      error
    });
  }
});

/**
 * Dashboard
 */
router.get('/dashboard', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }

  try {
    const userId = req.session.user.id;

    const userCertificates = await Certificate.findAll({
      where: { userId },
      limit: 10,
      order: [['createdAt', 'DESC']]
    });

    const userTokens = await Token.findAll({
      where: { userId },
      limit: 10,
      order: [['createdAt', 'DESC']]
    });

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.user,
      certificates: userCertificates,
      tokens: userTokens
    });
  } catch (error) {
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load dashboard',
      error
    });
  }
});

/**
 * About page
 */
router.get('/about', (req, res) => {
  res.render('about', {
    title: 'About Exprsn CA',
    user: req.session.user || null,
    config: {
      ca: config.ca,
      version: require('../../../package.json').version
    }
  });
});

module.exports = router;
