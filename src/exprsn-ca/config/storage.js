/**
 * ═══════════════════════════════════════════════════════════════════════
 * Storage Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Storage backend configuration
 * Supports multiple storage backends: disk, S3, PostgreSQL
 */
module.exports = {
  /**
   * Storage backend type
   * @type {string} - 'disk', 's3', or 'postgresql'
   */
  type: process.env.STORAGE_TYPE || 'disk',

  /**
   * Disk storage configuration
   */
  disk: {
    /**
     * Base path for disk storage
     * @type {string}
     */
    path: process.env.STORAGE_DISK_PATH || './data/ca',

    /**
     * Certificates storage path
     * @type {string}
     */
    certs: process.env.STORAGE_DISK_CERTS_PATH || './data/ca/certs',

    /**
     * Private keys storage path
     * @type {string}
     */
    keys: process.env.STORAGE_DISK_KEYS_PATH || './data/ca/keys',

    /**
     * CRL storage path
     * @type {string}
     */
    crl: process.env.STORAGE_DISK_CRL_PATH || './data/ca/crl',

    /**
     * OCSP storage path
     * @type {string}
     */
    ocsp: process.env.STORAGE_DISK_OCSP_PATH || './data/ca/ocsp'
  },

  /**
   * S3 storage configuration
   */
  s3: {
    /**
     * AWS region
     * @type {string}
     */
    region: process.env.AWS_REGION || 'us-east-1',

    /**
     * AWS access key ID
     * @type {string|undefined}
     */
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,

    /**
     * AWS secret access key
     * @type {string|undefined}
     */
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

    /**
     * S3 bucket name
     * @type {string}
     */
    bucket: process.env.S3_BUCKET_NAME || 'exprsn-ca-certificates',

    /**
     * S3 key prefix for all objects
     * @type {string}
     */
    prefix: process.env.S3_BUCKET_PREFIX || 'ca/'
  }
};
