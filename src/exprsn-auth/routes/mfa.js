/**
 * Multi-Factor Authentication Routes
 * Setup and verify TOTP, SMS, email, and hardware MFA
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const bcrypt = require('bcrypt');
const { getModels } = require('../models');
const { getServiceClient } = require('../../shared/utils/serviceClient');

const serviceClient = getServiceClient();

/**
 * GET /api/mfa/status
 * Get MFA status for current user
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const { MFAToken } = getModels();

    const mfaMethods = await MFAToken.findAll({
      where: { userId },
      attributes: ['id', 'method', 'enabled', 'verifiedAt', 'createdAt']
    });

    res.json({
      success: true,
      mfaEnabled: mfaMethods.some(m => m.enabled),
      methods: mfaMethods.map(m => ({
        id: m.id,
        method: m.method,
        enabled: m.enabled,
        verifiedAt: m.verifiedAt,
        createdAt: m.createdAt
      }))
    });

  } catch (error) {
    console.error('Get MFA status error:', error);
    res.status(500).json({
      error: 'GET_MFA_STATUS_FAILED',
      message: 'Failed to get MFA status'
    });
  }
});

/**
 * POST /api/mfa/totp/setup
 * Initialize TOTP (Time-based One-Time Password) setup
 */
router.post('/totp/setup', async (req, res) => {
  try {
    const userId = req.user.id;
    const { MFAToken } = getModels();

    // Check if TOTP already exists
    const existing = await MFAToken.findOne({
      where: { userId, method: 'totp' }
    });

    if (existing && existing.enabled) {
      return res.status(400).json({
        error: 'TOTP_ALREADY_ENABLED',
        message: 'TOTP is already enabled for this account'
      });
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `Exprsn (${req.user.email || userId})`,
      issuer: 'Exprsn'
    });

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Create or update MFA token record
    if (existing) {
      await existing.update({
        secret: secret.base32,
        backupCodes,
        enabled: false,
        verifiedAt: null
      });
    } else {
      await MFAToken.create({
        userId,
        method: 'totp',
        secret: secret.base32,
        backupCodes,
        enabled: false
      });
    }

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes,
      message: 'Scan the QR code with your authenticator app, then verify with a code'
    });

  } catch (error) {
    console.error('TOTP setup error:', error);
    res.status(500).json({
      error: 'TOTP_SETUP_FAILED',
      message: 'Failed to setup TOTP',
      details: error.message
    });
  }
});

/**
 * POST /api/mfa/totp/verify
 * Verify and enable TOTP
 */
router.post('/totp/verify', async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    const { MFAToken } = getModels();

    if (!code) {
      return res.status(400).json({
        error: 'MISSING_CODE',
        message: 'Verification code is required'
      });
    }

    const mfaToken = await MFAToken.findOne({
      where: { userId, method: 'totp' }
    });

    if (!mfaToken) {
      return res.status(404).json({
        error: 'TOTP_NOT_SETUP',
        message: 'TOTP has not been set up for this account'
      });
    }

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret: mfaToken.secret,
      encoding: 'base32',
      token: code,
      window: 2 // Allow 2 time steps before/after for clock skew
    });

    if (!verified) {
      return res.status(401).json({
        error: 'INVALID_CODE',
        message: 'Invalid verification code'
      });
    }

    // Enable TOTP
    await mfaToken.update({
      enabled: true,
      verifiedAt: new Date()
    });

    res.json({
      success: true,
      message: 'TOTP enabled successfully',
      backupCodes: mfaToken.backupCodes
    });

  } catch (error) {
    console.error('TOTP verification error:', error);
    res.status(500).json({
      error: 'TOTP_VERIFY_FAILED',
      message: 'Failed to verify TOTP',
      details: error.message
    });
  }
});

/**
 * POST /api/mfa/sms/setup
 * Setup SMS-based MFA
 */
router.post('/sms/setup', async (req, res) => {
  try {
    const userId = req.user.id;
    const { phoneNumber } = req.body;
    const { MFAToken } = getModels();

    if (!phoneNumber) {
      return res.status(400).json({
        error: 'MISSING_PHONE_NUMBER',
        message: 'Phone number is required'
      });
    }

    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        error: 'INVALID_PHONE_NUMBER',
        message: 'Phone number must be in E.164 format (e.g., +12345678900)'
      });
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Create or update MFA token record
    const [mfaToken] = await MFAToken.findOrCreate({
      where: { userId, method: 'sms' },
      defaults: {
        userId,
        method: 'sms',
        phoneNumber,
        secret: verificationCode,
        enabled: false
      }
    });

    if (!mfaToken.isNewRecord) {
      await mfaToken.update({
        phoneNumber,
        secret: verificationCode,
        enabled: false,
        verifiedAt: null
      });
    }

    // Send SMS with verification code
    const smsService = require('../services/smsService');

    const smsResult = await smsService.sendVerificationCode(phoneNumber, verificationCode);

    if (!smsResult.success && process.env.NODE_ENV === 'production') {
      logger.error('Failed to send SMS verification code', {
        phoneNumber,
        error: smsResult.error
      });
      // Don't fail the request - user can retry
    }

    res.json({
      success: true,
      message: 'Verification code sent to your phone',
      smsSent: smsResult.success,
      // Only return code in development mode
      ...(process.env.NODE_ENV === 'development' && { verificationCode })
    });

  } catch (error) {
    console.error('SMS setup error:', error);
    res.status(500).json({
      error: 'SMS_SETUP_FAILED',
      message: 'Failed to setup SMS MFA',
      details: error.message
    });
  }
});

/**
 * POST /api/mfa/sms/verify
 * Verify and enable SMS MFA
 */
router.post('/sms/verify', async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    const { MFAToken } = getModels();

    if (!code) {
      return res.status(400).json({
        error: 'MISSING_CODE',
        message: 'Verification code is required'
      });
    }

    const mfaToken = await MFAToken.findOne({
      where: { userId, method: 'sms' }
    });

    if (!mfaToken) {
      return res.status(404).json({
        error: 'SMS_NOT_SETUP',
        message: 'SMS MFA has not been set up'
      });
    }

    // Verify code
    if (mfaToken.secret !== code) {
      return res.status(401).json({
        error: 'INVALID_CODE',
        message: 'Invalid verification code'
      });
    }

    // Enable SMS MFA
    await mfaToken.update({
      enabled: true,
      verifiedAt: new Date(),
      secret: null // Clear the verification code
    });

    res.json({
      success: true,
      message: 'SMS MFA enabled successfully'
    });

  } catch (error) {
    console.error('SMS verification error:', error);
    res.status(500).json({
      error: 'SMS_VERIFY_FAILED',
      message: 'Failed to verify SMS MFA',
      details: error.message
    });
  }
});

/**
 * POST /api/mfa/verify
 * Verify MFA code during login
 */
router.post('/verify', async (req, res) => {
  try {
    const userId = req.user.id;
    const { code, method, backupCode } = req.body;
    const { MFAToken } = getModels();

    if (!code && !backupCode) {
      return res.status(400).json({
        error: 'MISSING_CODE',
        message: 'Verification code or backup code is required'
      });
    }

    // If backup code provided
    if (backupCode) {
      const mfaMethods = await MFAToken.findAll({
        where: { userId, enabled: true }
      });

      for (const mfaToken of mfaMethods) {
        if (mfaToken.backupCodes && mfaToken.backupCodes.includes(backupCode)) {
          // Remove used backup code
          const updatedCodes = mfaToken.backupCodes.filter(c => c !== backupCode);
          await mfaToken.update({ backupCodes: updatedCodes });

          return res.json({
            success: true,
            message: 'Backup code verified',
            remainingBackupCodes: updatedCodes.length
          });
        }
      }

      return res.status(401).json({
        error: 'INVALID_BACKUP_CODE',
        message: 'Invalid backup code'
      });
    }

    // Regular MFA verification
    const mfaToken = await MFAToken.findOne({
      where: {
        userId,
        method: method || 'totp',
        enabled: true
      }
    });

    if (!mfaToken) {
      return res.status(404).json({
        error: 'MFA_NOT_ENABLED',
        message: 'MFA is not enabled for this account'
      });
    }

    let verified = false;

    switch (mfaToken.method) {
      case 'totp':
        verified = speakeasy.totp.verify({
          secret: mfaToken.secret,
          encoding: 'base32',
          token: code,
          window: 2
        });
        break;

      case 'sms':
      case 'email':
        verified = mfaToken.secret === code;
        break;

      default:
        return res.status(400).json({
          error: 'UNSUPPORTED_METHOD',
          message: `MFA method ${mfaToken.method} is not supported`
        });
    }

    if (!verified) {
      return res.status(401).json({
        error: 'INVALID_CODE',
        message: 'Invalid verification code'
      });
    }

    res.json({
      success: true,
      message: 'MFA verified successfully'
    });

  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json({
      error: 'MFA_VERIFY_FAILED',
      message: 'Failed to verify MFA',
      details: error.message
    });
  }
});

/**
 * DELETE /api/mfa/:method
 * Disable MFA method
 */
router.delete('/:method', async (req, res) => {
  try {
    const userId = req.user.id;
    const { method } = req.params;
    const { password } = req.body;
    const { MFAToken } = getModels();

    if (!password) {
      return res.status(400).json({
        error: 'MISSING_PASSWORD',
        message: 'Password confirmation is required to disable MFA'
      });
    }

    // Verify password with CA service
    const passwordValid = await verifyUserPassword(userId, password);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'INVALID_PASSWORD',
        message: 'Password verification failed'
      });
    }

    const mfaToken = await MFAToken.findOne({
      where: { userId, method }
    });

    if (!mfaToken) {
      return res.status(404).json({
        error: 'MFA_NOT_FOUND',
        message: 'MFA method not found'
      });
    }

    await mfaToken.destroy();

    res.json({
      success: true,
      message: `${method.toUpperCase()} MFA disabled successfully`
    });

  } catch (error) {
    console.error('Disable MFA error:', error);
    res.status(500).json({
      error: 'DISABLE_MFA_FAILED',
      message: 'Failed to disable MFA',
      details: error.message
    });
  }
});

/**
 * POST /api/mfa/backup-codes/regenerate
 * Regenerate backup codes
 */
router.post('/backup-codes/regenerate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;
    const { MFAToken } = getModels();

    if (!password) {
      return res.status(400).json({
        error: 'MISSING_PASSWORD',
        message: 'Password confirmation is required'
      });
    }

    // Verify password with CA service
    const passwordValid = await verifyUserPassword(userId, password);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'INVALID_PASSWORD',
        message: 'Password verification failed'
      });
    }

    // Find TOTP method (which stores backup codes)
    const mfaToken = await MFAToken.findOne({
      where: { userId, method: 'totp', enabled: true }
    });

    if (!mfaToken) {
      return res.status(404).json({
        error: 'TOTP_NOT_ENABLED',
        message: 'TOTP must be enabled to generate backup codes'
      });
    }

    // Generate new backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    await mfaToken.update({ backupCodes });

    res.json({
      success: true,
      backupCodes,
      message: 'Backup codes regenerated. Store these securely.'
    });

  } catch (error) {
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({
      error: 'REGENERATE_CODES_FAILED',
      message: 'Failed to regenerate backup codes',
      details: error.message
    });
  }
});

/**
 * Helper: Verify user password with CA service
 * @param {string} userId - User ID
 * @param {string} password - Password to verify
 * @returns {Promise<boolean>} - True if password is valid
 */
async function verifyUserPassword(userId, password) {
  try {
    // Call CA service to verify password
    const response = await serviceClient.request('ca', 'POST', '/api/auth/verify-password', {
      userId,
      password
    });

    return response && response.valid === true;
  } catch (error) {
    // If CA service returns 401, password is invalid
    if (error.response && error.response.status === 401) {
      return false;
    }

    // If user not found or other error, log and return false
    console.error('Password verification error:', error.message);
    return false;
  }
}

module.exports = router;
