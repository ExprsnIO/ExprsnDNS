/**
 * ═══════════════════════════════════════════════════════════════════════
 * Configuration Validator Module
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Validates the configuration for production readiness
 * Checks for required settings and security best practices
 *
 * @param {Object} config - The configuration object to validate
 * @returns {Array<string>} Array of validation error messages (empty if valid)
 */
function validateConfig(config) {
  const errors = [];

  // ─────────────────────────────────────────────────────────────────────
  // JWT Configuration Validation
  // ─────────────────────────────────────────────────────────────────────
  if (!config.jwt.privateKey || !config.jwt.publicKey) {
    errors.push('JWT keys not configured. Run setup script to generate keys.');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Session Secret Validation
  // ─────────────────────────────────────────────────────────────────────
  if (config.session.secret === 'exprsn-ca-secret-change-me') {
    errors.push('SESSION_SECRET not configured. Please set a secure random value.');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Storage Configuration Validation
  // ─────────────────────────────────────────────────────────────────────
  if (config.storage.type === 's3') {
    if (!config.storage.s3.accessKeyId || !config.storage.s3.secretAccessKey) {
      errors.push('S3 storage selected but AWS credentials not configured.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Database Configuration Validation
  // ─────────────────────────────────────────────────────────────────────
  if (!config.database.password && config.app.env === 'production') {
    errors.push('Database password not set. Required for production environments.');
  }

  // ─────────────────────────────────────────────────────────────────────
  // HTTPS/Security Validation for Production
  // ─────────────────────────────────────────────────────────────────────
  if (config.app.env === 'production') {
    if (!config.session.secure) {
      errors.push('SESSION_SECURE should be enabled in production (requires HTTPS).');
    }

    if (config.security.bcryptRounds < 10) {
      errors.push('BCRYPT_ROUNDS should be at least 10 in production.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // CA Configuration Validation
  // ─────────────────────────────────────────────────────────────────────
  if (config.ca.keySize.root < 2048) {
    errors.push('Root CA key size should be at least 2048 bits.');
  }

  if (config.ca.keySize.intermediate < 2048) {
    errors.push('Intermediate CA key size should be at least 2048 bits.');
  }

  if (config.ca.keySize.entity < 2048) {
    errors.push('Entity certificate key size should be at least 2048 bits.');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Error Handling
  // ─────────────────────────────────────────────────────────────────────
  if (errors.length > 0 && config.app.env === 'production') {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('Configuration Validation Errors:');
    console.error('═══════════════════════════════════════════════════════════');
    errors.forEach(err => console.error(`  ✗ ${err}`));
    console.error('═══════════════════════════════════════════════════════════');
    process.exit(1);
  }

  return errors;
}

/**
 * Validates a specific configuration module
 *
 * @param {string} moduleName - Name of the module to validate
 * @param {Object} moduleConfig - The module configuration
 * @returns {Array<string>} Array of validation errors
 */
function validateModule(moduleName, moduleConfig) {
  const errors = [];

  // Add module-specific validation as needed
  switch (moduleName) {
    case 'database':
      if (!moduleConfig.host) {
        errors.push('Database host is required');
      }
      if (!moduleConfig.database) {
        errors.push('Database name is required');
      }
      break;

    case 'cache':
      if (moduleConfig.enabled && !moduleConfig.host) {
        errors.push('Redis host is required when caching is enabled');
      }
      break;

    case 'storage':
      if (!['disk', 's3', 'postgresql'].includes(moduleConfig.type)) {
        errors.push('Invalid storage type. Must be: disk, s3, or postgresql');
      }
      break;

    // Add more module-specific validations as needed
  }

  return errors;
}

module.exports = {
  validateConfig,
  validateModule
};
