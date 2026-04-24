const express = require('express');
const router = express.Router();
const { User } = require('../models');

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const users = await User.findAll({ limit: 50 });
  res.render('users/index', { title: 'Users', user: req.session.user, users });
});

module.exports = router;
