/**
 * ═══════════════════════════════════════════════════════════
 * User Routes
 * User management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateCAToken } = require('@exprsn/shared');
const { User, Group } = require('../models');

const router = express.Router();

// All user routes require authentication
router.use(validateCAToken({ requiredPermissions: ['read'] }));

/**
 * GET /api/users/:id
 * Get user profile
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Users can only view their own profile or need update permission
  if (id !== req.userId && !req.permissions.update) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id, {
    include: [{ model: Group, as: 'groups' }]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({ user: user.toSafeObject() });
}));

/**
 * PUT /api/users/:id
 * Update user profile
 */
router.put('/:id', validateCAToken({ requiredPermissions: ['update'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { displayName, firstName, lastName, bio, avatarUrl } = req.body;

  // Users can only update their own profile
  if (id !== req.userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Update allowed fields
  if (displayName !== undefined) user.displayName = displayName;
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (bio !== undefined) user.bio = bio;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

  await user.save();

  res.json({
    message: 'Profile updated successfully',
    user: user.toSafeObject()
  });
}));

/**
 * DELETE /api/users/:id
 * Deactivate user account
 */
router.delete('/:id', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Users can only deactivate their own account
  if (id !== req.userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  user.status = 'inactive';
  await user.save();

  res.json({ message: 'Account deactivated successfully' });
}));

/**
 * GET /api/users/:id/groups
 * Get user's groups
 */
router.get('/:id/groups', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Users can only view their own groups
  if (id !== req.userId && !req.permissions.update) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const user = await User.findByPk(id, {
    include: [{ model: Group, as: 'groups' }]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  res.json({ groups: user.groups });
}));

module.exports = router;
