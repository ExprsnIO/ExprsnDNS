/**
 * ═══════════════════════════════════════════════════════════════════════
 * Email Service - Send emails for password reset and notifications
 * ═══════════════════════════════════════════════════════════════════════
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../config');

// Email transporter singleton
let transporter = null;

/**
 * Initialize email transporter
 */
function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const emailConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  };

  // For development, use ethereal email if no SMTP configured
  if (!process.env.SMTP_HOST && process.env.NODE_ENV === 'development') {
    logger.warn('No SMTP configured, emails will be logged to console');
    transporter = {
      sendMail: async (options) => {
        logger.info('Email (Development Mode):', {
          to: options.to,
          subject: options.subject,
          text: options.text
        });
        return { messageId: 'dev-' + Date.now() };
      }
    };
  } else {
    transporter = nodemailer.createTransporter(emailConfig);
  }

  return transporter;
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, username, resetToken, initiatedBy = null) {
  try {
    const transporter = getTransporter();
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;
    const expiryMinutes = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 60;

    let initiatorText = '';
    if (initiatedBy) {
      initiatorText = `\n\nThis password reset was initiated by an administrator (${initiatedBy.username || initiatedBy.email}).`;
    }

    const emailOptions = {
      from: process.env.SMTP_FROM || 'noreply@exprsn.io',
      to: email,
      subject: 'Password Reset Request - Exprsn CA',
      text: `Hello ${username},

We received a request to reset your password for your Exprsn Certificate Authority account.${initiatorText}

To reset your password, please click the following link or paste it into your browser:

${resetUrl}

This link will expire in ${expiryMinutes} minutes.

If you did not request a password reset, please ignore this email and your password will remain unchanged.

For security reasons, this email was sent from a monitored address that cannot accept replies.

---
Exprsn Certificate Authority
${process.env.CA_DOMAIN || 'ca.exprsn.io'}`,
      html: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background: #3498db; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #777; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset Request</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${username}</strong>,</p>
      <p>We received a request to reset your password for your Exprsn Certificate Authority account.</p>
      ${initiatedBy ? `<div class="warning">This password reset was initiated by an administrator (<strong>${initiatedBy.username || initiatedBy.email}</strong>).</div>` : ''}
      <p>To reset your password, please click the button below:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; background: white; padding: 10px; border-radius: 4px;">${resetUrl}</p>
      <p><strong>This link will expire in ${expiryMinutes} minutes.</strong></p>
      <p>If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>
    </div>
    <div class="footer">
      <p>For security reasons, this email was sent from a monitored address that cannot accept replies.</p>
      <p>Exprsn Certificate Authority<br>${process.env.CA_DOMAIN || 'ca.exprsn.io'}</p>
    </div>
  </div>
</body>
</html>`
    };

    const info = await transporter.sendMail(emailOptions);
    logger.info(`Password reset email sent to ${email}`, { messageId: info.messageId });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send password reset email:', error);
    throw error;
  }
}

/**
 * Send password changed notification
 */
async function sendPasswordChangedEmail(email, username, ipAddress, changedBy = null) {
  try {
    const transporter = getTransporter();

    let changerText = 'You have successfully changed your password.';
    if (changedBy) {
      changerText = `Your password was changed by an administrator (${changedBy.username || changedBy.email}).`;
    }

    const emailOptions = {
      from: process.env.SMTP_FROM || 'noreply@exprsn.io',
      to: email,
      subject: 'Password Changed - Exprsn CA',
      text: `Hello ${username},

${changerText}

This notification confirms that your password was successfully changed.

IP Address: ${ipAddress}
Time: ${new Date().toLocaleString()}

If you did not make this change, please contact your administrator immediately.

---
Exprsn Certificate Authority
${process.env.CA_DOMAIN || 'ca.exprsn.io'}`,
      html: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .info-box { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #777; }
    .warning { background: #f8d7da; border-left: 4px solid #dc3545; padding: 12px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Password Changed</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${username}</strong>,</p>
      <p>${changerText}</p>
      <div class="info-box">
        <p><strong>Change Details:</strong></p>
        <p>IP Address: ${ipAddress}<br>
        Time: ${new Date().toLocaleString()}</p>
      </div>
      <div class="warning">
        <strong>Security Notice:</strong> If you did not make this change, please contact your administrator immediately.
      </div>
    </div>
    <div class="footer">
      <p>Exprsn Certificate Authority<br>${process.env.CA_DOMAIN || 'ca.exprsn.io'}</p>
    </div>
  </div>
</body>
</html>`
    };

    const info = await transporter.sendMail(emailOptions);
    logger.info(`Password changed notification sent to ${email}`, { messageId: info.messageId });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send password changed notification:', error);
    throw error;
  }
}

/**
 * Verify transporter configuration
 */
async function verifyTransporter() {
  try {
    const transporter = getTransporter();
    if (transporter.verify) {
      await transporter.verify();
      logger.info('Email transporter verified successfully');
      return true;
    }
    return true; // Dev mode transporter
  } catch (error) {
    logger.error('Email transporter verification failed:', error);
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  verifyTransporter,
  getTransporter
};
