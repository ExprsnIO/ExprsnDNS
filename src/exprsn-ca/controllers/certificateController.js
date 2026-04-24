/**
 * ═══════════════════════════════════════════════════════════
 * Certificate Controller
 * ═══════════════════════════════════════════════════════════
 */

const certificateService = require('../services/certificate');
const { Certificate, AuditLog } = require('../models');
const logger = require('../config/logging');
const { ErrorTypes } = require('../middleware/errorHandler');

/**
 * List all certificates for the current user
 */
async function listCertificates(req, res) {
  try {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows: certificates } = await Certificate.findAndCountAll({
      where: { userId },
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          association: 'issuer',
          attributes: ['id', 'commonName', 'certificateType']
        }
      ]
    });

    const totalPages = Math.ceil(count / limit);

    res.render('certificates/index', {
      title: 'Certificates',
      certificates,
      pagination: {
        page,
        limit,
        totalPages,
        totalItems: count
      }
    });
  } catch (error) {
    logger.error('Error listing certificates', { error: error.message, stack: error.stack });
    throw ErrorTypes.INTERNAL_ERROR('Failed to load certificates');
  }
}

/**
 * Show certificate generation form
 */
async function showNewCertificateForm(req, res) {
  try {
    // Get available parent certificates (intermediate CAs)
    const parentCertificates = await Certificate.findAll({
      where: {
        userId: req.session.user.id,
        certificateType: 'intermediate',
        status: 'active'
      },
      attributes: ['id', 'commonName', 'certificateType'],
      order: [['createdAt', 'DESC']]
    });

    res.render('certificates/new', {
      title: 'Generate Certificate',
      parentCertificates,
      error: req.session.error || null,
      oldInput: req.session.oldInput || {}
    });

    delete req.session.error;
    delete req.session.oldInput;
  } catch (error) {
    logger.error('Error showing certificate form', { error: error.message, stack: error.stack });
    throw ErrorTypes.INTERNAL_ERROR('Failed to load certificate form');
  }
}

/**
 * Generate a new certificate
 */
async function generateCertificate(req, res) {
  try {
    const userId = req.session.user.id;
    const {
      commonName,
      certificateType,
      validityDays,
      parentCertificateId,
      keySize,
      organizationName,
      organizationUnit,
      locality,
      state,
      country
    } = req.body;

    const certificate = await certificateService.createEntityCertificate({
      userId,
      commonName,
      certificateType: certificateType || 'entity',
      validityDays: parseInt(validityDays) || 365,
      parentCertificateId: parentCertificateId || null,
      keySize: parseInt(keySize) || 2048,
      subject: {
        commonName,
        organizationName,
        organizationUnit,
        locality,
        state,
        country
      }
    });

    await AuditLog.log({
      userId,
      action: 'certificate.generated',
      status: 'success',
      severity: 'info',
      message: 'Certificate generated successfully',
      resourceType: 'certificate',
      resourceId: certificate.id,
      details: {
        commonName,
        certificateType,
        serialNumber: certificate.serialNumber
      }
    });

    logger.info('Certificate generated', {
      userId,
      certificateId: certificate.id,
      commonName
    });

    req.session.success = 'Certificate generated successfully';
    res.redirect(`/certificates/${certificate.id}`);
  } catch (error) {
    logger.error('Error generating certificate', { error: error.message, stack: error.stack });

    req.session.error = error.message || 'Failed to generate certificate';
    req.session.oldInput = req.body;
    res.redirect('/certificates/new');
  }
}

/**
 * View certificate details
 */
async function viewCertificate(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const certificate = await Certificate.findOne({
      where: { id },
      include: [
        {
          association: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName']
        },
        {
          association: 'issuer',
          attributes: ['id', 'commonName', 'certificateType']
        },
        {
          association: 'children',
          attributes: ['id', 'commonName', 'certificateType', 'status']
        }
      ]
    });

    if (!certificate) {
      throw ErrorTypes.NOT_FOUND('Certificate not found');
    }

    // Check access - user must own certificate or have admin permission
    if (certificate.userId !== userId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to view this certificate');
    }

    // Get certificate tokens
    const Token = require('../models/Token');
    const tokens = await Token.findAll({
      where: { certificateId: id },
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'status', 'expiryType', 'expiresAt', 'createdAt']
    });

    res.render('certificates/view', {
      title: `Certificate: ${certificate.commonName}`,
      certificate,
      tokens,
      success: req.session.success || null
    });

    delete req.session.success;
  } catch (error) {
    logger.error('Error viewing certificate', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Download certificate (PEM format)
 */
async function downloadCertificate(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const certificate = await Certificate.findOne({
      where: { id }
    });

    if (!certificate) {
      throw ErrorTypes.NOT_FOUND('Certificate not found');
    }

    // Check access
    if (certificate.userId !== userId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to download this certificate');
    }

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${certificate.commonName}.pem"`);
    res.send(certificate.certificatePem);
  } catch (error) {
    logger.error('Error downloading certificate', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Show certificate revocation form
 */
async function showRevokeCertificateForm(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    const certificate = await Certificate.findOne({
      where: { id }
    });

    if (!certificate) {
      throw ErrorTypes.NOT_FOUND('Certificate not found');
    }

    if (certificate.userId !== userId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to revoke this certificate');
    }

    if (certificate.status === 'revoked') {
      req.session.error = 'Certificate is already revoked';
      return res.redirect(`/certificates/${id}`);
    }

    res.render('certificates/revoke', {
      title: 'Revoke Certificate',
      certificate
    });
  } catch (error) {
    logger.error('Error showing revoke form', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Revoke a certificate
 */
async function revokeCertificate(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { reason } = req.body;

    const certificate = await Certificate.findOne({
      where: { id }
    });

    if (!certificate) {
      throw ErrorTypes.NOT_FOUND('Certificate not found');
    }

    if (certificate.userId !== userId && !res.locals.hasPermission('admin:full')) {
      throw ErrorTypes.FORBIDDEN('You do not have permission to revoke this certificate');
    }

    await certificateService.revokeCertificate(id, reason || 'unspecified');

    await AuditLog.log({
      userId,
      action: 'certificate.revoked',
      status: 'success',
      severity: 'warning',
      message: 'Certificate revoked',
      resourceType: 'certificate',
      resourceId: id,
      details: {
        reason,
        serialNumber: certificate.serialNumber
      }
    });

    logger.info('Certificate revoked', { userId, certificateId: id, reason });

    req.session.success = 'Certificate revoked successfully';
    res.redirect(`/certificates/${id}`);
  } catch (error) {
    logger.error('Error revoking certificate', { error: error.message, stack: error.stack });

    req.session.error = error.message || 'Failed to revoke certificate';
    res.redirect(`/certificates/${id}`);
  }
}

module.exports = {
  listCertificates,
  showNewCertificateForm,
  generateCertificate,
  viewCertificate,
  downloadCertificate,
  showRevokeCertificateForm,
  revokeCertificate
};
