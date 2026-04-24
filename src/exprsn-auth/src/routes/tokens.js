/**
 * ═══════════════════════════════════════════════════════════
 * Token Routes
 * CA token management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateCAToken } = require('@exprsn/shared');
const tokenService = require('../services/tokenService');
const { User } = require('../models');

const router = express.Router();

/**
 * POST /api/tokens/generate
 * Generate new CA token for authenticated user
 */
router.post('/generate', validateCAToken({ requiredPermissions: ['read'] }), asyncHandler(async (req, res) => {
  const { permissions, resourceType, resourceValue, expiryType, expirySeconds } = req.body;

  const user = await User.findByPk(req.userId);

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const token = await tokenService.generateToken(user, {
    permissions,
    resourceType,
    resourceValue,
    expiryType,
    expirySeconds
  });

  res.json({
    message: 'Token generated successfully',
    token
  });
}));

/**
 * POST /api/tokens/validate
 * Validate CA token
 */
router.post('/validate', asyncHandler(async (req, res) => {
  const { token, requiredPermissions, resource } = req.body;

  if (!token) {
    throw new AppError('Token required', 400, 'TOKEN_REQUIRED');
  }

  const validation = await tokenService.validateToken(token, {
    requiredPermissions,
    resource
  });

  res.json(validation);
}));

/**
 * POST /api/tokens/revoke
 * Revoke CA token
 */
router.post('/revoke', validateCAToken({ requiredPermissions: ['delete'] }), asyncHandler(async (req, res) => {
  const { tokenId, reason } = req.body;

  if (!tokenId) {
    throw new AppError('Token ID required', 400, 'TOKEN_ID_REQUIRED');
  }

  await tokenService.revokeToken(tokenId, reason);

  res.json({ message: 'Token revoked successfully' });
}));

module.exports = router;
