/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRL (Certificate Revocation List) Service
 * ═══════════════════════════════════════════════════════════════════════
 */

const forge = require('node-forge');
const { Certificate, RevocationList } = require('../models');
const { getStorage } = require('../storage');
const config = require('../config');
const logger = require('../utils/logger');

class CRLService {
  constructor() {
    this.currentCRL = null;
    this.crlNumber = 0;
    this.updateTimer = null;
  }

  /**
   * Initialize CRL service
   */
  async initialize() {
    logger.info('Initializing CRL service...');

    // Load current CRL number
    await this.loadCRLNumber();

    // Generate initial CRL
    await this.updateCRL();

    // Schedule automatic updates
    if (config.crl.enabled && config.crl.updateInterval > 0) {
      this.updateTimer = setInterval(() => {
        this.updateCRL().catch(error => {
          logger.error('Scheduled CRL update failed:', error);
        });
      }, config.crl.updateInterval * 1000);

      logger.info(`CRL updates scheduled every ${config.crl.updateInterval} seconds`);
    }
  }

  /**
   * Update/regenerate CRL
   */
  async updateCRL() {
    try {
      logger.info('Updating CRL...');

      // Get root CA certificate
      const rootCA = await Certificate.findOne({
        where: { type: 'root', status: 'active' }
      });

      if (!rootCA) {
        throw new Error('Root CA certificate not found');
      }

      // Get root CA private key
      const storage = getStorage();
      const privateKeyPem = await storage.getPrivateKey(rootCA.id);
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      const caCert = forge.pki.certificateFromPem(rootCA.certificatePem);

      // Get all revoked certificates
      const revocations = await RevocationList.findAll({
        order: [['revokedAt', 'ASC']]
      });

      // Create CRL
      const crl = forge.pki.createCertificateRevocationList();

      // Set issuer
      crl.issuer = caCert.subject;

      // Set validity
      crl.thisUpdate = new Date();
      const nextUpdate = new Date();
      nextUpdate.setDate(nextUpdate.getDate() + config.crl.nextUpdateDays);
      crl.nextUpdate = nextUpdate;

      // Increment CRL number
      this.crlNumber++;

      // Add extensions
      crl.setExtensions([
        {
          name: 'authorityKeyIdentifier',
          keyIdentifier: caCert.generateSubjectKeyIdentifier().getBytes()
        },
        {
          name: 'cRLNumber',
          cRLNumber: this.crlNumber
        }
      ]);

      // Add revoked certificates
      for (const revocation of revocations) {
        const revokedCert = {
          serialNumber: revocation.serialNumber,
          revocationDate: new Date(revocation.revokedAt)
        };

        // Add revocation reason extension
        if (revocation.reason && revocation.reason !== 'unspecified') {
          revokedCert.extensions = [
            {
              name: 'cRLReason',
              cRLReason: this.getReasonCode(revocation.reason)
            }
          ];
        }

        crl.addCertificate(revokedCert);
      }

      // Sign CRL
      crl.sign(privateKey, forge.md.sha256.create());

      // Convert to PEM
      const crlPem = forge.pki.pemFromCrl(crl);

      // Convert to DER for binary distribution
      const crlDer = forge.asn1.toDer(forge.pki.crlToAsn1(crl)).getBytes();

      // Save to storage
      await storage.saveCRL(Buffer.from(crlDer, 'binary'));

      this.currentCRL = {
        pem: crlPem,
        der: crlDer,
        crlNumber: this.crlNumber,
        thisUpdate: crl.thisUpdate,
        nextUpdate: crl.nextUpdate,
        revokedCount: revocations.length
      };

      logger.info('CRL updated successfully', {
        crlNumber: this.crlNumber,
        revokedCount: revocations.length,
        nextUpdate: crl.nextUpdate
      });

      return this.currentCRL;
    } catch (error) {
      logger.error('Failed to update CRL:', error);
      throw error;
    }
  }

  /**
   * Get current CRL
   */
  getCurrentCRL(format = 'pem') {
    if (!this.currentCRL) {
      throw new Error('CRL not available');
    }

    if (format === 'der') {
      return Buffer.from(this.currentCRL.der, 'binary');
    }

    return this.currentCRL.pem;
  }

  /**
   * Get CRL metadata
   */
  getCRLInfo() {
    if (!this.currentCRL) {
      return null;
    }

    return {
      crlNumber: this.currentCRL.crlNumber,
      thisUpdate: this.currentCRL.thisUpdate,
      nextUpdate: this.currentCRL.nextUpdate,
      revokedCount: this.currentCRL.revokedCount,
      url: config.crl.url
    };
  }

  /**
   * Load CRL number from database or storage
   */
  async loadCRLNumber() {
    // In production, this would load from persistent storage
    // For now, start from 1
    this.crlNumber = 1;
  }

  /**
   * Map revocation reason to code
   */
  getReasonCode(reason) {
    const reasonMap = {
      unspecified: 0,
      keyCompromise: 1,
      caCompromise: 2,
      affiliationChanged: 3,
      superseded: 4,
      cessationOfOperation: 5,
      certificateHold: 6,
      removeFromCRL: 8,
      privilegeWithdrawn: 9,
      aaCompromise: 10
    };

    return reasonMap[reason] || 0;
  }

  /**
   * Shutdown service
   */
  shutdown() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      logger.info('CRL service shut down');
    }
  }
}

module.exports = new CRLService();
