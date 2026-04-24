/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Controller
 * ═══════════════════════════════════════════════════════════
 */

const { User, AuditLog, PasswordReset } = require('../models');
const logger = require('../config/logging');
const emailService = require('../services/email');
const { invalidateUserPermissionCache } = require('../middleware/permissionCache');

/**
 * Show login page
 */
async function showLoginPage(req, res) {
  res.render('auth/login', {
    title: 'Login',
    error: req.session.error || null,
    oldInput: req.session.oldInput || {}
  });

  // Clear session errors
  delete req.session.error;
  delete req.session.oldInput;
}

/**
 * Handle login
 */
async function handleLogin(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });

    if (!user) {
      logger.warn('Login attempt with non-existent email', { email });

      await AuditLog.log({
        action: 'auth.login.failed',
        status: 'failure',
        severity: 'warning',
        message: 'Login attempt with non-existent email',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        details: { email }
      });

      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (user.isLocked && user.isLocked()) {
      logger.warn('Login attempt on locked account', { userId: user.id, email });

      await AuditLog.log({
        userId: user.id,
        action: 'auth.login.locked',
        status: 'failure',
        severity: 'warning',
        message: 'Login attempt on locked account',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.render('auth/login', {
        title: 'Login',
        error: 'Account is locked. Please contact support.'
      });
    }

    // Verify password
    const isValid = await user.validatePassword(password);

    if (!isValid) {
      if (user.incrementFailedAttempts) {
        await user.incrementFailedAttempts();
      }

      logger.warn('Failed login attempt', { userId: user.id, email });

      await AuditLog.log({
        userId: user.id,
        action: 'auth.login.failed',
        status: 'failure',
        severity: 'warning',
        message: 'Failed login attempt - invalid password',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password'
      });
    }

    // Reset failed attempts
    if (user.resetFailedAttempts) {
      await user.resetFailedAttempts();
    }

    // Update last login
    user.lastLoginAt = new Date();
    user.lastLoginIp = req.ip;
    await user.save();

    // Create session
    req.session.user = user.toSafeObject ? user.toSafeObject() : {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName
    };

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

    // Redirect to original URL or dashboard
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;

    res.redirect(returnTo);
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack });

    res.render('auth/login', {
      title: 'Login',
      error: 'An error occurred. Please try again.'
    });
  }
}

/**
 * Handle logout
 */
async function handleLogout(req, res) {
  const userId = req.session.user?.id;

  req.session.destroy(async (err) => {
    if (err) {
      logger.error('Logout error', { error: err.message, userId });
    }

    if (userId) {
      await AuditLog.log({
        userId,
        action: 'auth.logout',
        status: 'success',
        severity: 'info',
        message: 'User logged out'
      });

      logger.info('User logged out', { userId });
    }

    res.redirect('/');
  });
}

/**
 * Show registration page
 */
async function showRegisterPage(req, res) {
  res.render('auth/register', {
    title: 'Register',
    error: req.session.error || null,
    oldInput: req.session.oldInput || {}
  });

  // Clear session errors
  delete req.session.error;
  delete req.session.oldInput;
}

/**
 * Handle registration
 */
async function handleRegister(req, res) {
  try {
    const { email, username, password, firstName, lastName } = req.body;

    // Check if user exists
    const existing = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [{ email }, ...(username ? [{ username }] : [])]
      }
    });

    if (existing) {
      logger.warn('Registration attempt with existing email/username', { email, username });

      return res.render('auth/register', {
        title: 'Register',
        error: 'Email or username already exists',
        oldInput: { email, username, firstName, lastName }
      });
    }

    // Hash password
    const passwordHash = await User.hashPassword(password);

    // Create user
    const user = await User.create({
      email,
      username: username || email.split('@')[0], // Use email prefix if no username
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
      userAgent: req.get('user-agent'),
      details: { email, username }
    });

    logger.info('New user registered', { userId: user.id, email: user.email });

    // Auto-login
    req.session.user = user.toSafeObject ? user.toSafeObject() : {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName
    };

    res.redirect('/dashboard');
  } catch (error) {
    logger.error('Registration error', { error: error.message, stack: error.stack });

    res.render('auth/register', {
      title: 'Register',
      error: 'An error occurred. Please try again.',
      oldInput: req.body
    });
  }
}

/**
 * Show password reset request page
 */
async function showPasswordResetPage(req, res) {
  res.render('auth/reset-password', {
    title: 'Reset Password',
    error: null,
    success: null
  });
}

/**
 * Handle password reset request
 */
async function handlePasswordResetRequest(req, res) {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });

    // Always show success message to prevent email enumeration
    const successMessage = 'If an account exists with that email, a password reset link has been sent.';

    if (user) {
      // Generate secure reset token
      const resetToken = PasswordReset.generateToken();
      const tokenHash = PasswordReset.hashToken(resetToken);

      // Calculate expiry time
      const expiryMinutes = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 60;
      const expiresAt = Date.now() + (expiryMinutes * 60 * 1000);

      // Invalidate any existing reset tokens for this user
      await PasswordReset.update(
        { used: true },
        { where: { userId: user.id, used: false } }
      );

      // Create new password reset token
      await PasswordReset.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      // Send password reset email
      try {
        await emailService.sendPasswordResetEmail(email, user.username, resetToken);
      } catch (emailError) {
        logger.error('Failed to send password reset email:', emailError);
        // Continue anyway to prevent email enumeration
      }

      logger.info('Password reset requested', { userId: user.id, email });

      await AuditLog.log({
        userId: user.id,
        action: 'auth.password_reset.requested',
        status: 'success',
        severity: 'info',
        message: 'Password reset requested',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } else {
      logger.warn('Password reset requested for non-existent email', { email });
    }

    res.render('auth/reset-password', {
      title: 'Reset Password',
      error: null,
      success: successMessage
    });
  } catch (error) {
    logger.error('Password reset error', { error: error.message, stack: error.stack });

    res.render('auth/reset-password', {
      title: 'Reset Password',
      error: 'An error occurred. Please try again.',
      success: null
    });
  }
}

/**
 * Show password reset form with token
 */
async function showPasswordResetForm(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.render('auth/reset-password-form', {
      title: 'Reset Password',
      error: 'Invalid reset link',
      token: null
    });
  }

  try {
    // Verify token exists and is valid
    const tokenHash = PasswordReset.hashToken(token);
    const resetRecord = await PasswordReset.findOne({
      where: { tokenHash, used: false }
    });

    if (!resetRecord || !resetRecord.isValid()) {
      return res.render('auth/reset-password-form', {
        title: 'Reset Password',
        error: 'This reset link is invalid or has expired',
        token: null
      });
    }

    res.render('auth/reset-password-form', {
      title: 'Reset Password',
      error: null,
      token
    });
  } catch (error) {
    logger.error('Password reset form error', { error: error.message });

    res.render('auth/reset-password-form', {
      title: 'Reset Password',
      error: 'An error occurred. Please try again.',
      token: null
    });
  }
}

/**
 * Handle password reset completion
 */
async function handlePasswordResetComplete(req, res) {
  try {
    const { token, password, passwordConfirm } = req.body;

    // Validate passwords match
    if (password !== passwordConfirm) {
      return res.render('auth/reset-password-form', {
        title: 'Reset Password',
        error: 'Passwords do not match',
        token
      });
    }

    // Verify token
    const tokenHash = PasswordReset.hashToken(token);
    const resetRecord = await PasswordReset.findOne({
      where: { tokenHash, used: false },
      include: [{ model: User, as: 'user' }]
    });

    if (!resetRecord || !resetRecord.isValid()) {
      return res.render('auth/reset-password-form', {
        title: 'Reset Password',
        error: 'This reset link is invalid or has expired',
        token: null
      });
    }

    const user = resetRecord.user;

    // Update password
    const passwordHash = await User.hashPassword(password);
    await user.update({ passwordHash });

    // Mark token as used
    await resetRecord.update({
      used: true,
      usedAt: Date.now()
    });

    // Invalidate permission cache
    await invalidateUserPermissionCache(user.id);

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(
        user.email,
        user.username,
        req.ip
      );
    } catch (emailError) {
      logger.error('Failed to send password changed email:', emailError);
    }

    await AuditLog.log({
      userId: user.id,
      action: 'auth.password_reset.completed',
      status: 'success',
      severity: 'info',
      message: 'Password reset completed',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    logger.info('Password reset completed', { userId: user.id });

    res.render('auth/reset-password-success', {
      title: 'Password Reset Complete',
      message: 'Your password has been successfully reset. You can now log in with your new password.'
    });
  } catch (error) {
    logger.error('Password reset completion error', { error: error.message, stack: error.stack });

    res.render('auth/reset-password-form', {
      title: 'Reset Password',
      error: 'An error occurred. Please try again.',
      token: req.body.token
    });
  }
}

/**
 * Admin/Moderator: Initiate password reset for a user
 */
async function adminInitiatePasswordReset(req, res) {
  try {
    const { userId } = req.params;
    const adminUser = await User.findByPk(req.session.userId);

    if (!adminUser) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const targetUser = await User.findByPk(userId);

    if (!targetUser) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // Generate secure reset token
    const resetToken = PasswordReset.generateToken();
    const tokenHash = PasswordReset.hashToken(resetToken);

    // Calculate expiry time
    const expiryMinutes = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 60;
    const expiresAt = Date.now() + (expiryMinutes * 60 * 1000);

    // Invalidate any existing reset tokens for this user
    await PasswordReset.update(
      { used: true },
      { where: { userId: targetUser.id, used: false } }
    );

    // Create new password reset token with initiator
    await PasswordReset.create({
      userId: targetUser.id,
      tokenHash,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      initiatedBy: adminUser.id
    });

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(
        targetUser.email,
        targetUser.username,
        resetToken,
        adminUser
      );
    } catch (emailError) {
      logger.error('Failed to send admin-initiated password reset email:', emailError);
      return res.status(500).json({
        error: 'EMAIL_FAILED',
        message: 'Failed to send password reset email'
      });
    }

    await AuditLog.log({
      userId: adminUser.id,
      action: 'admin.password_reset.initiated',
      resourceType: 'user',
      resourceId: targetUser.id,
      status: 'success',
      severity: 'warning',
      message: `Admin initiated password reset for user ${targetUser.username}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    logger.info('Admin initiated password reset', {
      adminId: adminUser.id,
      targetUserId: targetUser.id
    });

    res.json({
      success: true,
      message: 'Password reset email sent to user'
    });
  } catch (error) {
    logger.error('Admin password reset error', { error: error.message, stack: error.stack });

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An error occurred while initiating password reset'
    });
  }
}

/**
 * Admin/Moderator: Force password change for a user
 */
async function adminForcePasswordChange(req, res) {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    const adminUser = await User.findByPk(req.session.userId);

    if (!adminUser) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const targetUser = await User.findByPk(userId);

    if (!targetUser) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // Update password
    const passwordHash = await User.hashPassword(newPassword);
    await targetUser.update({ passwordHash });

    // Invalidate permission cache
    await invalidateUserPermissionCache(targetUser.id);

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(
        targetUser.email,
        targetUser.username,
        req.ip,
        adminUser
      );
    } catch (emailError) {
      logger.error('Failed to send password changed email:', emailError);
    }

    await AuditLog.log({
      userId: adminUser.id,
      action: 'admin.password.force_change',
      resourceType: 'user',
      resourceId: targetUser.id,
      status: 'success',
      severity: 'critical',
      message: `Admin force changed password for user ${targetUser.username}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    logger.info('Admin force changed password', {
      adminId: adminUser.id,
      targetUserId: targetUser.id
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Admin force password change error', { error: error.message, stack: error.stack });

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An error occurred while changing password'
    });
  }
}

module.exports = {
  showLoginPage,
  handleLogin,
  handleLogout,
  showRegisterPage,
  handleRegister,
  showPasswordResetPage,
  handlePasswordResetRequest,
  showPasswordResetForm,
  handlePasswordResetComplete,
  adminInitiatePasswordReset,
  adminForcePasswordChange
};
