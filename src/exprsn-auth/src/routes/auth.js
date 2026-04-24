/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Routes
 * User registration, login, logout, password reset
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { asyncHandler, AppError, logger, validateRequired } = require('@exprsn/shared');
const { strictLimiter } = require('@exprsn/shared');
const { User } = require('../models');
const tokenService = require('../services/tokenService');
const { getEmailService } = require('../services/emailService');
const config = require('../config');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  validate
} = require('../validators');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register',
  strictLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body;

  // Validate required fields
  validateRequired({ email, password }, ['email', 'password']);

  // Check password complexity
  if (password.length < config.security.passwordMinLength) {
    throw new AppError(
      `Password must be at least ${config.security.passwordMinLength} characters`,
      400,
      'WEAK_PASSWORD'
    );
  }

  // Check if user exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new AppError('Email already registered', 409, 'USER_EXISTS');
  }

  // Create user
  const user = await User.create({
    email,
    passwordHash: password, // Will be hashed by beforeCreate hook
    displayName,
    emailVerificationToken: crypto.randomBytes(32).toString('hex')
  });

  logger.info('User registered', { userId: user.id, email: user.email });

  // Send verification email
  try {
    const emailService = await getEmailService();
    await emailService.sendVerificationEmail(user, user.emailVerificationToken);
  } catch (error) {
    logger.error('Failed to send verification email', {
      userId: user.id,
      error: error.message
    });
    // Don't fail registration if email fails
  }

  // Send welcome email
  try {
    const emailService = await getEmailService();
    await emailService.sendWelcomeEmail(user);
  } catch (error) {
    logger.error('Failed to send welcome email', {
      userId: user.id,
      error: error.message
    });
    // Don't fail registration if email fails
  }

  // Generate CA token
  const token = await tokenService.generateToken(user);

  res.status(201).json({
    message: 'User registered successfully. Please check your email to verify your account.',
    user: user.toSafeObject(),
    token
  });
}));

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login',
  strictLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      throw new AppError(info.message || 'Authentication failed', 401, 'AUTH_FAILED');
    }

    // Log user in
    req.login(user, async (err) => {
      if (err) {
        return next(err);
      }

      logger.info('User logged in', { userId: user.id, email: user.email });

      // Generate CA token
      const token = await tokenService.generateToken(user);

      res.json({
        message: 'Login successful',
        user: user.toSafeObject(),
        token
      });
    });
  })(req, res, next);
}));

/**
 * POST /api/auth/logout
 * User logout
 */
router.post('/logout', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const userId = req.user.id;

  req.logout((err) => {
    if (err) {
      logger.error('Logout error', { error: err.message, userId });
      throw new AppError('Logout failed', 500, 'LOGOUT_FAILED');
    }

    logger.info('User logged out', { userId });

    res.json({ message: 'Logout successful' });
  });
}));

/**
 * POST /api/auth/forgot-password
 * Initiate password reset
 */
router.post('/forgot-password',
  strictLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
  const { email } = req.body;

  validateRequired({ email }, ['email']);

  const user = await User.findOne({ where: { email } });

  // Don't reveal if user exists
  if (!user) {
    return res.json({
      message: 'If the email exists, a password reset link has been sent'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  logger.info('Password reset requested', { userId: user.id, email: user.email });

  // Send password reset email
  try {
    const emailService = await getEmailService();
    await emailService.sendPasswordResetEmail(user, resetToken);
  } catch (error) {
    logger.error('Failed to send password reset email', {
      userId: user.id,
      error: error.message
    });
    // Don't reveal if email failed for security
  }

  res.json({
    message: 'If the email exists, a password reset link has been sent',
    ...(process.env.NODE_ENV === 'development' && { resetToken }) // Only in dev
  });
}));

/**
 * POST /api/auth/reset-password
 * Complete password reset
 */
router.post('/reset-password',
  strictLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  validateRequired({ token, password }, ['token', 'password']);

  // Check password complexity
  if (password.length < config.security.passwordMinLength) {
    throw new AppError(
      `Password must be at least ${config.security.passwordMinLength} characters`,
      400,
      'WEAK_PASSWORD'
    );
  }

  // Find user with valid reset token
  const user = await User.findOne({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { [require('sequelize').Op.gt]: Date.now() }
    }
  });

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  }

  // Update password
  user.passwordHash = password; // Will be hashed by beforeUpdate hook
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  logger.info('Password reset completed', { userId: user.id, email: user.email });

  res.json({ message: 'Password reset successful' });
}));

/**
 * Google OAuth
 */
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  asyncHandler(async (req, res) => {
    // Generate CA token
    const token = await tokenService.generateToken(req.user);

    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}`;
    res.redirect(redirectUrl);
  })
);

/**
 * GitHub OAuth
 */
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  asyncHandler(async (req, res) => {
    // Generate CA token
    const token = await tokenService.generateToken(req.user);

    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}`;
    res.redirect(redirectUrl);
  })
);

/**
 * POST /api/auth/verify-email
 * Verify email address with token
 */
router.post('/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(async (req, res) => {
  const { token } = req.body;

  validateRequired({ token }, ['token']);

  const user = await User.findOne({
    where: { emailVerificationToken: token }
  });

  if (!user) {
    throw new AppError('Invalid or expired verification token', 400, 'INVALID_TOKEN');
  }

  // Mark email as verified
  user.emailVerified = true;
  user.emailVerificationToken = null;
  await user.save();

  logger.info('Email verified', { userId: user.id, email: user.email });

  res.json({ message: 'Email verified successfully' });
}));

/**
 * POST /api/auth/resend-verification
 * Resend email verification
 */
router.post('/resend-verification',
  strictLimiter,
  validate(resendVerificationSchema),
  asyncHandler(async (req, res) => {
  const { email } = req.body;

  validateRequired({ email }, ['email']);

  const user = await User.findOne({ where: { email } });

  // Don't reveal if user exists
  if (!user) {
    return res.json({
      message: 'If the email exists and is not verified, a verification link has been sent'
    });
  }

  if (user.emailVerified) {
    return res.json({ message: 'Email is already verified' });
  }

  // Generate new verification token
  user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
  await user.save();

  logger.info('Email verification resent', { userId: user.id, email: user.email });

  // Send verification email
  try {
    const emailService = await getEmailService();
    await emailService.sendVerificationEmail(user, user.emailVerificationToken);
  } catch (error) {
    logger.error('Failed to send verification email', {
      userId: user.id,
      error: error.message
    });
    // Don't reveal if email failed for security
  }

  res.json({
    message: 'If the email exists and is not verified, a verification link has been sent',
    ...(process.env.NODE_ENV === 'development' && { token: user.emailVerificationToken }) // Only in dev
  });
}));

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password',
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'NOT_AUTHENTICATED');
  }

  const { currentPassword, newPassword } = req.body;

  validateRequired({ currentPassword, newPassword }, ['currentPassword', 'newPassword']);

  // Check password complexity
  if (newPassword.length < config.security.passwordMinLength) {
    throw new AppError(
      `Password must be at least ${config.security.passwordMinLength} characters`,
      400,
      'WEAK_PASSWORD'
    );
  }

  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
  }

  // Check if new password is same as current
  const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);

  if (isSamePassword) {
    throw new AppError('New password must be different from current password', 400, 'SAME_PASSWORD');
  }

  // Update password
  user.passwordHash = newPassword; // Will be hashed by beforeUpdate hook
  await user.save();

  logger.info('Password changed', { userId: user.id, email: user.email });

  // Send security alert email
  try {
    const emailService = await getEmailService();
    await emailService.sendSecurityAlertEmail(user, {
      type: 'Password Changed',
      description: 'Your password was successfully changed.',
      timestamp: Date.now(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      location: 'Unknown' // Could integrate with IP geolocation service
    });
  } catch (error) {
    logger.error('Failed to send security alert email', {
      userId: user.id,
      error: error.message
    });
    // Don't fail the operation if email fails
  }

  res.json({ message: 'Password changed successfully' });
}));

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const user = await User.findByPk(req.user.id, {
    include: [{ model: require('../models').Group, as: 'groups' }]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({ user: user.toSafeObject() });
}));

module.exports = router;
