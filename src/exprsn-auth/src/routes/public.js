/**
 * ═══════════════════════════════════════════════════════════
 * Public Authentication Routes
 * User-facing login, register, and password reset pages
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const passport = require('passport');
const crypto = require('crypto');
const { asyncHandler, AppError, logger, validateRequired } = require('@exprsn/shared');
const { strictLimiter } = require('@exprsn/shared');
const { User } = require('../models');
const tokenService = require('../services/tokenService');
const { getEmailService } = require('../services/emailService');
const config = require('../config');
const axios = require('axios');

const router = express.Router();

/**
 * Helper: Check if user is authenticated
 */
function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

/**
 * Helper: Redirect if already authenticated
 */
function redirectIfAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Helper: Get available services from setup service
 */
async function getAvailableServices() {
  try {
    const setupUrl = process.env.SETUP_SERVICE_URL || 'http://localhost:3015';
    const response = await axios.get(`${setupUrl}/api/services`, {
      timeout: 3000
    });

    const services = response.data.services || [];

    // Map services to dashboard format
    return services.map(service => ({
      name: service.name,
      description: service.description || getServiceDescription(service.name),
      url: getServiceUrl(service),
      port: service.port,
      icon: getServiceIcon(service.name),
      available: service.status === 'healthy'
    }));
  } catch (error) {
    logger.warn('Could not fetch services from setup service', { error: error.message });

    // Fallback to default services
    return getDefaultServices();
  }
}

/**
 * Helper: Get service description
 */
function getServiceDescription(name) {
  const descriptions = {
    'exprsn-ca': 'Certificate Authority and Token Management',
    'exprsn-auth': 'Authentication and Authorization',
    'exprsn-spark': 'Real-time Messaging and Chat',
    'exprsn-timeline': 'Social Feed and Posts',
    'exprsn-nexus': 'Groups, Communities & Events',
    'exprsn-filevault': 'File Storage and Management',
    'exprsn-gallery': 'Photo Galleries and Media',
    'exprsn-live': 'Live Streaming and Video',
    'exprsn-moderator': 'Content Moderation',
    'exprsn-pulse': 'Analytics and Metrics',
    'exprsn-vault': 'Secrets Management',
    'exprsn-herald': 'Notifications and Alerts',
    'exprsn-setup': 'System Setup and Management',
    'exprsn-workflow': 'Workflow Automation',
    'exprsn-svr': 'Dynamic Page Server',
    'exprsn-forge': 'Business Management (CRM/ERP)',
    'exprsn-bridge': 'API Gateway',
    'exprsn-prefetch': 'Timeline Prefetching'
  };

  return descriptions[name] || 'Exprsn Service';
}

/**
 * Helper: Get service icon
 */
function getServiceIcon(name) {
  const icons = {
    'exprsn-ca': 'bi-shield-check',
    'exprsn-auth': 'bi-key',
    'exprsn-spark': 'bi-chat-dots',
    'exprsn-timeline': 'bi-newspaper',
    'exprsn-nexus': 'bi-people',
    'exprsn-filevault': 'bi-folder',
    'exprsn-gallery': 'bi-images',
    'exprsn-live': 'bi-camera-video',
    'exprsn-moderator': 'bi-shield-exclamation',
    'exprsn-pulse': 'bi-graph-up',
    'exprsn-vault': 'bi-lock',
    'exprsn-herald': 'bi-bell',
    'exprsn-setup': 'bi-gear',
    'exprsn-workflow': 'bi-diagram-3',
    'exprsn-svr': 'bi-file-earmark-code',
    'exprsn-forge': 'bi-briefcase',
    'exprsn-bridge': 'bi-signpost',
    'exprsn-prefetch': 'bi-arrow-repeat'
  };

  return icons[name] || 'bi-app';
}

/**
 * Helper: Get service URL
 */
function getServiceUrl(service) {
  const baseUrl = process.env.SERVICES_BASE_URL || 'http://localhost';
  return `${baseUrl}:${service.port}`;
}

/**
 * Helper: Get default services (fallback)
 */
function getDefaultServices() {
  return [
    {
      name: 'Timeline',
      description: 'Social feed and posts',
      url: 'http://localhost:3004',
      port: 3004,
      icon: 'bi-newspaper',
      available: true
    },
    {
      name: 'Spark',
      description: 'Real-time messaging',
      url: 'http://localhost:3002',
      port: 3002,
      icon: 'bi-chat-dots',
      available: true
    },
    {
      name: 'Nexus',
      description: 'Groups & Events',
      url: 'http://localhost:3011',
      port: 3011,
      icon: 'bi-people',
      available: true
    },
    {
      name: 'Gallery',
      description: 'Photo galleries',
      url: 'http://localhost:3008',
      port: 3008,
      icon: 'bi-images',
      available: true
    },
    {
      name: 'FileVault',
      description: 'File storage',
      url: 'http://localhost:3007',
      port: 3007,
      icon: 'bi-folder',
      available: true
    },
    {
      name: 'Workflow',
      description: 'Workflow automation',
      url: 'http://localhost:3017',
      port: 3017,
      icon: 'bi-diagram-3',
      available: true
    },
    {
      name: 'Admin Panel',
      description: 'System administration',
      url: '/admin',
      icon: 'bi-gear',
      available: true
    }
  ];
}

/**
 * ═══════════════════════════════════════════════════════════
 * Public Routes
 * ═══════════════════════════════════════════════════════════
 */

/**
 * GET / - Redirect to login or dashboard
 */
router.get('/', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

/**
 * GET /login - Show login page
 */
router.get('/login', redirectIfAuth, (req, res) => {
  const error = req.query.error || req.flash('error')[0];
  const message = req.query.message || req.flash('success')[0];

  res.render('login', {
    layout: false,
    error,
    message,
    googleEnabled: !!config.providers.google.clientId,
    githubEnabled: !!config.providers.github.clientId,
    redirect: req.query.redirect || '/dashboard'
  });
});

/**
 * POST /login - Handle login form submission
 */
router.post('/login', strictLimiter, (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.error('Login error', { error: err.message });
      return res.redirect('/login?error=' + encodeURIComponent('An error occurred during login'));
    }

    if (!user) {
      return res.redirect('/login?error=' + encodeURIComponent(info.message || 'Invalid credentials'));
    }

    req.login(user, async (err) => {
      if (err) {
        logger.error('Session creation error', { error: err.message });
        return res.redirect('/login?error=' + encodeURIComponent('Failed to create session'));
      }

      logger.info('User logged in via form', { userId: user.id, email: user.email });

      // Handle redirect
      const redirect = req.body.redirect || req.query.redirect || '/dashboard';
      res.redirect(redirect);
    });
  })(req, res, next);
});

/**
 * GET /register - Show registration page
 */
router.get('/register', redirectIfAuth, (req, res) => {
  const error = req.query.error || req.flash('error')[0];

  res.render('register', {
    layout: false,
    error,
    googleEnabled: !!config.providers.google.clientId,
    githubEnabled: !!config.providers.github.clientId
  });
});

/**
 * POST /register - Handle registration form submission
 */
router.post('/register', strictLimiter, asyncHandler(async (req, res) => {
  const { email, password, confirmPassword, displayName } = req.body;

  // Validate passwords match
  if (password !== confirmPassword) {
    return res.redirect('/register?error=' + encodeURIComponent('Passwords do not match'));
  }

  // Check password length
  if (password.length < config.security.passwordMinLength) {
    return res.redirect('/register?error=' + encodeURIComponent(
      `Password must be at least ${config.security.passwordMinLength} characters`
    ));
  }

  // Check if user exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.redirect('/register?error=' + encodeURIComponent('Email already registered'));
  }

  // Create user
  const user = await User.create({
    email,
    passwordHash: password,
    displayName,
    emailVerificationToken: crypto.randomBytes(32).toString('hex')
  });

  logger.info('User registered via form', { userId: user.id, email: user.email });

  // Send verification email
  try {
    const emailService = await getEmailService();
    await emailService.sendVerificationEmail(user, user.emailVerificationToken);
  } catch (error) {
    logger.error('Failed to send verification email', { userId: user.id, error: error.message });
  }

  // Send welcome email
  try {
    const emailService = await getEmailService();
    await emailService.sendWelcomeEmail(user);
  } catch (error) {
    logger.error('Failed to send welcome email', { userId: user.id, error: error.message });
  }

  // Auto-login after registration
  req.login(user, (err) => {
    if (err) {
      logger.error('Auto-login error after registration', { error: err.message });
      return res.redirect('/login?message=' + encodeURIComponent(
        'Registration successful! Please check your email to verify your account.'
      ));
    }

    res.redirect('/dashboard');
  });
}));

/**
 * GET /dashboard - Service selection dashboard
 */
router.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const services = await getAvailableServices();

  res.render('dashboard', {
    layout: false,
    user: req.user,
    services
  });
}));

/**
 * POST /logout - Handle logout
 */
router.post('/logout', (req, res) => {
  const userId = req.user?.id;

  req.logout((err) => {
    if (err) {
      logger.error('Logout error', { error: err.message, userId });
    } else {
      logger.info('User logged out', { userId });
    }

    res.redirect('/login?message=' + encodeURIComponent('You have been logged out successfully'));
  });
});

/**
 * GET /forgot-password - Show password reset request page
 */
router.get('/forgot-password', redirectIfAuth, (req, res) => {
  const error = req.query.error;
  const message = req.query.message;

  res.render('forgot-password', { layout: false, error, message });
});

/**
 * POST /forgot-password - Handle password reset request
 */
router.post('/forgot-password', strictLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ where: { email } });

  // Don't reveal if user exists
  if (!user) {
    return res.redirect('/forgot-password?message=' + encodeURIComponent(
      'If the email exists, a password reset link has been sent'
    ));
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  logger.info('Password reset requested via form', { userId: user.id, email: user.email });

  // Send password reset email
  try {
    const emailService = await getEmailService();
    await emailService.sendPasswordResetEmail(user, resetToken);
  } catch (error) {
    logger.error('Failed to send password reset email', { userId: user.id, error: error.message });
  }

  res.redirect('/forgot-password?message=' + encodeURIComponent(
    'If the email exists, a password reset link has been sent'
  ));
}));

/**
 * GET /reset-password - Show password reset page
 */
router.get('/reset-password', (req, res) => {
  const token = req.query.token;
  const error = req.query.error;
  const message = req.query.message;

  if (!token) {
    return res.redirect('/forgot-password?error=' + encodeURIComponent('Invalid reset link'));
  }

  res.render('reset-password', { layout: false, token, error, message });
});

/**
 * POST /reset-password - Handle password reset
 */
router.post('/reset-password', strictLimiter, asyncHandler(async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  // Validate passwords match
  if (password !== confirmPassword) {
    return res.redirect('/reset-password?token=' + token + '&error=' +
      encodeURIComponent('Passwords do not match'));
  }

  // Check password length
  if (password.length < config.security.passwordMinLength) {
    return res.redirect('/reset-password?token=' + token + '&error=' + encodeURIComponent(
      `Password must be at least ${config.security.passwordMinLength} characters`
    ));
  }

  // Find user with valid reset token
  const user = await User.findOne({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { [require('sequelize').Op.gt]: Date.now() }
    }
  });

  if (!user) {
    return res.redirect('/forgot-password?error=' + encodeURIComponent(
      'Invalid or expired reset token'
    ));
  }

  // Update password
  user.passwordHash = password;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  logger.info('Password reset completed via form', { userId: user.id, email: user.email });

  res.redirect('/login?message=' + encodeURIComponent(
    'Password reset successful! You can now sign in with your new password.'
  ));
}));

module.exports = router;
