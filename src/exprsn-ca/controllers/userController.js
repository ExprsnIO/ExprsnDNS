/**
 * ═══════════════════════════════════════════════════════════
 * User Controller
 * ═══════════════════════════════════════════════════════════
 */

const { User, Profile, Certificate, Token, AuditLog } = require('../models');
const logger = require('../config/logging');
const { ErrorTypes } = require('../middleware/errorHandler');

/**
 * List all users (admin only)
 */
async function listUsers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const where = {};
    if (search) {
      where[require('sequelize').Op.or] = [
        { email: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { firstName: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { lastName: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { username: { [require('sequelize').Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['passwordHash'] }
    });

    const totalPages = Math.ceil(count / limit);

    res.render('users/index', {
      title: 'Users',
      users,
      search,
      pagination: {
        page,
        limit,
        totalPages,
        totalItems: count
      }
    });
  } catch (error) {
    logger.error('Error listing users', { error: error.message, stack: error.stack });
    throw ErrorTypes.INTERNAL_ERROR('Failed to load users');
  }
}

/**
 * View user profile
 */
async function viewUserProfile(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.session.user.id;

    // Users can view their own profile, admins can view any profile
    if (id !== currentUserId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to view this profile');
    }

    const user = await User.findByPk(id, {
      attributes: { exclude: ['passwordHash'] },
      include: [
        {
          association: 'profiles',
          order: [['createdAt', 'DESC']]
        },
        {
          association: 'roles',
          through: { attributes: [] }
        },
        {
          association: 'groups',
          through: { attributes: [] }
        }
      ]
    });

    if (!user) {
      throw ErrorTypes.NOT_FOUND('User not found');
    }

    // Get user statistics
    const certificateCount = await Certificate.count({
      where: { userId: id }
    });

    const tokenCount = await Token.count({
      where: { userId: id }
    });

    const activeTokenCount = await Token.count({
      where: { userId: id, status: 'active' }
    });

    res.render('users/profile', {
      title: `Profile: ${user.email}`,
      profileUser: user,
      isOwnProfile: id === currentUserId,
      stats: {
        certificates: certificateCount,
        tokens: tokenCount,
        activeTokens: activeTokenCount
      }
    });
  } catch (error) {
    logger.error('Error viewing user profile', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Show user edit form
 */
async function showEditUserForm(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.session.user.id;

    if (id !== currentUserId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to edit this user');
    }

    const user = await User.findByPk(id, {
      attributes: { exclude: ['passwordHash'] }
    });

    if (!user) {
      throw ErrorTypes.NOT_FOUND('User not found');
    }

    res.render('users/edit', {
      title: 'Edit Profile',
      editUser: user,
      error: req.session.error || null,
      oldInput: req.session.oldInput || {}
    });

    delete req.session.error;
    delete req.session.oldInput;
  } catch (error) {
    logger.error('Error showing edit user form', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Update user profile
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.session.user.id;
    const { firstName, lastName, email, username } = req.body;

    if (id !== currentUserId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to edit this user');
    }

    const user = await User.findByPk(id);

    if (!user) {
      throw ErrorTypes.NOT_FOUND('User not found');
    }

    // Check if email/username is already taken
    if (email !== user.email || username !== user.username) {
      const existing = await User.findOne({
        where: {
          id: { [require('sequelize').Op.ne]: id },
          [require('sequelize').Op.or]: [
            ...(email !== user.email ? [{ email }] : []),
            ...(username !== user.username ? [{ username }] : [])
          ]
        }
      });

      if (existing) {
        req.session.error = 'Email or username already in use';
        req.session.oldInput = req.body;
        return res.redirect(`/users/${id}/edit`);
      }
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.email = email;
    user.username = username;
    await user.save();

    // Update session if editing own profile
    if (id === currentUserId) {
      req.session.user = user.toSafeObject ? user.toSafeObject() : {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName
      };
    }

    await AuditLog.log({
      userId: currentUserId,
      action: 'user.updated',
      status: 'success',
      severity: 'info',
      message: 'User profile updated',
      resourceType: 'user',
      resourceId: id,
      details: { email, username }
    });

    logger.info('User updated', { userId: id, by: currentUserId });

    req.session.success = 'Profile updated successfully';
    res.redirect(`/users/${id}`);
  } catch (error) {
    logger.error('Error updating user', { error: error.message, stack: error.stack });

    req.session.error = error.message || 'Failed to update profile';
    req.session.oldInput = req.body;
    res.redirect(`/users/${req.params.id}/edit`);
  }
}

/**
 * Lock/unlock user account (admin only)
 */
async function toggleUserLock(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.session.user.id;

    // Can't lock yourself
    if (id === currentUserId) {
      throw ErrorTypes.BAD_REQUEST('You cannot lock your own account');
    }

    const user = await User.findByPk(id);

    if (!user) {
      throw ErrorTypes.NOT_FOUND('User not found');
    }

    const newLockStatus = !user.accountLocked;
    user.accountLocked = newLockStatus;

    if (!newLockStatus) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }

    await user.save();

    await AuditLog.log({
      userId: currentUserId,
      action: newLockStatus ? 'user.locked' : 'user.unlocked',
      status: 'success',
      severity: 'warning',
      message: `User account ${newLockStatus ? 'locked' : 'unlocked'}`,
      resourceType: 'user',
      resourceId: id
    });

    logger.info('User lock status changed', {
      userId: id,
      locked: newLockStatus,
      by: currentUserId
    });

    req.session.success = `User account ${newLockStatus ? 'locked' : 'unlocked'} successfully`;
    res.redirect(`/users/${id}`);
  } catch (error) {
    logger.error('Error toggling user lock', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Delete user account (admin only)
 */
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const currentUserId = req.session.user.id;

    // Can't delete yourself
    if (id === currentUserId) {
      throw ErrorTypes.BAD_REQUEST('You cannot delete your own account');
    }

    const user = await User.findByPk(id);

    if (!user) {
      throw ErrorTypes.NOT_FOUND('User not found');
    }

    // TODO: Handle cascading deletes (certificates, tokens, etc.)
    await user.destroy();

    await AuditLog.log({
      userId: currentUserId,
      action: 'user.deleted',
      status: 'success',
      severity: 'critical',
      message: 'User account deleted',
      resourceType: 'user',
      resourceId: id,
      details: { email: user.email }
    });

    logger.warn('User deleted', { userId: id, by: currentUserId });

    req.session.success = 'User deleted successfully';
    res.redirect('/users');
  } catch (error) {
    logger.error('Error deleting user', { error: error.message, stack: error.stack });
    throw error;
  }
}

module.exports = {
  listUsers,
  viewUserProfile,
  showEditUserForm,
  updateUser,
  toggleUserLock,
  deleteUser
};
