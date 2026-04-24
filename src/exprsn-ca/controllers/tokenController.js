/**
 * ═══════════════════════════════════════════════════════════
 * Token Controller
 * ═══════════════════════════════════════════════════════════
 */

const tokenService = require('../services/token');
const { Token, Certificate, AuditLog } = require('../models');
const logger = require('../config/logging');
const { ErrorTypes } = require('../middleware/errorHandler');

/**
 * List all tokens for the current user
 */
async function listTokens(req, res) {
  try {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || 'all';

    const where = { userId };
    if (status !== 'all') {
      where.status = status;
    }

    const { count, rows: tokens } = await Token.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          association: 'certificate',
          attributes: ['id', 'commonName', 'status']
        }
      ]
    });

    const totalPages = Math.ceil(count / limit);

    // Get status counts for filter
    const statusCounts = await Token.findAll({
      where: { userId },
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', '*'), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const counts = {
      all: count,
      active: 0,
      expired: 0,
      revoked: 0
    };

    statusCounts.forEach(item => {
      counts[item.status] = parseInt(item.count);
    });

    res.render('tokens/index', {
      title: 'Tokens',
      tokens,
      counts,
      currentStatus: status,
      pagination: {
        page,
        limit,
        totalPages,
        totalItems: count
      }
    });
  } catch (error) {
    logger.error('Error listing tokens', { error: error.message, stack: error.stack });
    throw ErrorTypes.INTERNAL_ERROR('Failed to load tokens');
  }
}

/**
 * Show token generation form
 */
async function showNewTokenForm(req, res) {
  try {
    const userId = req.session.user.id;

    // Get user's active certificates
    const certificates = await Certificate.findAll({
      where: {
        userId,
        status: 'active'
      },
      attributes: ['id', 'commonName', 'certificateType', 'expiresAt'],
      order: [['createdAt', 'DESC']]
    });

    res.render('tokens/new', {
      title: 'Generate Token',
      certificates,
      error: req.session.error || null,
      oldInput: req.session.oldInput || {}
    });

    delete req.session.error;
    delete req.session.oldInput;
  } catch (error) {
    logger.error('Error showing token form', { error: error.message, stack: error.stack });
    throw ErrorTypes.INTERNAL_ERROR('Failed to load token form');
  }
}

/**
 * Generate a new token
 */
async function generateToken(req, res) {
  try {
    const userId = req.session.user.id;
    const {
      certificateId,
      resourceType,
      resourceValue,
      expiryType,
      expirySeconds,
      maxUses,
      permissionRead,
      permissionWrite,
      permissionAppend,
      permissionDelete,
      permissionUpdate,
      metadata
    } = req.body;

    const permissions = {
      read: permissionRead === 'on' || permissionRead === true,
      write: permissionWrite === 'on' || permissionWrite === true,
      append: permissionAppend === 'on' || permissionAppend === true,
      delete: permissionDelete === 'on' || permissionDelete === true,
      update: permissionUpdate === 'on' || permissionUpdate === true
    };

    const tokenData = {
      certificateId,
      permissions,
      resourceType,
      resourceValue,
      expiryType,
      ...(expiryType === 'time' && expirySeconds && { expirySeconds: parseInt(expirySeconds) }),
      ...(expiryType === 'use' && maxUses && { maxUses: parseInt(maxUses) }),
      ...(metadata && { tokenData: JSON.parse(metadata) })
    };

    const token = await tokenService.generateToken(tokenData, userId);

    await AuditLog.log({
      userId,
      action: 'token.generated',
      status: 'success',
      severity: 'info',
      message: 'Token generated successfully',
      resourceType: 'token',
      resourceId: token.id,
      details: {
        resourceType,
        resourceValue,
        expiryType,
        permissions
      }
    });

    logger.info('Token generated', {
      userId,
      tokenId: token.id,
      resourceType,
      expiryType
    });

    req.session.success = 'Token generated successfully';
    res.redirect(`/tokens/${token.id}`);
  } catch (error) {
    logger.error('Error generating token', { error: error.message, stack: error.stack });

    req.session.error = error.message || 'Failed to generate token';
    req.session.oldInput = req.body;
    res.redirect('/tokens/new');
  }
}

/**
 * View token details
 */
async function viewToken(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const token = await Token.findOne({
      where: { id },
      include: [
        {
          association: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName']
        },
        {
          association: 'certificate',
          attributes: ['id', 'commonName', 'certificateType', 'status']
        }
      ]
    });

    if (!token) {
      throw ErrorTypes.NOT_FOUND('Token not found');
    }

    // Check access
    if (token.userId !== userId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to view this token');
    }

    // Get token usage history (if available)
    const usageHistory = token.tokenData?.usageHistory || [];

    res.render('tokens/view', {
      title: `Token: ${token.id}`,
      token,
      usageHistory,
      success: req.session.success || null
    });

    delete req.session.success;
  } catch (error) {
    logger.error('Error viewing token', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Validate a token (API endpoint)
 */
async function validateToken(req, res) {
  try {
    const { token, resource } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: 'Token is required'
      });
    }

    const validation = await tokenService.validateToken(token, {
      resource,
      requiredPermissions: req.body.requiredPermissions
    });

    await AuditLog.log({
      userId: validation.token?.userId,
      action: 'token.validated',
      status: validation.valid ? 'success' : 'failure',
      severity: 'info',
      message: `Token validation ${validation.valid ? 'succeeded' : 'failed'}`,
      resourceType: 'token',
      resourceId: validation.token?.id,
      details: {
        valid: validation.valid,
        errors: validation.errors
      }
    });

    res.json({
      success: true,
      valid: validation.valid,
      errors: validation.errors,
      token: validation.valid ? {
        id: validation.token.id,
        permissions: validation.token.permissions,
        resourceType: validation.token.resourceType,
        resourceValue: validation.token.resourceValue
      } : null
    });
  } catch (error) {
    logger.error('Error validating token', { error: error.message, stack: error.stack });

    res.status(500).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Failed to validate token'
    });
  }
}

/**
 * Revoke a token
 */
async function revokeToken(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { reason } = req.body;

    const token = await Token.findOne({
      where: { id }
    });

    if (!token) {
      throw ErrorTypes.NOT_FOUND('Token not found');
    }

    if (token.userId !== userId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to revoke this token');
    }

    await tokenService.revokeToken(id, reason || 'Revoked by user');

    await AuditLog.log({
      userId,
      action: 'token.revoked',
      status: 'success',
      severity: 'warning',
      message: 'Token revoked',
      resourceType: 'token',
      resourceId: id,
      details: {
        reason
      }
    });

    logger.info('Token revoked', { userId, tokenId: id, reason });

    // For API requests
    if (req.path.startsWith('/api/')) {
      return res.json({
        success: true,
        message: 'Token revoked successfully'
      });
    }

    // For web requests
    req.session.success = 'Token revoked successfully';
    res.redirect(`/tokens/${id}`);
  } catch (error) {
    logger.error('Error revoking token', { error: error.message, stack: error.stack });

    if (req.path.startsWith('/api/')) {
      return res.status(500).json({
        success: false,
        error: 'REVOKE_FAILED',
        message: error.message || 'Failed to revoke token'
      });
    }

    req.session.error = error.message || 'Failed to revoke token';
    res.redirect(`/tokens/${id}`);
  }
}

/**
 * Delete a token
 */
async function deleteToken(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const token = await Token.findOne({
      where: { id }
    });

    if (!token) {
      throw ErrorTypes.NOT_FOUND('Token not found');
    }

    if (token.userId !== userId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to delete this token');
    }

    await token.destroy();

    await AuditLog.log({
      userId,
      action: 'token.deleted',
      status: 'success',
      severity: 'warning',
      message: 'Token deleted',
      resourceType: 'token',
      resourceId: id
    });

    logger.info('Token deleted', { userId, tokenId: id });

    if (req.path.startsWith('/api/')) {
      return res.json({
        success: true,
        message: 'Token deleted successfully'
      });
    }

    req.session.success = 'Token deleted successfully';
    res.redirect('/tokens');
  } catch (error) {
    logger.error('Error deleting token', { error: error.message, stack: error.stack });

    if (req.path.startsWith('/api/')) {
      return res.status(500).json({
        success: false,
        error: 'DELETE_FAILED',
        message: error.message || 'Failed to delete token'
      });
    }

    req.session.error = error.message || 'Failed to delete token';
    res.redirect('/tokens');
  }
}

module.exports = {
  listTokens,
  showNewTokenForm,
  generateToken,
  viewToken,
  validateToken,
  revokeToken,
  deleteToken
};
