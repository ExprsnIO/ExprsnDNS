/**
 * ═══════════════════════════════════════════════════════════════════════
 * Authentication Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { User, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { loginSchema, registerSchema, validate } = require('../validators');
const { strictLimiter, standardLimiter } = require('../../shared');

/**
 * Login page
 */
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', {
    title: 'Login',
    error: null
  });
});

/**
 * Login handler
 */
router.post('/login',
  strictLimiter, // 10 requests per 15 minutes
  validate(loginSchema),
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Account is locked. Please try again later.'
      });
    }

    // Verify password
    const isValid = await user.validatePassword(password);

    if (!isValid) {
      await user.incrementFailedAttempts();

      await AuditLog.log({
        userId: user.id,
        action: 'auth.login.failed',
        status: 'failure',
        severity: 'warning',
        message: 'Failed login attempt',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password'
      });
    }

    // Reset failed attempts
    await user.resetFailedAttempts();

    // Update last login
    user.lastLoginAt = new Date();
    user.lastLoginIp = req.ip;
    await user.save();

    // Create session
    req.session.user = user.toSafeObject();

    await AuditLog.log({
      userId: user.id,
      action: 'auth.login.success',
      status: 'success',
      severity: 'info',
      message: 'User logged in successfully',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    logger.info('User logged in', { userId: user.id, email: user.email });

    res.redirect('/dashboard');
  } catch (error) {
    logger.error('Login error:', error);
    res.render('auth/login', {
      title: 'Login',
      error: 'An error occurred. Please try again.'
    });
  }
});

/**
 * Logout
 */
router.get('/logout', (req, res) => {
  const userId = req.session.user?.id;

  req.session.destroy(() => {
    if (userId) {
      AuditLog.log({
        userId,
        action: 'auth.logout',
        status: 'success',
        severity: 'info',
        message: 'User logged out'
      });
    }

    res.redirect('/');
  });
});

/**
 * Register page
 */
router.get('/register', (req, res) => {
  res.render('auth/register', {
    title: 'Register',
    error: null
  });
});

/**
 * Register handler
 */
router.post('/register',
  standardLimiter, // 100 requests per 15 minutes
  validate(registerSchema),
  async (req, res) => {
    try {
      const { email, username, password, firstName, lastName } = req.body;

    // Check if user exists
    const existing = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [{ email }, { username }]
      }
    });

    if (existing) {
      return res.render('auth/register', {
        title: 'Register',
        error: 'Email or username already exists'
      });
    }

    // Hash password
    const passwordHash = await User.hashPassword(password);

    // Create user
    const user = await User.create({
      email,
      username,
      passwordHash,
      firstName,
      lastName,
      status: 'active'
    });

    await AuditLog.log({
      userId: user.id,
      action: 'auth.register',
      status: 'success',
      severity: 'info',
      message: 'New user registered',
      ipAddress: req.ip,
      details: { email, username }
    });

    logger.info('New user registered', { userId: user.id, email: user.email });

    // Auto-login
    req.session.user = user.toSafeObject();

    res.redirect('/dashboard');
  } catch (error) {
    logger.error('Registration error:', error);
    res.render('auth/register', {
      title: 'Register',
      error: 'An error occurred. Please try again.'
    });
  }
});

module.exports = router;
