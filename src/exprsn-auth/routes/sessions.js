/**
 * Session Management Routes
 * View, manage, and revoke active sessions
 */

const express = require('express');
const router = express.Router();
const { getServiceClient } = require('../../shared/utils/serviceClient');
const { getModels } = require('../models');

const serviceClient = getServiceClient();

/**
 * GET /api/sessions
 * List all sessions for current user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { Session } = getModels();

    const sessions = await Session.findAll({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          $gte: new Date()
        }
      },
      order: [['lastActivityAt', 'DESC']],
      attributes: [
        'id',
        'ipAddress',
        'userAgent',
        'deviceInfo',
        'createdAt',
        'lastActivityAt',
        'expiresAt'
      ]
    });

    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceInfo: s.deviceInfo,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        expiresAt: s.expiresAt,
        isCurrent: s.token === req.headers.authorization?.split(' ')[1]
      }))
    });

  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({
      error: 'LIST_SESSIONS_FAILED',
      message: 'Failed to list sessions'
    });
  }
});

/**
 * GET /api/sessions/:sessionId
 * Get details of a specific session
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { Session } = getModels();

    const session = await Session.findOne({
      where: {
        id: sessionId,
        userId
      }
    });

    if (!session) {
      return res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: 'Session not found'
      });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        deviceInfo: session.deviceInfo,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        revokedReason: session.revokedReason,
        isActive: !session.revokedAt && session.expiresAt > new Date()
      }
    });

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      error: 'GET_SESSION_FAILED',
      message: 'Failed to get session details'
    });
  }
});

/**
 * DELETE /api/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { Session } = getModels();

    const session = await Session.findOne({
      where: {
        id: sessionId,
        userId
      }
    });

    if (!session) {
      return res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: 'Session not found'
      });
    }

    if (session.revokedAt) {
      return res.status(400).json({
        error: 'SESSION_ALREADY_REVOKED',
        message: 'Session is already revoked'
      });
    }

    // Revoke session
    await session.update({
      revokedAt: new Date(),
      revokedReason: 'USER_REVOKED'
    });

    // Revoke associated CA token
    if (session.caTokenId) {
      try {
        await serviceClient.request('ca', 'POST', `/api/tokens/${session.caTokenId}/revoke`, {
          reason: 'SESSION_REVOKED'
        });
      } catch (error) {
        console.error('Failed to revoke CA token:', error);
      }
    }

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });

  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({
      error: 'REVOKE_SESSION_FAILED',
      message: 'Failed to revoke session',
      details: error.message
    });
  }
});

/**
 * DELETE /api/sessions
 * Revoke all sessions except current
 */
router.delete('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const currentToken = req.headers.authorization?.split(' ')[1];
    const { Session } = getModels();

    // Find all active sessions except current
    const sessions = await Session.findAll({
      where: {
        userId,
        revokedAt: null,
        token: { $ne: currentToken }
      }
    });

    // Revoke each session and its CA token
    const revoked = [];
    for (const session of sessions) {
      await session.update({
        revokedAt: new Date(),
        revokedReason: 'USER_REVOKED_ALL'
      });

      // Revoke CA token
      if (session.caTokenId) {
        try {
          await serviceClient.request('ca', 'POST', `/api/tokens/${session.caTokenId}/revoke`, {
            reason: 'SESSION_REVOKED_ALL'
          });
          revoked.push(session.id);
        } catch (error) {
          console.error(`Failed to revoke CA token for session ${session.id}:`, error);
        }
      }
    }

    res.json({
      success: true,
      message: `Revoked ${revoked.length} sessions`,
      revokedSessions: revoked
    });

  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({
      error: 'REVOKE_ALL_SESSIONS_FAILED',
      message: 'Failed to revoke sessions',
      details: error.message
    });
  }
});

/**
 * PUT /api/sessions/:sessionId/activity
 * Update last activity timestamp
 */
router.put('/:sessionId/activity', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { Session } = getModels();

    const session = await Session.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: null
      }
    });

    if (!session) {
      return res.status(404).json({
        error: 'SESSION_NOT_FOUND',
        message: 'Active session not found'
      });
    }

    // Update last activity
    await session.update({
      lastActivityAt: new Date()
    });

    res.json({
      success: true,
      message: 'Activity updated',
      lastActivityAt: session.lastActivityAt
    });

  } catch (error) {
    console.error('Update session activity error:', error);
    res.status(500).json({
      error: 'UPDATE_ACTIVITY_FAILED',
      message: 'Failed to update session activity'
    });
  }
});

/**
 * GET /api/sessions/history
 * Get session history including revoked sessions
 */
router.get('/history/all', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    const { Session } = getModels();

    const { count, rows: sessions } = await Session.findAndCountAll({
      where: { userId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'ipAddress',
        'userAgent',
        'deviceInfo',
        'createdAt',
        'lastActivityAt',
        'expiresAt',
        'revokedAt',
        'revokedReason'
      ]
    });

    res.json({
      success: true,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      sessions: sessions.map(s => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceInfo: s.deviceInfo,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
        revokedReason: s.revokedReason,
        status: s.revokedAt
          ? 'revoked'
          : s.expiresAt < new Date()
          ? 'expired'
          : 'active'
      }))
    });

  } catch (error) {
    console.error('Get session history error:', error);
    res.status(500).json({
      error: 'GET_HISTORY_FAILED',
      message: 'Failed to get session history'
    });
  }
});

module.exports = router;
