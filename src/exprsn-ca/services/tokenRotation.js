/**
 * ═══════════════════════════════════════════════════════════════════════
 * Token Rotation Service - Scheduled automatic token rotation
 * ═══════════════════════════════════════════════════════════════════════
 */

const cron = require('node-cron');
const { Token, Certificate, User, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Rotation job reference
let rotationJob = null;

/**
 * Rotate a single token
 */
async function rotateToken(oldToken) {
  try {
    // Get the certificate for signing the new token
    const certificate = await Certificate.findByPk(oldToken.certificateId);

    if (!certificate) {
      logger.error(`Certificate not found for token rotation: ${oldToken.certificateId}`);
      return null;
    }

    // Calculate new expiry based on rotation settings
    const rotationExtensionSeconds = parseInt(process.env.TOKEN_ROTATION_EXTENSION_SECONDS) || 3600;
    const expiresAt = Date.now() + (rotationExtensionSeconds * 1000);

    // Create new token with same permissions and resource
    const newTokenData = {
      version: oldToken.version,
      userId: oldToken.userId,
      certificateId: oldToken.certificateId,

      // Copy permissions
      permissionRead: oldToken.permissionRead,
      permissionWrite: oldToken.permissionWrite,
      permissionAppend: oldToken.permissionAppend,
      permissionDelete: oldToken.permissionDelete,
      permissionUpdate: oldToken.permissionUpdate,

      // Copy resource
      resourceType: oldToken.resourceType,
      resourceValue: oldToken.resourceValue,

      // New lifecycle
      expiryType: 'time',
      issuedAt: Date.now(),
      notBefore: Date.now(),
      expiresAt,

      // Token data with rotation tracking
      tokenData: {
        ...oldToken.tokenData,
        rotatedFrom: oldToken.id,
        rotationCount: (oldToken.tokenData?.rotationCount || 0) + 1,
        originalTokenId: oldToken.tokenData?.originalTokenId || oldToken.id
      },

      status: 'active'
    };

    // For use-based tokens, copy use limits
    if (oldToken.expiryType === 'use') {
      newTokenData.expiryType = 'use';
      newTokenData.maxUses = oldToken.maxUses;
      newTokenData.usesRemaining = oldToken.maxUses;
      newTokenData.useCount = 0;
    }

    // Import token service for signing
    const tokenService = require('./token');
    const newToken = await tokenService.generateToken(newTokenData, oldToken.userId);

    // Mark old token as revoked
    await oldToken.update({
      status: 'revoked',
      revokedAt: Date.now(),
      revokedReason: `Automatically rotated to token ${newToken.id}`
    });

    logger.info(`Token rotated: ${oldToken.id} -> ${newToken.id}`);

    await AuditLog.log({
      userId: oldToken.userId,
      action: 'token.rotated',
      resourceType: 'token',
      resourceId: newToken.id,
      status: 'success',
      severity: 'info',
      message: 'Token automatically rotated',
      details: {
        oldTokenId: oldToken.id,
        newTokenId: newToken.id,
        rotationCount: newTokenData.tokenData.rotationCount
      }
    });

    return newToken;
  } catch (error) {
    logger.error(`Failed to rotate token ${oldToken.id}:`, error);

    await AuditLog.log({
      userId: oldToken.userId,
      action: 'token.rotation.failed',
      resourceType: 'token',
      resourceId: oldToken.id,
      status: 'error',
      severity: 'error',
      message: 'Token rotation failed',
      details: { error: error.message }
    });

    return null;
  }
}

/**
 * Find tokens eligible for rotation
 */
async function findTokensForRotation() {
  try {
    const rotationThresholdMinutes = parseInt(process.env.TOKEN_ROTATION_THRESHOLD_MINUTES) || 60;
    const rotationThreshold = Date.now() + (rotationThresholdMinutes * 60 * 1000);

    // Find active tokens expiring soon
    const tokens = await Token.findAll({
      where: {
        status: 'active',
        expiryType: {
          [Op.in]: ['time', 'use']
        },
        expiresAt: {
          [Op.not]: null,
          [Op.lte]: rotationThreshold,
          [Op.gt]: Date.now()
        },
        // Optional: Check if token has rotation enabled in metadata
        [Op.or]: [
          { 'tokenData.autoRotate': { [Op.not]: false } },
          { 'tokenData.autoRotate': { [Op.is]: null } }
        ]
      },
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: Certificate, as: 'certificate', attributes: ['id', 'status'] }
      ]
    });

    logger.debug(`Found ${tokens.length} tokens eligible for rotation`);

    return tokens;
  } catch (error) {
    logger.error('Failed to find tokens for rotation:', error);
    return [];
  }
}

/**
 * Execute token rotation job
 */
async function executeRotation() {
  try {
    logger.info('Starting token rotation job');

    const tokens = await findTokensForRotation();

    if (tokens.length === 0) {
      logger.debug('No tokens eligible for rotation');
      return { rotated: 0, failed: 0 };
    }

    const results = {
      rotated: 0,
      failed: 0,
      total: tokens.length
    };

    // Process tokens in batches to avoid overwhelming the system
    const batchSize = parseInt(process.env.TOKEN_ROTATION_BATCH_SIZE) || 10;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (token) => {
          const newToken = await rotateToken(token);
          if (newToken) {
            results.rotated++;
          } else {
            results.failed++;
          }
        })
      );

      // Small delay between batches
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Token rotation job completed: ${results.rotated} rotated, ${results.failed} failed`);

    await AuditLog.log({
      action: 'system.token_rotation.completed',
      status: 'success',
      severity: 'info',
      message: 'Token rotation job completed',
      details: results
    });

    return results;
  } catch (error) {
    logger.error('Token rotation job error:', error);

    await AuditLog.log({
      action: 'system.token_rotation.error',
      status: 'error',
      severity: 'error',
      message: 'Token rotation job failed',
      details: { error: error.message }
    });

    return { rotated: 0, failed: 0, error: error.message };
  }
}

/**
 * Start scheduled token rotation
 */
function startScheduledRotation() {
  if (rotationJob) {
    logger.warn('Token rotation job already running');
    return;
  }

  const rotationEnabled = process.env.TOKEN_ROTATION_ENABLED === 'true';

  if (!rotationEnabled) {
    logger.info('Token rotation is disabled (TOKEN_ROTATION_ENABLED=false)');
    return;
  }

  // Default: every hour at minute 0
  const cronSchedule = process.env.TOKEN_ROTATION_SCHEDULE || '0 * * * *';

  try {
    // Validate cron expression
    if (!cron.validate(cronSchedule)) {
      logger.error(`Invalid cron schedule for token rotation: ${cronSchedule}`);
      return;
    }

    rotationJob = cron.schedule(cronSchedule, async () => {
      await executeRotation();
    });

    logger.info(`Token rotation scheduled: ${cronSchedule}`);

    // Log next execution time
    const nextDate = getNextRotationTime(cronSchedule);
    logger.info(`Next token rotation will run at: ${nextDate.toISOString()}`);

  } catch (error) {
    logger.error('Failed to start token rotation job:', error);
  }
}

/**
 * Stop scheduled token rotation
 */
function stopScheduledRotation() {
  if (rotationJob) {
    rotationJob.stop();
    rotationJob = null;
    logger.info('Token rotation job stopped');
  }
}

/**
 * Get next rotation execution time
 */
function getNextRotationTime(cronSchedule) {
  const cronParser = require('cron-parser');
  try {
    const interval = cronParser.parseExpression(cronSchedule);
    return interval.next().toDate();
  } catch (error) {
    logger.error('Failed to parse cron schedule:', error);
    return new Date();
  }
}

/**
 * Manual token rotation trigger (for testing/admin)
 */
async function manualRotation(req, res) {
  try {
    logger.info('Manual token rotation triggered');

    const results = await executeRotation();

    res.json({
      success: true,
      message: 'Token rotation completed',
      results
    });
  } catch (error) {
    logger.error('Manual token rotation error:', error);

    res.status(500).json({
      error: 'ROTATION_FAILED',
      message: 'Token rotation failed',
      details: error.message
    });
  }
}

/**
 * Rotate a specific token (manual)
 */
async function manualRotateToken(req, res) {
  try {
    const { tokenId } = req.params;

    const token = await Token.findByPk(tokenId);

    if (!token) {
      return res.status(404).json({
        error: 'TOKEN_NOT_FOUND',
        message: 'Token not found'
      });
    }

    if (token.status !== 'active') {
      return res.status(400).json({
        error: 'TOKEN_NOT_ACTIVE',
        message: 'Token must be active to rotate'
      });
    }

    const newToken = await rotateToken(token);

    if (!newToken) {
      return res.status(500).json({
        error: 'ROTATION_FAILED',
        message: 'Failed to rotate token'
      });
    }

    res.json({
      success: true,
      message: 'Token rotated successfully',
      oldTokenId: token.id,
      newTokenId: newToken.id,
      newToken: {
        id: newToken.id,
        expiresAt: newToken.expiresAt,
        rotationCount: newToken.tokenData.rotationCount
      }
    });
  } catch (error) {
    logger.error('Manual token rotation error:', error);

    res.status(500).json({
      error: 'ROTATION_FAILED',
      message: 'Token rotation failed',
      details: error.message
    });
  }
}

/**
 * Get rotation statistics
 */
async function getRotationStats(req, res) {
  try {
    const stats = {
      scheduled: !!rotationJob,
      schedule: process.env.TOKEN_ROTATION_SCHEDULE || '0 * * * *',
      nextRun: rotationJob ? getNextRotationTime(process.env.TOKEN_ROTATION_SCHEDULE || '0 * * * *') : null,
      thresholdMinutes: parseInt(process.env.TOKEN_ROTATION_THRESHOLD_MINUTES) || 60,
      batchSize: parseInt(process.env.TOKEN_ROTATION_BATCH_SIZE) || 10
    };

    // Count tokens eligible for rotation
    const eligibleTokens = await findTokensForRotation();
    stats.eligibleTokens = eligibleTokens.length;

    // Count recently rotated tokens (last 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentRotations = await Token.count({
      where: {
        'tokenData.rotatedFrom': { [Op.not]: null },
        createdAt: { [Op.gte]: new Date(oneDayAgo) }
      }
    });
    stats.recentRotations = recentRotations;

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get rotation stats:', error);

    res.status(500).json({
      error: 'STATS_FAILED',
      message: 'Failed to get rotation statistics',
      details: error.message
    });
  }
}

module.exports = {
  rotateToken,
  findTokensForRotation,
  executeRotation,
  startScheduledRotation,
  stopScheduledRotation,
  getNextRotationTime,
  manualRotation,
  manualRotateToken,
  getRotationStats
};
