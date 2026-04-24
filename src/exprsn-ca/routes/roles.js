const express = require('express');
const router = express.Router();
const { Role } = require('../models');

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const roles = await Role.findAll({ limit: 50 });
  res.render('roles/index', { title: 'Roles', user: req.session.user, roles });
});

module.exports = router;
