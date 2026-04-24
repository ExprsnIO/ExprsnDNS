/**
 * ═══════════════════════════════════════════════════════════
 * Email Service
 * Multi-provider email service with template support
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');
const { logger } = require('@exprsn/shared');

class EmailService {
  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'smtp';
    this.from = process.env.EMAIL_FROM || 'noreply@exprsn.io';
    this.client = null;
    this.templatesDir = path.join(__dirname, '../templates/emails');
    this.compiledTemplates = new Map();
  }

  /**
   * Initialize email service
   */
  async initialize() {
    try {
      switch (this.provider) {
        case 'smtp':
          await this.initializeSMTP();
          break;
        case 'sendgrid':
          await this.initializeSendGrid();
          break;
        case 'ses':
          await this.initializeSES();
          break;
        case 'mailgun':
          await this.initializeMailgun();
          break;
        default:
          throw new Error(`Unsupported email provider: ${this.provider}`);
      }
      logger.info('Email service initialized', { provider: this.provider });
    } catch (error) {
      logger.error('Failed to initialize email service', {
        provider: this.provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize SMTP (Nodemailer)
   */
  async initializeSMTP() {
    const nodemailer = require('nodemailer');

    this.client = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    // Verify connection
    await this.client.verify();
    logger.info('SMTP connection verified');
  }

  /**
   * Initialize SendGrid
   */
  async initializeSendGrid() {
    const sgMail = require('@sendgrid/mail');

    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY not configured');
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    this.client = sgMail;
    logger.info('SendGrid initialized');
  }

  /**
   * Initialize AWS SES
   */
  async initializeSES() {
    const { SESClient } = require('@aws-sdk/client-ses');

    if (!process.env.AWS_REGION) {
      throw new Error('AWS_REGION not configured');
    }

    this.client = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    logger.info('AWS SES initialized');
  }

  /**
   * Initialize Mailgun
   */
  async initializeMailgun() {
    const formData = require('form-data');
    const Mailgun = require('mailgun.js');

    if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
      throw new Error('MAILGUN_API_KEY or MAILGUN_DOMAIN not configured');
    }

    const mailgun = new Mailgun(formData);
    this.client = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY
    });
    this.mailgunDomain = process.env.MAILGUN_DOMAIN;
    logger.info('Mailgun initialized');
  }

  /**
   * Load and compile email template
   */
  async loadTemplate(templateName) {
    // Check cache
    if (this.compiledTemplates.has(templateName)) {
      return this.compiledTemplates.get(templateName);
    }

    try {
      const htmlPath = path.join(this.templatesDir, `${templateName}.html`);
      const textPath = path.join(this.templatesDir, `${templateName}.txt`);

      const [htmlContent, textContent] = await Promise.all([
        fs.readFile(htmlPath, 'utf-8'),
        fs.readFile(textPath, 'utf-8').catch(() => null) // Text version is optional
      ]);

      const compiled = {
        html: handlebars.compile(htmlContent),
        text: textContent ? handlebars.compile(textContent) : null
      };

      this.compiledTemplates.set(templateName, compiled);
      return compiled;
    } catch (error) {
      logger.error('Failed to load email template', {
        templateName,
        error: error.message
      });
      throw new Error(`Email template not found: ${templateName}`);
    }
  }

  /**
   * Send email using configured provider
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      switch (this.provider) {
        case 'smtp':
          await this.sendSMTP({ to, subject, html, text });
          break;
        case 'sendgrid':
          await this.sendSendGrid({ to, subject, html, text });
          break;
        case 'ses':
          await this.sendSES({ to, subject, html, text });
          break;
        case 'mailgun':
          await this.sendMailgun({ to, subject, html, text });
          break;
      }

      logger.info('Email sent successfully', { to, subject, provider: this.provider });
      return true;
    } catch (error) {
      logger.error('Failed to send email', {
        to,
        subject,
        provider: this.provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send email via SMTP
   */
  async sendSMTP({ to, subject, html, text }) {
    await this.client.sendMail({
      from: this.from,
      to,
      subject,
      html,
      text: text || this.stripHtml(html)
    });
  }

  /**
   * Send email via SendGrid
   */
  async sendSendGrid({ to, subject, html, text }) {
    await this.client.send({
      from: this.from,
      to,
      subject,
      html,
      text: text || this.stripHtml(html)
    });
  }

  /**
   * Send email via AWS SES
   */
  async sendSES({ to, subject, html, text }) {
    const { SendEmailCommand } = require('@aws-sdk/client-ses');

    const command = new SendEmailCommand({
      Source: this.from,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: html,
            Charset: 'UTF-8'
          },
          Text: {
            Data: text || this.stripHtml(html),
            Charset: 'UTF-8'
          }
        }
      }
    });

    await this.client.send(command);
  }

  /**
   * Send email via Mailgun
   */
  async sendMailgun({ to, subject, html, text }) {
    await this.client.messages.create(this.mailgunDomain, {
      from: this.from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || this.stripHtml(html)
    });
  }

  /**
   * Strip HTML tags for plain text fallback
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(user, token) {
    const template = await this.loadTemplate('verification');
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:3001'}/verify-email?token=${token}`;

    const html = template.html({
      displayName: user.displayName || user.email,
      verificationUrl,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001'
    });

    const text = template.text ? template.text({
      displayName: user.displayName || user.email,
      verificationUrl,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001'
    }) : null;

    await this.sendEmail({
      to: user.email,
      subject: 'Verify Your Email Address',
      html,
      text
    });

    logger.info('Verification email sent', { userId: user.id, email: user.email });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, token) {
    const template = await this.loadTemplate('password-reset');
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3001'}/reset-password?token=${token}`;

    const html = template.html({
      displayName: user.displayName || user.email,
      resetUrl,
      expiryMinutes: 60,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001'
    });

    const text = template.text ? template.text({
      displayName: user.displayName || user.email,
      resetUrl,
      expiryMinutes: 60,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001'
    }) : null;

    await this.sendEmail({
      to: user.email,
      subject: 'Reset Your Password',
      html,
      text
    });

    logger.info('Password reset email sent', { userId: user.id, email: user.email });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user) {
    const template = await this.loadTemplate('welcome');

    const html = template.html({
      displayName: user.displayName || user.email,
      email: user.email,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001',
      dashboardUrl: `${process.env.APP_URL || 'http://localhost:3001'}/dashboard`
    });

    const text = template.text ? template.text({
      displayName: user.displayName || user.email,
      email: user.email,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001',
      dashboardUrl: `${process.env.APP_URL || 'http://localhost:3001'}/dashboard`
    }) : null;

    await this.sendEmail({
      to: user.email,
      subject: 'Welcome to Exprsn!',
      html,
      text
    });

    logger.info('Welcome email sent', { userId: user.id, email: user.email });
  }

  /**
   * Send security alert email
   */
  async sendSecurityAlertEmail(user, event) {
    const template = await this.loadTemplate('security-alert');

    const html = template.html({
      displayName: user.displayName || user.email,
      eventType: event.type,
      eventDescription: event.description,
      timestamp: new Date(event.timestamp).toLocaleString(),
      ipAddress: event.ipAddress || 'Unknown',
      userAgent: event.userAgent || 'Unknown',
      location: event.location || 'Unknown',
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001',
      securityUrl: `${process.env.APP_URL || 'http://localhost:3001'}/security`
    });

    const text = template.text ? template.text({
      displayName: user.displayName || user.email,
      eventType: event.type,
      eventDescription: event.description,
      timestamp: new Date(event.timestamp).toLocaleString(),
      ipAddress: event.ipAddress || 'Unknown',
      userAgent: event.userAgent || 'Unknown',
      location: event.location || 'Unknown',
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001',
      securityUrl: `${process.env.APP_URL || 'http://localhost:3001'}/security`
    }) : null;

    await this.sendEmail({
      to: user.email,
      subject: `Security Alert: ${event.type}`,
      html,
      text
    });

    logger.info('Security alert email sent', {
      userId: user.id,
      email: user.email,
      eventType: event.type
    });
  }

  /**
   * Send MFA backup codes email
   */
  async sendMFABackupCodesEmail(user, codes) {
    const template = await this.loadTemplate('mfa-backup-codes');

    const html = template.html({
      displayName: user.displayName || user.email,
      backupCodes: codes,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001',
      securityUrl: `${process.env.APP_URL || 'http://localhost:3001'}/security`
    });

    const text = template.text ? template.text({
      displayName: user.displayName || user.email,
      backupCodes: codes,
      appName: 'Exprsn',
      appUrl: process.env.APP_URL || 'http://localhost:3001',
      securityUrl: `${process.env.APP_URL || 'http://localhost:3001'}/security`
    }) : null;

    await this.sendEmail({
      to: user.email,
      subject: 'Your MFA Backup Codes',
      html,
      text
    });

    logger.info('MFA backup codes email sent', { userId: user.id, email: user.email });
  }
}

// Singleton instance
let emailService = null;

/**
 * Get email service instance
 */
async function getEmailService() {
  if (!emailService) {
    emailService = new EmailService();
    await emailService.initialize();
  }
  return emailService;
}

module.exports = {
  getEmailService,
  EmailService
};
