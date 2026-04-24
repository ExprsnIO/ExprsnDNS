const express = require('express');
const router = express.Router();
const tokenService = require('../services/token');

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const tokens = await tokenService.listTokens(req.session.user.id);
  res.render('tokens/index', { title: 'Tokens', user: req.session.user, tokens });
});

router.get('/new', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.render('tokens/new', { title: 'Generate Token', user: req.session.user });
});

module.exports = router;
