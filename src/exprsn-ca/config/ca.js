/**
 * ═══════════════════════════════════════════════════════════════════════
 * Certificate Authority Configuration Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Certificate Authority settings
 * Defines CA identity, certificate validity periods, and key sizes
 */
module.exports = {
  /**
   * CA distinguished name fields
   */
  name: process.env.CA_NAME || 'Exprsn Root CA',
  domain: process.env.CA_DOMAIN || 'ca.exprsn.io',
  country: process.env.CA_COUNTRY || 'US',
  state: process.env.CA_STATE || 'California',
  locality: process.env.CA_LOCALITY || 'San Francisco',
  organization: process.env.CA_ORGANIZATION || 'Exprsn IO',
  organizationalUnit: process.env.CA_ORGANIZATIONAL_UNIT || 'Certificate Authority',
  email: process.env.CA_EMAIL || 'ca@exprsn.io',

  /**
   * Certificate validity periods (in days)
   */
  validity: {
    /**
     * Root CA certificate validity
     * @type {number} - Default: 7300 days (20 years)
     */
    root: parseInt(process.env.CA_ROOT_VALIDITY_DAYS, 10) || 7300,

    /**
     * Intermediate CA certificate validity
     * @type {number} - Default: 3650 days (10 years)
     */
    intermediate: parseInt(process.env.CA_INTERMEDIATE_VALIDITY_DAYS, 10) || 3650,

    /**
     * End entity certificate validity
     * @type {number} - Default: 365 days (1 year)
     */
    entity: parseInt(process.env.CA_ENTITY_VALIDITY_DAYS, 10) || 365
  },

  /**
   * RSA key sizes (in bits)
   */
  keySize: {
    /**
     * Root CA key size
     * @type {number} - Default: 4096 bits
     */
    root: parseInt(process.env.CA_ROOT_KEY_SIZE, 10) || 4096,

    /**
     * Intermediate CA key size
     * @type {number} - Default: 4096 bits
     */
    intermediate: parseInt(process.env.CA_INTERMEDIATE_KEY_SIZE, 10) || 4096,

    /**
     * End entity key size
     * @type {number} - Default: 2048 bits
     */
    entity: parseInt(process.env.CA_ENTITY_KEY_SIZE, 10) || 2048
  }
};
