/**
 * Authentication Routes
 * User login, registration, password reset, etc.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getServiceClient } = require('../../shared/utils/serviceClient');
const { getModels } = require('../models');

const serviceClient = getServiceClient();

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, remember = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'MISSING_CREDENTIALS',
        message: 'Email and password are required'
      });
    }

    const { LoginAttempt, Session } = getModels();

    // Get user from CA service
    let user;
    try {
      user = await serviceClient.getUser(email);
    } catch (error) {
      // Log failed attempt
      await LoginAttempt.create({
        email,
        success: false,
        failureReason: 'USER_NOT_FOUND',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      await LoginAttempt.create({
        email,
        userId: user.id,
        success: false,
        failureReason: 'INVALID_PASSWORD',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    // Check if account is locked
    const recentAttempts = await LoginAttempt.count({
      where: {
        email,
        success: false,
        attemptedAt: {
          $gte: new Date(Date.now() - 15 * 60 * 1000) // Last 15 minutes
        }
      }
    });

    if (recentAttempts >= 5) {
      return res.status(423).json({
        error: 'ACCOUNT_LOCKED',
        message: 'Account temporarily locked due to multiple failed login attempts',
        retryAfter: 900 // 15 minutes in seconds
      });
    }

    // Generate CA token for the user
    const caToken = await serviceClient.request('ca', 'POST', '/api/tokens/generate', {
      userId: user.id,
      permissions: { read: true, write: true, update: true },
      resourceType: 'url',
      resourceValue: '*',
      expiryType: 'time',
      expirySeconds: remember ? 2592000 : 86400 // 30 days or 1 day
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));

    const session = await Session.create({
      userId: user.id,
      token: sessionToken,
      caTokenId: caToken.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      expiresAt
    });

    // Log successful attempt
    await LoginAttempt.create({
      email,
      userId: user.id,
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      sessionId: session.id,
      token: caToken.id,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'LOGIN_FAILED',
      message: 'Login failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user and revoke session
 */
router.post('/logout', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'MISSING_SESSION_ID',
        message: 'Session ID is required'
      });
    }

    const { Session } = getModels();

    const session = await Session.findByPk(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: 'Session not found'
      });
    }

    // Revoke session
    await session.update({
      revokedAt: new Date(),
      revokedReason: 'USER_LOGOUT'
    });

    // Revoke CA token
    if (session.caTokenId) {
      try {
        await serviceClient.request('ca', 'POST', `/api/tokens/${session.caTokenId}/revoke`, {
          reason: 'USER_LOGOUT'
        });
      } catch (error) {
        console.error('Failed to revoke CA token:', error);
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'LOGOUT_FAILED',
      message: 'Logout failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/register
 * Register new user account
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Email, password, and name are required'
      });
    }

    // Validate password strength
    if (password.length < 12) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 12 characters long'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user via CA service
    const user = await serviceClient.request('ca', 'POST', '/api/users', {
      email,
      passwordHash,
      name,
      emailVerified: false
    });

    res.status(201).json({
      success: true,
      userId: user.id,
      email: user.email,
      name: user.name,
      message: 'Registration successful. Please check your email to verify your account.'
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (error.message.includes('unique')) {
      return res.status(409).json({
        error: 'EMAIL_EXISTS',
        message: 'An account with this email already exists'
      });
    }

    res.status(500).json({
      error: 'REGISTRATION_FAILED',
      message: 'Registration failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'MISSING_EMAIL',
        message: 'Email is required'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Store reset token in CA
    await serviceClient.request('ca', 'POST', '/api/users/password-reset', {
      email,
      resetTokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });

    // In production, send email with reset link
    // For now, return the token (dev only)
    res.json({
      success: true,
      message: 'Password reset email sent',
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'RESET_FAILED',
      message: 'Password reset request failed'
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Reset token and new password are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 12) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 12 characters long'
      });
    }

    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Reset password via CA
    await serviceClient.request('ca', 'POST', '/api/users/reset-password', {
      resetTokenHash,
      passwordHash
    });

    res.json({
      success: true,
      message: 'Password reset successful'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'RESET_FAILED',
      message: 'Password reset failed',
      details: error.message
    });
  }
});

/**
 * POST /api/auth/verify-email
 * Verify email address
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { verificationToken } = req.body;

    if (!verificationToken) {
      return res.status(400).json({
        error: 'MISSING_TOKEN',
        message: 'Verification token is required'
      });
    }

    await serviceClient.request('ca', 'POST', '/api/users/verify-email', {
      verificationToken
    });

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'VERIFICATION_FAILED',
      message: 'Email verification failed'
    });
  }
});

module.exports = router;
