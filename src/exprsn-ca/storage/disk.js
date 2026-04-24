/**
 * ═══════════════════════════════════════════════════════════════════════
 * Disk Storage Adapter
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');

class DiskStorage {
  constructor(config) {
    this.basePath = config.path;
    this.certsPath = config.certs;
    this.keysPath = config.keys;
    this.crlPath = config.crl;
    this.ocspPath = config.ocsp;
  }

  async initialize() {
    // Create directories if they don't exist
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.mkdir(this.certsPath, { recursive: true });
    await fs.mkdir(this.keysPath, { recursive: true });
    await fs.mkdir(this.crlPath, { recursive: true });
    await fs.mkdir(this.ocspPath, { recursive: true });
  }

  async saveCertificate(id, data) {
    const filePath = path.join(this.certsPath, `${id}.pem`);
    await fs.writeFile(filePath, data, 'utf8');
    return filePath;
  }

  async getCertificate(id) {
    const filePath = path.join(this.certsPath, `${id}.pem`);
    return await fs.readFile(filePath, 'utf8');
  }

  async savePrivateKey(id, data) {
    const filePath = path.join(this.keysPath, `${id}.key`);
    await fs.writeFile(filePath, data, 'utf8');
    await fs.chmod(filePath, 0o600); // Restrict permissions
    return filePath;
  }

  async getPrivateKey(id) {
    const filePath = path.join(this.keysPath, `${id}.key`);
    return await fs.readFile(filePath, 'utf8');
  }

  async saveCRL(data) {
    const filePath = path.join(this.crlPath, 'ca.crl');
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async getCRL() {
    const filePath = path.join(this.crlPath, 'ca.crl');
    return await fs.readFile(filePath);
  }

  async deleteCertificate(id) {
    const filePath = path.join(this.certsPath, `${id}.pem`);
    await fs.unlink(filePath);
  }

  async deletePrivateKey(id) {
    const filePath = path.join(this.keysPath, `${id}.key`);
    await fs.unlink(filePath);
  }
}

module.exports = DiskStorage;
