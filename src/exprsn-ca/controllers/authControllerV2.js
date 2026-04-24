/**
 * ═══════════════════════════════════════════════════════════
 * Authentication Controller V2
 * Updated to use centralized Auth service
 * ═══════════════════════════════════════════════════════════
 */

const authServiceClient = require('../services/authServiceClient');
const logger = require('../utils/logger');
const { User: LocalUser, AuditLog } = require('../models');

// Feature flag for Auth service integration
const USE_AUTH_SERVICE = process.env.USE_AUTH_SERVICE === 'true' || false;

/**
 * Login handler
 * Authenticates user via Auth service or local database (fallback)
 */
async function login(req, res) {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'Username and password are required'
      });
    }

    let authResult;
    let user;

    // Try Auth service first if enabled
    if (USE_AUTH_SERVICE) {
      try {
        authResult = await authServiceClient.authenticateUser(username, password);

        if (authResult.success) {
          user = authResult.user;

          logger.info('User authenticated via Auth service', {
            userId: user.id,
            username: user.username
          });

          // Store session
          req.session.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            roles: user.roles || [],
            authenticatedVia: 'auth-service'
          };

          if (rememberMe) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
          }

          await req.session.save();

          // Log audit event
          await AuditLog.log({
            userId: user.id,
            action: 'user.login',
            status: 'success',
            severity: 'info',
            message: 'User logged in successfully via Auth service',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          });

          return res.json({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              displayName: user.displayName
            },
            redirect: req.session.returnTo || '/dashboard'
          });
        }
      } catch (error) {
        logger.warn('Auth service authentication failed, falling back to local', {
          error: error.message
        });
      }
    }

    // Fallback to local authentication
    const localUser = await LocalUser.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { email: username },
          { username: username }
        ]
      },
      include: [
        {
          association: 'roles',
          through: { attributes: [] }
        }
      ]
    });

    if (!localUser) {
      logger.warn('Login failed - user not found', { username });

      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });
    }

    // Verify password
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(password, localUser.password);

    if (!isValidPassword) {
      logger.warn('Login failed - invalid password', {
        userId: localUser.id,
        username
      });

      await AuditLog.log({
        userId: localUser.id,
        action: 'user.login',
        status: 'failure',
        severity: 'warning',
        message: 'Login failed - invalid password',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });
    }

    // Check if user is active
    if (localUser.status !== 'active') {
      logger.warn('Login failed - user account not active', {
        userId: localUser.id,
        status: localUser.status
      });

      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_INACTIVE',
        message: 'Your account is not active. Please contact an administrator.'
      });
    }

    // Update last login
    await localUser.update({
      lastLoginAt: new Date(),
      lastLoginIp: req.ip
    });

    // Store session
    req.session.user = {
      id: localUser.id,
      email: localUser.email,
      username: localUser.username,
      firstName: localUser.firstName,
      lastName: localUser.lastName,
      displayName: localUser.displayName || `${localUser.firstName} ${localUser.lastName}`,
      roles: localUser.roles ? localUser.roles.map(r => ({ id: r.id, name: r.name })) : [],
      authenticatedVia: 'local-ca'
    };

    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    await req.session.save();

    // Log audit event
    await AuditLog.log({
      userId: localUser.id,
      action: 'user.login',
      status: 'success',
      severity: 'info',
      message: 'User logged in successfully (local)',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('User authenticated via local database', {
      userId: localUser.id,
      username: localUser.username
    });

    res.json({
      success: true,
      user: {
        id: localUser.id,
        email: localUser.email,
        username: localUser.username,
        firstName: localUser.firstName,
        lastName: localUser.lastName,
        displayName: localUser.displayName
      },
      redirect: req.session.returnTo || '/dashboard'
    });

    // Clear returnTo from session
    delete req.session.returnTo;

  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An error occurred during login'
    });
  }
}

/**
 * Logout handler
 * Destroys session and optionally notifies Auth service
 */
async function logout(req, res) {
  try {
    const userId = req.session?.user?.id;
    const authenticatedVia = req.session?.user?.authenticatedVia;

    // If authenticated via Auth service, notify it
    if (USE_AUTH_SERVICE && authenticatedVia === 'auth-service' && req.session.authServiceToken) {
      try {
        await authServiceClient.logout(req.session.authServiceToken);
      } catch (error) {
        logger.warn('Failed to logout from Auth service', { error: error.message });
      }
    }

    // Log audit event
    if (userId) {
      await AuditLog.log({
        userId,
        action: 'user.logout',
        status: 'success',
        severity: 'info',
        message: 'User logged out',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        logger.error('Error destroying session', { error: err.message });
      }

      // Clear session cookie
      res.clearCookie('connect.sid');

      // For API requests
      if (req.path.startsWith('/api/')) {
        return res.json({
          success: true,
          message: 'Logged out successfully'
        });
      }

      // For web requests
      res.redirect('/auth/login');
    });
  } catch (error) {
    logger.error('Logout error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An error occurred during logout'
    });
  }
}

/**
 * Get current user info
 */
async function getCurrentUser(req, res) {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: 'NOT_AUTHENTICATED',
        message: 'Not authenticated'
      });
    }

    const user = req.session.user;

    // Fetch fresh user data from Auth service if authenticated via it
    if (USE_AUTH_SERVICE && user.authenticatedVia === 'auth-service') {
      try {
        const freshUser = await authServiceClient.getUser(user.id);
        if (freshUser) {
          // Update session with fresh data
          req.session.user = {
            ...user,
            ...freshUser,
            authenticatedVia: 'auth-service'
          };
          await req.session.save();

          return res.json({
            success: true,
            user: freshUser
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch user from Auth service', { error: error.message });
      }
    }

    // Return session user data
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        roles: user.roles
      }
    });
  } catch (error) {
    logger.error('Get current user error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An error occurred'
    });
  }
}

/**
 * Check Auth service health
 */
async function checkAuthServiceHealth(req, res) {
  try {
    if (!USE_AUTH_SERVICE) {
      return res.json({
        success: true,
        enabled: false,
        message: 'Auth service integration is disabled'
      });
    }

    const isAvailable = await authServiceClient.isAvailable();
    const health = await authServiceClient.getHealth();

    res.json({
      success: true,
      enabled: true,
      available: isAvailable,
      health
    });
  } catch (error) {
    res.json({
      success: false,
      enabled: true,
      available: false,
      error: error.message
    });
  }
}

module.exports = {
  login,
  logout,
  getCurrentUser,
  checkAuthServiceHealth
};
