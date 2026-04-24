/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Cryptographic Operations
 * ═══════════════════════════════════════════════════════════════════════
 */

const forge = require('node-forge');
const crypto = require('crypto');
const { pki, asn1, md } = forge;

/**
 * Generate RSA key pair
 * @param {number} keySize - Key size in bits (2048, 4096)
 * @returns {Promise<{privateKey: string, publicKey: string}>}
 */
async function generateKeyPair(keySize = 2048) {
  return new Promise((resolve, reject) => {
    pki.rsa.generateKeyPair({ bits: keySize, workers: -1 }, (err, keypair) => {
      if (err) {
        return reject(err);
      }

      const privateKeyPem = pki.privateKeyToPem(keypair.privateKey);
      const publicKeyPem = pki.publicKeyToPem(keypair.publicKey);

      resolve({
        privateKey: privateKeyPem,
        publicKey: publicKeyPem,
        privateKeyObj: keypair.privateKey,
        publicKeyObj: keypair.publicKey
      });
    });
  });
}

/**
 * Generate root CA certificate
 * @param {Object} options - Certificate options
 * @returns {Promise<{certificate: string, privateKey: string, serialNumber: string}>}
 */
async function generateRootCertificate(options) {
  const {
    commonName,
    country = 'US',
    state = 'California',
    locality = 'San Francisco',
    organization = 'Exprsn IO',
    organizationalUnit = 'Certificate Authority',
    keySize = 4096,
    validityDays = 7300 // 20 years
  } = options;

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: country },
    { shortName: 'ST', value: state },
    { name: 'localityName', value: locality },
    { name: 'organizationName', value: organization },
    { shortName: 'OU', value: organizationalUnit }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed

  // Extensions for root CA
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      critical: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier'
    }
  ]);

  // Sign certificate
  cert.sign(privateKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    certificateObj: cert,
    privateKey,
    publicKey: pki.publicKeyToPem(publicKeyObj),
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter
  };
}

/**
 * Generate intermediate CA certificate
 * @param {Object} options - Certificate options
 * @returns {Promise<Object>}
 */
async function generateIntermediateCertificate(options) {
  const {
    commonName,
    country = 'US',
    state = 'California',
    locality = 'San Francisco',
    organization = 'Exprsn IO',
    organizationalUnit = 'Certificate Authority',
    keySize = 4096,
    validityDays = 3650, // 10 years
    issuerCert,
    issuerKey,
    pathLen = 0
  } = options;

  if (!issuerCert || !issuerKey) {
    throw new Error('Issuer certificate and key are required');
  }

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: country },
    { shortName: 'ST', value: state },
    { name: 'localityName', value: locality },
    { name: 'organizationName', value: organization },
    { shortName: 'OU', value: organizationalUnit }
  ];

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Extensions for intermediate CA
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
      pathLenConstraint: pathLen,
      critical: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      digitalSignature: true,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes()
    }
  ]);

  // Sign certificate
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    certificateObj: cert,
    privateKey,
    publicKey: pki.publicKeyToPem(publicKeyObj),
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter
  };
}

/**
 * Generate entity certificate (client, server, code signing)
 * @param {Object} options - Certificate options
 * @returns {Promise<Object>}
 */
async function generateEntityCertificate(options) {
  const {
    commonName,
    country,
    state,
    locality,
    organization,
    organizationalUnit,
    email,
    subjectAltNames = [],
    type = 'client', // client, server, code_signing
    keySize = 2048,
    validityDays = 365,
    issuerCert,
    issuerKey
  } = options;

  if (!issuerCert || !issuerKey) {
    throw new Error('Issuer certificate and key are required');
  }

  // Parse issuer cert and key
  const issuerCertObj = pki.certificateFromPem(issuerCert);
  const issuerKeyObj = pki.privateKeyFromPem(issuerKey);

  // Generate key pair
  const { privateKeyObj, publicKeyObj, privateKey } = await generateKeyPair(keySize);

  // Create certificate
  const cert = pki.createCertificate();
  cert.publicKey = publicKeyObj;
  cert.serialNumber = generateSerialNumber();

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notBefore.getDate() + validityDays);

  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  // Set subject
  const attrs = [
    { name: 'commonName', value: commonName }
  ];

  if (country) attrs.push({ name: 'countryName', value: country });
  if (state) attrs.push({ shortName: 'ST', value: state });
  if (locality) attrs.push({ name: 'localityName', value: locality });
  if (organization) attrs.push({ name: 'organizationName', value: organization });
  if (organizationalUnit) attrs.push({ shortName: 'OU', value: organizationalUnit });
  if (email) attrs.push({ name: 'emailAddress', value: email });

  cert.setSubject(attrs);
  cert.setIssuer(issuerCertObj.subject.attributes);

  // Build extensions based on type
  const extensions = [
    {
      name: 'basicConstraints',
      cA: false,
      critical: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: issuerCertObj.generateSubjectKeyIdentifier().getBytes()
    }
  ];

  // Key usage based on type
  if (type === 'client') {
    extensions.push({
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true
    });
    extensions.push({
      name: 'extKeyUsage',
      clientAuth: true
    });
  } else if (type === 'server') {
    extensions.push({
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true
    });
    extensions.push({
      name: 'extKeyUsage',
      serverAuth: true
    });
  } else if (type === 'code_signing') {
    extensions.push({
      name: 'keyUsage',
      digitalSignature: true,
      critical: true
    });
    extensions.push({
      name: 'extKeyUsage',
      codeSigning: true
    });
  }

  // Add Subject Alternative Names
  if (subjectAltNames.length > 0) {
    const altNames = subjectAltNames.map(name => {
      if (name.startsWith('IP:')) {
        return { type: 7, ip: name.substring(3) };
      } else if (name.startsWith('email:')) {
        return { type: 1, value: name.substring(6) };
      } else {
        return { type: 2, value: name }; // DNS
      }
    });

    extensions.push({
      name: 'subjectAltName',
      altNames
    });
  }

  cert.setExtensions(extensions);

  // Sign certificate
  cert.sign(issuerKeyObj, md.sha256.create());

  const certificatePem = pki.certificateToPem(cert);
  const fingerprint = calculateFingerprint(cert);

  return {
    certificate: certificatePem,
    certificateObj: cert,
    privateKey,
    publicKey: pki.publicKeyToPem(publicKeyObj),
    serialNumber: cert.serialNumber,
    fingerprint,
    notBefore,
    notAfter
  };
}

/**
 * Generate serial number for certificate
 * @returns {string} Hex serial number
 */
function generateSerialNumber() {
  const bytes = crypto.randomBytes(16);
  return bytes.toString('hex');
}

/**
 * Calculate SHA-256 fingerprint of certificate
 * @param {Object} cert - Forge certificate object
 * @returns {string} Hex fingerprint
 */
function calculateFingerprint(cert) {
  const der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
  const hash = crypto.createHash('sha256');
  hash.update(der, 'binary');
  return hash.digest('hex');
}

/**
 * Create RSA-SHA256-PSS signature (for tokens)
 * @param {string} data - Data to sign
 * @param {string} privateKeyPem - PEM-encoded private key
 * @returns {string} Base64-encoded signature
 */
function signData(data, privateKeyPem) {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  const digest = md.sha256.create();
  digest.update(data, 'utf8');

  // PSS padding
  const pss = forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 32
  });

  const signature = privateKey.sign(digest, pss);
  return forge.util.encode64(signature);
}

/**
 * Verify RSA-SHA256-PSS signature
 * @param {string} data - Original data
 * @param {string} signature - Base64-encoded signature
 * @param {string} publicKeyPem - PEM-encoded public key
 * @returns {boolean} Verification result
 */
function verifySignature(data, signature, publicKeyPem) {
  try {
    const publicKey = pki.publicKeyFromPem(publicKeyPem);
    const digest = md.sha256.create();
    digest.update(data, 'utf8');

    const signatureBytes = forge.util.decode64(signature);

    // PSS padding
    const pss = forge.pss.create({
      md: forge.md.sha256.create(),
      mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
      saltLength: 32
    });

    return publicKey.verify(digest.digest().bytes(), signatureBytes, pss);
  } catch (error) {
    return false;
  }
}

/**
 * Calculate SHA-256 checksum
 * @param {Object} data - Data object to hash
 * @returns {string} Hex checksum
 */
function calculateChecksum(data) {
  // Canonical JSON serialization (sorted keys)
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verify certificate chain
 * @param {string} certPem - Certificate to verify
 * @param {string[]} chainPems - Chain of CA certificates
 * @returns {boolean} Verification result
 */
function verifyCertificateChain(certPem, chainPems) {
  try {
    const cert = pki.certificateFromPem(certPem);
    const caStore = pki.createCaStore();

    // Add CA certificates to store
    for (const caPem of chainPems) {
      const caCert = pki.certificateFromPem(caPem);
      caStore.addCertificate(caCert);
    }

    // Verify certificate
    return pki.verifyCertificateChain(caStore, [cert]);
  } catch (error) {
    return false;
  }
}

/**
 * Encrypt private key with password
 * @param {string} privateKeyPem - PEM-encoded private key
 * @param {string} password - Encryption password
 * @returns {string} Encrypted PEM
 */
function encryptPrivateKey(privateKeyPem, password) {
  const privateKey = pki.privateKeyFromPem(privateKeyPem);
  return pki.encryptRsaPrivateKey(privateKey, password, {
    algorithm: 'aes256'
  });
}

/**
 * Decrypt private key with password
 * @param {string} encryptedPem - Encrypted PEM-encoded private key
 * @param {string} password - Decryption password
 * @returns {string} Decrypted PEM
 */
function decryptPrivateKey(encryptedPem, password) {
  const privateKey = pki.decryptRsaPrivateKey(encryptedPem, password);
  return pki.privateKeyToPem(privateKey);
}

module.exports = {
  generateKeyPair,
  generateRootCertificate,
  generateIntermediateCertificate,
  generateEntityCertificate,
  generateSerialNumber,
  calculateFingerprint,
  signData,
  verifySignature,
  calculateChecksum,
  verifyCertificateChain,
  encryptPrivateKey,
  decryptPrivateKey
};
