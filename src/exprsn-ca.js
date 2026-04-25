import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import forge from "node-forge";

/**
 * Embedded Exprsn-CA.
 *
 * In-process port of the upstream `src/exprsn-ca` service from
 * `ExprsnIO/Exprsn`. It reproduces the parts of the upstream contract that
 * ExprsnDNS depends on:
 *
 *   - Self-signed RSA root certificate, generated lazily on first start and
 *     persisted to a JSON datastore alongside its private key.
 *   - Entity (server/client) certificate issuance signed by the root.
 *   - Token issuance and validation with the upstream wire format:
 *     canonical JSON (`JSON.stringify(obj, Object.keys(obj).sort())`),
 *     SHA-256 checksum, RSA-PSS-SHA256 signature, salt length 32.
 *   - Permissions: read / write / append / delete / update.
 *   - Time-based and use-based expiry with atomic use-count decrement.
 *   - Revocation list for both certificates and tokens.
 *
 * The persistence format is a single JSON file so it is trivial to inspect.
 * It is intentionally synchronous on read at construction time (matching the
 * ExprsnDNS Storage class) and serialized on write.
 */

const DEFAULT_ROOT_KEY_SIZE = 2048;
const DEFAULT_ROOT_VALIDITY_DAYS = 365 * 20;
const DEFAULT_ENTITY_KEY_SIZE = 2048;
const DEFAULT_ENTITY_VALIDITY_DAYS = 365;
const DEFAULT_TOKEN_VALIDITY_MS = 24 * 60 * 60 * 1000;

export class ExprsnCA {
  constructor({
    dataPath,
    rootSubject = {
      commonName: "Exprsn Root CA",
      organization: "Exprsn",
      organizationalUnit: "Certificate Authority",
      country: "US",
    },
    rootKeySize = DEFAULT_ROOT_KEY_SIZE,
    rootValidityDays = DEFAULT_ROOT_VALIDITY_DAYS,
    entityKeySize = DEFAULT_ENTITY_KEY_SIZE,
    entityValidityDays = DEFAULT_ENTITY_VALIDITY_DAYS,
    tokenValidityMs = DEFAULT_TOKEN_VALIDITY_MS,
    serviceId = "exprsn-dns",
    logger = null,
  } = {}) {
    if (!dataPath) throw new Error("ExprsnCA requires dataPath");
    this.path = path.resolve(dataPath);
    this.rootSubject = rootSubject;
    this.rootKeySize = rootKeySize;
    this.rootValidityDays = rootValidityDays;
    this.entityKeySize = entityKeySize;
    this.entityValidityDays = entityValidityDays;
    this.tokenValidityMs = tokenValidityMs;
    this.serviceId = serviceId;
    this.logger = logger;

    this._writing = Promise.resolve();
    this._state = {
      root: null,
      certificates: new Map(),
      tokens: new Map(),
    };
    this._load();
  }

  get enabled() {
    return true;
  }

  get baseUrl() {
    return `embedded://${this.serviceId}`;
  }

  // ────────────────────────── persistence ───────────────────────────

  _load() {
    if (!fs.existsSync(this.path)) return;
    const raw = JSON.parse(fs.readFileSync(this.path, "utf8"));
    this._state.root = raw.root ?? null;
    for (const c of raw.certificates ?? []) {
      this._state.certificates.set(c.id, c);
    }
    for (const t of raw.tokens ?? []) {
      this._state.tokens.set(t.id, t);
    }
  }

  async _flush() {
    const payload = {
      root: this._state.root,
      certificates: [...this._state.certificates.values()],
      tokens: [...this._state.tokens.values()],
    };
    const dir = path.dirname(this.path);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.exprsn-ca-${process.pid}-${Date.now()}.tmp`);
    await fsp.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fsp.rename(tmp, this.path);
  }

  _serialize(work) {
    const next = this._writing.then(work, work);
    this._writing = next.catch(() => {});
    return next;
  }

  // ────────────────────────── root CA ───────────────────────────────

  async ensureRoot() {
    if (this._state.root) return this._state.root;
    this.logger?.info?.("[exprsn-ca] generating root CA");
    const root = generateSelfSignedRoot({
      subject: this.rootSubject,
      keySize: this.rootKeySize,
      validityDays: this.rootValidityDays,
    });
    this._state.root = root;
    await this._serialize(() => this._flush());
    return root;
  }

  getRoot() {
    return this._state.root;
  }

  rootCertificatePem() {
    return this._state.root?.certificatePem ?? null;
  }

  // ─────────────────────── certificate issuance ─────────────────────

  /**
   * Issue an entity certificate signed by the root CA.
   *
   * Mirrors the upstream `POST /api/certificates/generate` payload shape, with
   * the trimmed-down subject we actually use from ExprsnDNS:
   *
   *   { type, subject: { commonName, emailAddress },
   *     altNames: [{type:'dns'|'email', value}],
   *     keyUsage, extKeyUsage, keySize, validityDays, ownerId }
   */
  async issueCertificate({
    token,
    email,
    ownerId = null,
    altNames,
    keySize,
    validityDays,
  } = {}) {
    if (!token) throw new Error("issueCertificate requires `token` (commonName)");
    await this.ensureRoot();
    const certData = generateEntityCertificate({
      subject: { commonName: token, emailAddress: email },
      altNames: altNames ?? [
        { type: "dns", value: token },
        ...(email ? [{ type: "email", value: email }] : []),
      ],
      issuerCertPem: this._state.root.certificatePem,
      issuerPrivateKeyPem: this._state.root.privateKeyPem,
      keySize: keySize ?? this.entityKeySize,
      validityDays: validityDays ?? this.entityValidityDays,
    });
    const id = crypto.randomUUID();
    const cert = {
      id,
      type: "entity",
      ownerId,
      commonName: token,
      email: email ?? null,
      serialNumber: certData.serialNumber,
      fingerprint: certData.fingerprint,
      pem: certData.certificatePem,
      privateKeyPem: certData.privateKeyPem,
      notBefore: certData.notBefore,
      notAfter: certData.notAfter,
      status: "active",
      createdAt: Date.now(),
    };
    this._state.certificates.set(id, cert);
    await this._serialize(() => this._flush());
    return publicCertificate(cert);
  }

  getCertificate(id) {
    const c = this._state.certificates.get(id);
    return c ? publicCertificate(c) : null;
  }

  async revokeCertificate(id, reason = "unspecified") {
    const c = this._state.certificates.get(id);
    if (!c) throw new Error(`certificate not found: ${id}`);
    c.status = "revoked";
    c.revokedAt = Date.now();
    c.revocationReason = reason;
    await this._serialize(() => this._flush());
    return publicCertificate(c);
  }

  // ─────────────────────────── tokens ───────────────────────────────

  /**
   * Issue a signed token. Mirrors the upstream Token shape:
   *   id, version, issuer{domain,certificateSerial}, permissions{read,write,
   *   append,delete,update}, resource, data, issuedAt, notBefore, expiresAt,
   *   expiryType, maxUses?, useCount?, signature, checksum.
   *
   * The signature/checksum follow the canonical-JSON contract from
   * `ca-client.js` (and upstream `exprsn-ca/services/token.js`).
   */
  async issueToken({
    user,
    permissions = { read: true, write: false, append: false, delete: false, update: false },
    resource = null,
    data = null,
    expiryType = "time",
    expiresAt,
    maxUses = null,
    notBefore,
  } = {}) {
    if (!user?.id) throw new Error("issueToken requires user.id");
    await this.ensureRoot();
    const now = Date.now();
    const body = {
      id: crypto.randomUUID(),
      version: 1,
      issuer: {
        domain: this.rootSubject.commonName,
        certificateSerial: this._state.root.serialNumber,
      },
      permissions: normalizePermissions(permissions),
      resource,
      data,
      issuedAt: now,
      notBefore: notBefore ?? now,
      expiresAt: expiresAt ?? now + this.tokenValidityMs,
      expiryType,
    };
    if (expiryType === "use") {
      body.maxUses = maxUses ?? 1;
      body.useCount = 0;
    }
    const checksum = sha256Hex(canonicalTokenJson(body));
    const signature = signCanonical(body, this._state.root.privateKeyPem);
    const stored = {
      ...body,
      checksum,
      signature,
      status: "active",
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
    };
    this._state.tokens.set(stored.id, stored);
    await this._serialize(() => this._flush());
    return publicToken(stored);
  }

  /**
   * Validate a token by id. Returns the same shape as the HTTP CA validator:
   *   { valid, token, user, error }
   */
  async validateToken(tokenId, { resource, permission } = {}) {
    const t = this._state.tokens.get(tokenId);
    if (!t) return { valid: false, error: "token not found" };
    if (t.status === "revoked") return { valid: false, error: "token revoked" };
    const now = Date.now();
    if (now < t.notBefore) return { valid: false, error: "token not yet valid" };
    if (t.expiryType === "time" && now >= t.expiresAt) {
      return { valid: false, error: "token expired" };
    }
    if (t.expiryType === "use" && (t.useCount ?? 0) >= (t.maxUses ?? 0)) {
      return { valid: false, error: "token exhausted" };
    }
    // Canonical recompute. The body fields are exactly the ones we signed.
    const body = canonicalBodyFromStored(t);
    const checksum = sha256Hex(canonicalTokenJson(body));
    if (checksum !== t.checksum) {
      return { valid: false, error: "token checksum mismatch" };
    }
    if (!verifyCanonicalSignature(body, t.signature, this._state.root.publicKeyPem)) {
      return { valid: false, error: "token signature invalid" };
    }
    if (permission && !t.permissions?.[permission]) {
      return { valid: false, error: `missing permission: ${permission}` };
    }
    if (resource && t.resource && !matchesResource(t.resource, resource)) {
      return { valid: false, error: "token not authorized for resource" };
    }
    if (t.expiryType === "use") {
      t.useCount = (t.useCount ?? 0) + 1;
      await this._serialize(() => this._flush());
    }
    return {
      valid: true,
      token: publicToken(t),
      user: {
        id: t.userId,
        email: t.userEmail,
        username: t.userUsername,
      },
      error: null,
    };
  }

  async revokeToken(tokenId, reason = "unspecified") {
    const t = this._state.tokens.get(tokenId);
    if (!t) throw new Error(`token not found: ${tokenId}`);
    t.status = "revoked";
    t.revokedAt = Date.now();
    t.revocationReason = reason;
    await this._serialize(() => this._flush());
    return publicToken(t);
  }

  listTokensForUser(userId) {
    return [...this._state.tokens.values()]
      .filter((t) => t.userId === userId)
      .map(publicToken);
  }
}

// ───────────────────────── shared helpers ─────────────────────────────

export function canonicalTokenJson(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new TypeError("canonicalTokenJson requires a plain object");
  }
  const keys = Object.keys(obj).sort();
  return JSON.stringify(obj, keys);
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function signCanonical(obj, privateKeyPem) {
  const canonical = canonicalTokenJson(obj);
  const sig = crypto.sign(
    "sha256",
    Buffer.from(canonical, "utf8"),
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
      mgf1Hash: "sha256",
    },
  );
  return sig.toString("base64");
}

export function verifyCanonicalSignature(obj, signatureB64, publicKeyPem) {
  const canonical = canonicalTokenJson(obj);
  return crypto.verify(
    "sha256",
    Buffer.from(canonical, "utf8"),
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
      mgf1Hash: "sha256",
    },
    Buffer.from(signatureB64, "base64"),
  );
}

function normalizePermissions(p) {
  return {
    read: !!p?.read,
    write: !!p?.write,
    append: !!p?.append,
    delete: !!p?.delete,
    update: !!p?.update,
  };
}

function matchesResource(tokenResource, requested) {
  if (!tokenResource) return true;
  if (typeof tokenResource === "string") return tokenResource === requested;
  if (typeof tokenResource === "object") {
    if (typeof requested === "string") {
      return Object.values(tokenResource).some((v) => v === requested);
    }
    return JSON.stringify(tokenResource) === JSON.stringify(requested);
  }
  return false;
}

function canonicalBodyFromStored(t) {
  const body = {
    id: t.id,
    version: t.version,
    issuer: t.issuer,
    permissions: t.permissions,
    resource: t.resource ?? null,
    data: t.data ?? null,
    issuedAt: t.issuedAt,
    notBefore: t.notBefore,
    expiresAt: t.expiresAt,
    expiryType: t.expiryType,
  };
  if (t.expiryType === "use") {
    body.maxUses = t.maxUses;
    body.useCount = 0;
  }
  return body;
}

function publicToken(t) {
  return {
    id: t.id,
    version: t.version,
    issuer: t.issuer,
    permissions: t.permissions,
    resource: t.resource ?? null,
    data: t.data ?? null,
    issuedAt: t.issuedAt,
    notBefore: t.notBefore,
    expiresAt: t.expiresAt,
    expiryType: t.expiryType,
    maxUses: t.maxUses ?? null,
    useCount: t.useCount ?? null,
    status: t.status,
    checksum: t.checksum,
    signature: t.signature,
  };
}

function publicCertificate(c) {
  return {
    id: c.id,
    type: c.type,
    ownerId: c.ownerId,
    commonName: c.commonName,
    email: c.email,
    serialNumber: c.serialNumber,
    fingerprint: c.fingerprint,
    pem: c.pem,
    notBefore: c.notBefore,
    notAfter: c.notAfter,
    status: c.status,
    createdAt: c.createdAt,
    revokedAt: c.revokedAt ?? null,
    revocationReason: c.revocationReason ?? null,
  };
}

// ─────────────────────── X.509 (via node-forge) ───────────────────────

function generateSelfSignedRoot({ subject, keySize, validityDays }) {
  const keys = forge.pki.rsa.generateKeyPair(keySize);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);
  const attrs = subjectToAttrs(subject);
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      cRLSign: true,
    },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const certificatePem = forge.pki.certificateToPem(cert);
  return {
    serialNumber: cert.serialNumber,
    fingerprint: fingerprintSha256(cert),
    notBefore: cert.validity.notBefore.getTime(),
    notAfter: cert.validity.notAfter.getTime(),
    certificatePem,
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    publicKeyPem: forge.pki.publicKeyToPem(keys.publicKey),
  };
}

function generateEntityCertificate({
  subject,
  altNames,
  issuerCertPem,
  issuerPrivateKeyPem,
  keySize,
  validityDays,
}) {
  const issuerCert = forge.pki.certificateFromPem(issuerCertPem);
  const issuerKey = forge.pki.privateKeyFromPem(issuerPrivateKeyPem);
  const keys = forge.pki.rsa.generateKeyPair(keySize);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);
  cert.setSubject(subjectToAttrs(subject));
  cert.setIssuer(issuerCert.subject.attributes);
  const exts = [
    { name: "basicConstraints", cA: false },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
    },
    { name: "extKeyUsage", serverAuth: true, clientAuth: true },
  ];
  if (altNames?.length) {
    exts.push({
      name: "subjectAltName",
      altNames: altNames.map(toAltName),
    });
  }
  cert.setExtensions(exts);
  cert.sign(issuerKey, forge.md.sha256.create());
  return {
    serialNumber: cert.serialNumber,
    fingerprint: fingerprintSha256(cert),
    notBefore: cert.validity.notBefore.getTime(),
    notAfter: cert.validity.notAfter.getTime(),
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

function subjectToAttrs({ commonName, organization, organizationalUnit, country, state, locality, emailAddress }) {
  const attrs = [];
  if (commonName) attrs.push({ name: "commonName", value: commonName });
  if (country) attrs.push({ name: "countryName", value: country });
  if (state) attrs.push({ shortName: "ST", value: state });
  if (locality) attrs.push({ name: "localityName", value: locality });
  if (organization) attrs.push({ name: "organizationName", value: organization });
  if (organizationalUnit) attrs.push({ shortName: "OU", value: organizationalUnit });
  if (emailAddress) attrs.push({ name: "emailAddress", value: emailAddress });
  return attrs;
}

function toAltName(a) {
  switch (a.type) {
    case "dns":
      return { type: 2, value: a.value };
    case "email":
      return { type: 1, value: a.value };
    case "uri":
      return { type: 6, value: a.value };
    case "ip":
      return { type: 7, ip: a.value };
    default:
      throw new Error(`unsupported altName type: ${a.type}`);
  }
}

function randomSerial() {
  // Forge requires hex. Top bit must be 0 to keep the integer positive.
  const bytes = crypto.randomBytes(16);
  bytes[0] &= 0x7f;
  return bytes.toString("hex");
}

function fingerprintSha256(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return md.digest().toHex();
}
