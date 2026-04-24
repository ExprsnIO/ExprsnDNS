/**
 * ═══════════════════════════════════════════════════════════
 * SAML Configuration
 * SAML 2.0 Service Provider configuration
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

/**
 * SAML configuration
 */
const samlConfig = {
  // Enable/disable SAML
  enabled: process.env.SAML_ENABLED === 'true',

  // Service Provider (SP) configuration
  sp: {
    // Entity ID - unique identifier for this service provider
    entityId: process.env.SAML_ENTITY_ID || 'https://auth.exprsn.io',

    // Assertion Consumer Service (ACS) URL - where SAML responses are posted
    callbackUrl: process.env.SAML_CALLBACK_URL || 'http://localhost:3001/api/saml/callback',

    // Single Logout Service (SLS) URL
    logoutUrl: process.env.SAML_LOGOUT_URL || 'http://localhost:3001/api/saml/logout',
    logoutCallbackUrl: process.env.SAML_LOGOUT_CALLBACK_URL || 'http://localhost:3001/api/saml/logout/callback',

    // Certificate and private key for signing and encryption
    cert: loadCertificate(process.env.SAML_CERT_PATH),
    privateKey: loadPrivateKey(process.env.SAML_KEY_PATH),

    // Signature configuration
    signatureAlgorithm: 'sha256',
    digestAlgorithm: 'sha256',

    // Want assertions signed
    wantAssertionsSigned: process.env.SAML_WANT_ASSERTIONS_SIGNED !== 'false',

    // Want responses signed
    wantResponseSigned: process.env.SAML_WANT_RESPONSE_SIGNED !== 'false',

    // Request authentication context
    authnContext: [
      'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
      'urn:oasis:names:tc:SAML:2.0:ac:classes:Password'
    ],

    // NameID format
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',

    // Clock tolerance (in seconds) to account for time drift
    acceptedClockSkewMs: 5000
  },

  // Identity Provider (IdP) configuration
  // Can configure multiple identity providers
  identityProviders: getIdentityProviders(),

  // Attribute mapping - map SAML attributes to user fields
  attributeMapping: {
    email: process.env.SAML_ATTR_EMAIL || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    firstName: process.env.SAML_ATTR_FIRST_NAME || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    lastName: process.env.SAML_ATTR_LAST_NAME || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    displayName: process.env.SAML_ATTR_DISPLAY_NAME || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    groups: process.env.SAML_ATTR_GROUPS || 'http://schemas.xmlsoap.org/claims/Group',
    organizationId: process.env.SAML_ATTR_ORG_ID || 'organizationId'
  },

  // Options
  options: {
    // Automatically create user if not exists
    autoProvision: process.env.SAML_AUTO_PROVISION !== 'false',

    // Update user attributes on each login
    updateOnLogin: process.env.SAML_UPDATE_ON_LOGIN !== 'false',

    // Require email verification for auto-provisioned users
    requireEmailVerification: process.env.SAML_REQUIRE_EMAIL_VERIFICATION === 'true',

    // Default organization for auto-provisioned users
    defaultOrganizationId: process.env.SAML_DEFAULT_ORG_ID || null,

    // Map SAML groups to application groups
    mapGroups: process.env.SAML_MAP_GROUPS === 'true',

    // Session lifetime after SAML authentication (in milliseconds)
    sessionLifetime: parseInt(process.env.SAML_SESSION_LIFETIME) || 3600000 // 1 hour
  }
};

/**
 * Load certificate from file or environment variable
 */
function loadCertificate(certPath) {
  // Try environment variable first
  if (process.env.SAML_CERT) {
    return process.env.SAML_CERT;
  }

  // Try loading from file
  if (certPath && fs.existsSync(certPath)) {
    return fs.readFileSync(certPath, 'utf-8');
  }

  // Try default path
  const defaultPath = path.join(__dirname, '../../keys/saml-cert.pem');
  if (fs.existsSync(defaultPath)) {
    return fs.readFileSync(defaultPath, 'utf-8');
  }

  return null;
}

/**
 * Load private key from file or environment variable
 */
function loadPrivateKey(keyPath) {
  // Try environment variable first
  if (process.env.SAML_PRIVATE_KEY) {
    return process.env.SAML_PRIVATE_KEY;
  }

  // Try loading from file
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8');
  }

  // Try default path
  const defaultPath = path.join(__dirname, '../../keys/saml-key.pem');
  if (fs.existsSync(defaultPath)) {
    return fs.readFileSync(defaultPath, 'utf-8');
  }

  return null;
}

/**
 * Get identity providers configuration
 * Supports multiple IdPs from environment variables or config file
 */
function getIdentityProviders() {
  const providers = {};

  // Try to load from JSON config file
  const configPath = process.env.SAML_IDP_CONFIG_PATH;
  if (configPath && fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.identityProviders || config;
    } catch (error) {
      console.error('Failed to load SAML IdP config:', error.message);
    }
  }

  // Load default IdP from environment variables
  if (process.env.SAML_IDP_METADATA_URL || process.env.SAML_IDP_ENTITY_ID) {
    providers.default = {
      name: process.env.SAML_IDP_NAME || 'Default IdP',

      // Identity Provider Entity ID
      entityId: process.env.SAML_IDP_ENTITY_ID,

      // Single Sign-On Service URL
      ssoUrl: process.env.SAML_IDP_SSO_URL,

      // Single Logout Service URL
      sloUrl: process.env.SAML_IDP_SLO_URL,

      // IdP certificate for signature verification
      cert: loadIdpCertificate(process.env.SAML_IDP_CERT_PATH),

      // Metadata URL (alternative to manual configuration)
      metadataUrl: process.env.SAML_IDP_METADATA_URL,

      // Options
      options: {
        enabled: true,
        forceAuthn: process.env.SAML_IDP_FORCE_AUTHN === 'true',
        passive: process.env.SAML_IDP_PASSIVE === 'true'
      }
    };
  }

  return providers;
}

/**
 * Load IdP certificate
 */
function loadIdpCertificate(certPath) {
  // Try environment variable first
  if (process.env.SAML_IDP_CERT) {
    return process.env.SAML_IDP_CERT;
  }

  // Try loading from file
  if (certPath && fs.existsSync(certPath)) {
    return fs.readFileSync(certPath, 'utf-8');
  }

  return null;
}

/**
 * Get SAML strategy configuration for passport-saml
 */
function getSamlStrategyConfig(idpKey = 'default') {
  const idp = samlConfig.identityProviders[idpKey];

  if (!idp) {
    throw new Error(`SAML Identity Provider not found: ${idpKey}`);
  }

  const config = {
    // Service Provider
    callbackUrl: samlConfig.sp.callbackUrl,
    entryPoint: idp.ssoUrl,
    issuer: samlConfig.sp.entityId,
    cert: idp.cert,

    // Service Provider certificate/key
    decryptionPvk: samlConfig.sp.privateKey,
    privateCert: samlConfig.sp.privateKey,

    // Signature/encryption
    signatureAlgorithm: samlConfig.sp.signatureAlgorithm,
    digestAlgorithm: samlConfig.sp.digestAlgorithm,

    // Options
    identifierFormat: samlConfig.sp.identifierFormat,
    wantAssertionsSigned: samlConfig.sp.wantAssertionsSigned,
    wantAuthnResponseSigned: samlConfig.sp.wantResponseSigned,
    acceptedClockSkewMs: samlConfig.sp.acceptedClockSkewMs,

    // Logout
    logoutUrl: idp.sloUrl,
    logoutCallbackUrl: samlConfig.sp.logoutCallbackUrl,

    // Additional options
    forceAuthn: idp.options?.forceAuthn || false,
    passive: idp.options?.passive || false,
    authnContext: samlConfig.sp.authnContext
  };

  return config;
}

/**
 * Validate SAML configuration
 */
function validateConfig() {
  const errors = [];

  if (!samlConfig.enabled) {
    return { valid: true, message: 'SAML is disabled' };
  }

  // Check SP configuration
  if (!samlConfig.sp.entityId) {
    errors.push('SAML_ENTITY_ID is required');
  }

  if (!samlConfig.sp.callbackUrl) {
    errors.push('SAML_CALLBACK_URL is required');
  }

  if (!samlConfig.sp.cert) {
    errors.push('SAML certificate is required (SAML_CERT or SAML_CERT_PATH)');
  }

  if (!samlConfig.sp.privateKey) {
    errors.push('SAML private key is required (SAML_PRIVATE_KEY or SAML_KEY_PATH)');
  }

  // Check IdP configuration
  if (Object.keys(samlConfig.identityProviders).length === 0) {
    errors.push('At least one SAML Identity Provider must be configured');
  }

  for (const [key, idp] of Object.entries(samlConfig.identityProviders)) {
    if (!idp.entityId && !idp.metadataUrl) {
      errors.push(`IdP '${key}' requires entityId or metadataUrl`);
    }

    if (!idp.ssoUrl && !idp.metadataUrl) {
      errors.push(`IdP '${key}' requires ssoUrl or metadataUrl`);
    }

    if (!idp.cert && !idp.metadataUrl) {
      errors.push(`IdP '${key}' requires certificate or metadataUrl`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  ...samlConfig,
  getSamlStrategyConfig,
  validateConfig
};
