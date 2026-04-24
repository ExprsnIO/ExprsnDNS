const express = require('express');
const router = express.Router();
const { Group } = require('../models');

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const groups = await Group.findAll({ limit: 50 });
  res.render('groups/index', { title: 'Groups', user: req.session.user, groups });
});

module.exports = router;
