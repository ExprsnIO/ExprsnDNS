/**
 * ═══════════════════════════════════════════════════════════════════════
 * Database Storage Adapter
 * Stores certificate data in PostgreSQL (already handled by models)
 * ═══════════════════════════════════════════════════════════════════════
 */

const db = require('../models');

class DatabaseStorage {
  async initialize() {
    // Database is initialized via models
    return true;
  }

  async saveCertificate(id, data) {
    // Certificates are saved via Certificate model
    return id;
  }

  async getCertificate(id) {
    const cert = await db.Certificate.findByPk(id);
    return cert ? cert.certificatePem : null;
  }

  async savePrivateKey(id, data) {
    // Private keys are stored encrypted in Certificate model
    return id;
  }

  async getPrivateKey(id) {
    const cert = await db.Certificate.findByPk(id);
    return cert ? cert.privateKeyEncrypted : null;
  }

  async saveCRL(data) {
    // CRL is generated from RevocationList entries
    return 'database';
  }

  async getCRL() {
    // Generate CRL from RevocationList entries
    return Buffer.from('');
  }

  async deleteCertificate(id) {
    // Handled by model deletion
    return true;
  }

  async deletePrivateKey(id) {
    // Handled by model update
    return true;
  }
}

module.exports = DatabaseStorage;
