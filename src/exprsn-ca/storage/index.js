/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Storage Layer Abstraction
 * ═══════════════════════════════════════════════════════════════════════
 */

const config = require('../config');
const DiskStorage = require('./disk');
const S3Storage = require('./s3');
const DatabaseStorage = require('./database');

/**
 * Get storage adapter based on configuration
 */
function getStorageAdapter() {
  const storageType = config.storage.type;

  switch (storageType) {
    case 'disk':
      return new DiskStorage(config.storage.disk);
    case 's3':
      return new S3Storage(config.storage.s3);
    case 'postgresql':
      return new DatabaseStorage();
    default:
      throw new Error(`Unknown storage type: ${storageType}`);
  }
}

// Singleton instance
let storageInstance = null;

module.exports = {
  getStorage: () => {
    if (!storageInstance) {
      storageInstance = getStorageAdapter();
    }
    return storageInstance;
  }
};
