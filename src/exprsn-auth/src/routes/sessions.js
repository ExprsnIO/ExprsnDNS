/**
 * ═══════════════════════════════════════════════════════════
 * Session Routes
 * Session management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, logger } = require('@exprsn/shared');
const { requireAuth } = require('../middleware/requireAuth');
const { Session } = require('../models');

const router = express.Router();

// All session routes require authentication
router.use(requireAuth);

/**
 * GET /api/sessions
 * Get all active sessions for current user
 */
router.get('/', asyncHandler(async (req, res) => {
  const sessions = await Session.findAll({
    where: {
      userId: req.user.id,
      active: true,
      expiresAt: {
        [require('sequelize').Op.gt]: new Date()
      }
    },
    order: [['lastActivityAt', 'DESC']]
  });

  res.json({
    sessions: sessions.map(session => ({
      id: session.id,
      sessionId: session.sessionId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      isCurrent: req.sessionID === session.sessionId
    }))
  });
}));

/**
 * GET /api/sessions/current
 * Get current session details
 */
router.get('/current', asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    where: {
      sessionId: req.sessionID,
      userId: req.user.id
    }
  });

  if (!session) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  res.json({
    session: {
      id: session.id,
      sessionId: session.sessionId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      isCurrent: true
    }
  });
}));

/**
 * DELETE /api/sessions/:id
 * Revoke specific session
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const session = await Session.findOne({
    where: {
      id,
      userId: req.user.id
    }
  });

  if (!session) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  // Prevent revoking current session via this endpoint
  if (session.sessionId === req.sessionID) {
    throw new AppError(
      'Cannot revoke current session. Use logout instead.',
      400,
      'CANNOT_REVOKE_CURRENT_SESSION'
    );
  }

  // Mark session as inactive
  session.active = false;
  await session.save();

  logger.info('Session revoked', {
    userId: req.user.id,
    sessionId: session.sessionId
  });

  res.json({ message: 'Session revoked successfully' });
}));

/**
 * DELETE /api/sessions
 * Revoke all sessions except current
 */
router.delete('/', asyncHandler(async (req, res) => {
  const sessions = await Session.findAll({
    where: {
      userId: req.user.id,
      active: true
    }
  });

  let revokedCount = 0;

  for (const session of sessions) {
    // Skip current session
    if (session.sessionId === req.sessionID) {
      continue;
    }

    session.active = false;
    await session.save();
    revokedCount++;
  }

  logger.info('All sessions revoked', {
    userId: req.user.id,
    count: revokedCount
  });

  res.json({
    message: `${revokedCount} session(s) revoked successfully`,
    revokedCount
  });
}));

/**
 * POST /api/sessions/refresh
 * Refresh current session (extend expiry)
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    where: {
      sessionId: req.sessionID,
      userId: req.user.id
    }
  });

  if (!session) {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  // Extend session expiry
  const config = require('../config');
  session.expiresAt = new Date(Date.now() + config.session.lifetime);
  session.lastActivityAt = new Date();
  await session.save();

  logger.info('Session refreshed', {
    userId: req.user.id,
    sessionId: session.sessionId
  });

  res.json({
    message: 'Session refreshed successfully',
    expiresAt: session.expiresAt
  });
}));

module.exports = router;
