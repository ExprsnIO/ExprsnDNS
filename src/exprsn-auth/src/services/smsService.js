/**
 * ═══════════════════════════════════════════════════════════
 * SMS Service - Send SMS Messages for MFA
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

class SMSService {
  constructor() {
    this.enabled = process.env.SMS_ENABLED === 'true';
    this.provider = process.env.SMS_PROVIDER || 'twilio'; // twilio, aws-sns, mock
    this.from = process.env.SMS_FROM_NUMBER;

    // Initialize provider
    if (this.enabled) {
      this._initializeProvider();
    }
  }

  /**
   * Initialize SMS provider
   * @private
   */
  _initializeProvider() {
    if (this.provider === 'twilio') {
      try {
        const twilio = require('twilio');
        this.client = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        logger.info('Twilio SMS client initialized');
      } catch (error) {
        logger.error('Failed to initialize Twilio', { error: error.message });
        this.enabled = false;
      }
    } else if (this.provider === 'aws-sns') {
      try {
        const AWS = require('aws-sdk');
        this.client = new AWS.SNS({
          region: process.env.AWS_REGION || 'us-east-1',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        });
        logger.info('AWS SNS SMS client initialized');
      } catch (error) {
        logger.error('Failed to initialize AWS SNS', { error: error.message });
        this.enabled = false;
      }
    } else if (this.provider === 'mock') {
      logger.info('Mock SMS provider initialized (logs only)');
    }
  }

  /**
   * Send SMS message
   * @param {string} to - Phone number (E.164 format)
   * @param {string} message - Message text
   * @returns {Promise<Object>} Result
   */
  async send(to, message) {
    if (!this.enabled) {
      logger.warn('SMS service disabled, would send:', { to, message });
      return {
        success: false,
        reason: 'SMS service disabled',
        messageId: null
      };
    }

    try {
      let result;

      if (this.provider === 'twilio') {
        result = await this._sendViaTwilio(to, message);
      } else if (this.provider === 'aws-sns') {
        result = await this._sendViaAWS(to, message);
      } else if (this.provider === 'mock') {
        result = await this._sendViaMock(to, message);
      } else {
        throw new Error(`Unknown SMS provider: ${this.provider}`);
      }

      logger.info('SMS sent successfully', {
        to,
        provider: this.provider,
        messageId: result.messageId
      });

      return {
        success: true,
        messageId: result.messageId,
        provider: this.provider
      };

    } catch (error) {
      logger.error('Failed to send SMS', {
        to,
        provider: this.provider,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send SMS via Twilio
   * @private
   */
  async _sendViaTwilio(to, body) {
    const message = await this.client.messages.create({
      body,
      from: this.from,
      to
    });

    return {
      messageId: message.sid,
      status: message.status
    };
  }

  /**
   * Send SMS via AWS SNS
   * @private
   */
  async _sendViaAWS(to, message) {
    const params = {
      Message: message,
      PhoneNumber: to,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    };

    const result = await this.client.publish(params).promise();

    return {
      messageId: result.MessageId,
      status: 'sent'
    };
  }

  /**
   * Mock SMS send (for development/testing)
   * @private
   */
  async _sendViaMock(to, message) {
    logger.info('[MOCK SMS]', { to, message });

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      messageId: `mock-${Date.now()}`,
      status: 'sent'
    };
  }

  /**
   * Send MFA verification code via SMS
   * @param {string} phoneNumber - Phone number (E.164)
   * @param {string} code - Verification code
   * @returns {Promise<Object>} Result
   */
  async sendVerificationCode(phoneNumber, code) {
    const message = `Your Exprsn verification code is: ${code}. This code expires in 10 minutes.`;

    return this.send(phoneNumber, message);
  }

  /**
   * Send security alert SMS
   * @param {string} phoneNumber - Phone number
   * @param {string} alertType - Type of alert
   * @returns {Promise<Object>} Result
   */
  async sendSecurityAlert(phoneNumber, alertType) {
    const messages = {
      'password_changed': 'Your Exprsn password was just changed. If this wasn\'t you, please secure your account immediately.',
      'mfa_disabled': 'Two-factor authentication was disabled on your Exprsn account.',
      'new_device': 'A new device just logged into your Exprsn account.',
      'failed_logins': 'Multiple failed login attempts detected on your Exprsn account.'
    };

    const message = messages[alertType] || 'Security alert for your Exprsn account.';

    return this.send(phoneNumber, message);
  }

  /**
   * Format phone number to E.164
   * @param {string} phoneNumber - Phone number
   * @param {string} countryCode - Country code (default: US)
   * @returns {string} Formatted number
   */
  formatPhoneNumber(phoneNumber, countryCode = 'US') {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');

    // If already has country code, return as-is
    if (digits.length > 10 && digits.startsWith('1')) {
      return `+${digits}`;
    }

    // Add US country code by default
    if (countryCode === 'US' && digits.length === 10) {
      return `+1${digits}`;
    }

    // For other countries, require full format
    return `+${digits}`;
  }

  /**
   * Validate phone number format
   * @param {string} phoneNumber - Phone number
   * @returns {boolean} Valid
   */
  isValidPhoneNumber(phoneNumber) {
    // Basic E.164 format validation
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }
}

// Singleton instance
const smsService = new SMSService();

module.exports = smsService;
