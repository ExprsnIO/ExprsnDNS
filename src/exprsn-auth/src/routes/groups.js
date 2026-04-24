/**
 * ═══════════════════════════════════════════════════════════
 * Group Routes
 * Group management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateCAToken, validateRequired } = require('@exprsn/shared');
const { Group, User, UserGroup } = require('../models');

const router = express.Router();

// All group routes require authentication
router.use(validateCAToken({ requiredPermissions: ['read'] }));

/**
 * POST /api/groups
 * Create new group
 */
router.post('/', validateCAToken({ requiredPermissions: ['write'] }), asyncHandler(async (req, res) => {
  const { name, description, permissions, parentId } = req.body;

  validateRequired({ name }, ['name']);

  // Check if group exists
  const existingGroup = await Group.findOne({ where: { name } });
  if (existingGroup) {
    throw new AppError('Group already exists', 409, 'GROUP_EXISTS');
  }

  const group = await Group.create({
    name,
    description,
    permissions: permissions || {},
    parentId
  });

  res.status(201).json({
    message: 'Group created successfully',
    group
  });
}));

/**
 * GET /api/groups/:id
 * Get group details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const group = await Group.findByPk(id, {
    include: [{ model: User, as: 'users' }]
  });

  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  res.json({ group });
}));

/**
 * PUT /api/groups/:id
 * Update group
 */
router.put('/:id', validateCAToken({ requiredPermissions: ['update'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, permissions } = req.body;

  const group = await Group.findByPk(id);

  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  if (name !== undefined) group.name = name;
  if (description !== undefined) group.description = description;
  if (permissions !== undefined) group.permissions = permissions;

  await group.save();

  res.json({
    message: 'Group updated successfully',
    group
  });
}));

/**
 * DELETE /api/groups/:id
 * Delete group
 */
router.delete('/:id', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const group = await Group.findByPk(id);

  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  await group.destroy();

  res.json({ message: 'Group deleted successfully' });
}));

/**
 * POST /api/groups/:id/members
 * Add member to group
 */
router.post('/:id/members', validateCAToken({ requiredPermissions: ['write'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId, role } = req.body;

  validateRequired({ userId }, ['userId']);

  const group = await Group.findByPk(id);
  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Check if already member
  const existing = await UserGroup.findOne({
    where: { userId, groupId: id }
  });

  if (existing) {
    throw new AppError('User is already a member', 409, 'ALREADY_MEMBER');
  }

  await UserGroup.create({
    userId,
    groupId: id,
    role: role || 'member'
  });

  res.status(201).json({ message: 'Member added successfully' });
}));

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove member from group
 */
router.delete('/:id/members/:userId', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { id, userId } = req.params;

  const membership = await UserGroup.findOne({
    where: { userId, groupId: id }
  });

  if (!membership) {
    throw new AppError('Membership not found', 404, 'NOT_MEMBER');
  }

  await membership.destroy();

  res.json({ message: 'Member removed successfully' });
}));

module.exports = router;
