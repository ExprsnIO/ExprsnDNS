import crypto from "node:crypto";

/**
 * Client for the Exprsn-CA service.
 *
 * Mirrors upstream wire semantics from ExprsnIO/Exprsn:
 *   - Bearer headers: "Bearer <tokenId>" or "CA-Token <tokenId>".
 *   - Service headers on outbound calls: X-Service-ID, X-Service-Token,
 *     X-Service-Name.
 *   - Validation endpoint: POST {baseUrl}/api/tokens/validate { tokenId }.
 *   - Certificate issuance: POST {baseUrl}/api/certificates/generate.
 *   - Canonical checksum over a signed token:
 *       sha256(JSON.stringify(obj, Object.keys(obj).sort())).
 *     We replicate Node's JSON.stringify replacer-array behavior exactly
 *     so local verification matches byte-for-byte.
 *   - Signature: RSA-PSS with SHA-256 and salt length 32.
 *   - All timestamps are milliseconds since the Unix epoch.
 */
export class CAClient {
  constructor({
    baseUrl,
    serviceId = "exprsn-dns",
    serviceName = "exprsn-dns",
    serviceToken = null,
    fetchImpl = globalThis.fetch,
    timeoutMs = 5000,
  } = {}) {
    this.baseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : null;
    this.serviceId = serviceId;
    this.serviceName = serviceName;
    this.serviceToken = serviceToken;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  get enabled() {
    return !!this.baseUrl;
  }

  _headers(extra = {}) {
    const h = {
      "content-type": "application/json",
      "x-service-id": this.serviceId,
      "x-service-name": this.serviceName,
      ...extra,
    };
    if (this.serviceToken) h["x-service-token"] = this.serviceToken;
    return h;
  }

  async _post(pathname, body, extraHeaders = {}) {
    if (!this.enabled) {
      throw new Error("CAClient disabled (no baseUrl configured)");
    }
    const url = `${this.baseUrl}${pathname}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, {
        method: "POST",
        headers: this._headers(extraHeaders),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const parsed = text ? safeJson(text) : null;
      return { ok: res.ok, status: res.status, body: parsed, raw: text };
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Validate a bearer token ID against the CA.
   * Returns { valid, token, user, error }.
   */
  async validateToken(tokenId, { resource, permission, forwardedFor } = {}) {
    const extra = forwardedFor ? { "x-forwarded-for": forwardedFor } : {};
    const { ok, status, body } = await this._post(
      "/api/tokens/validate",
      { tokenId, resource, permission },
      extra,
    );
    if (!ok) {
      return { valid: false, error: body?.error || `ca returned ${status}` };
    }
    return {
      valid: !!body?.valid,
      token: body?.token ?? null,
      user: body?.user ?? null,
      error: body?.valid ? null : body?.error ?? "token rejected",
    };
  }

  /**
   * Ask the CA to issue an entity certificate for a .exprsn token.
   * Returns the CA's response body (certificate metadata + PEM).
   */
  async issueCertificate({ token, email, ownerId, keySize = 2048, validityDays = 365 }) {
    const { ok, status, body } = await this._post("/api/certificates/generate", {
      type: "entity",
      subject: {
        commonName: token,
        emailAddress: email,
      },
      altNames: [
        { type: "dns", value: token },
        { type: "email", value: email },
      ],
      keyUsage: ["digitalSignature", "keyEncipherment"],
      extKeyUsage: ["serverAuth", "clientAuth"],
      keySize,
      validityDays,
      ownerId,
    });
    if (!ok) {
      throw new Error(`CA certificate issuance failed: ${status} ${body?.error ?? ""}`);
    }
    return body;
  }

  async revokeToken(tokenId, reason = "unspecified") {
    const { ok, status, body } = await this._post("/api/tokens/revoke", {
      tokenId,
      reason,
    });
    if (!ok) throw new Error(`CA token revoke failed: ${status} ${body?.error ?? ""}`);
    return body;
  }
}

export function extractBearer(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return null;
  const m = headerValue.match(/^(Bearer|CA-Token)\s+(.+)$/i);
  return m ? m[2].trim() : null;
}

/**
 * Upstream canonicalization: JSON.stringify(obj, Object.keys(obj).sort()).
 * We replicate the replacer-array call exactly; Node's JSON serializer will
 * produce byte-identical output to the upstream Node implementation.
 */
export function canonicalTokenJson(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new TypeError("canonicalTokenJson requires a plain object");
  }
  const keys = Object.keys(obj).sort();
  return JSON.stringify(obj, keys);
}

export function tokenChecksum(obj) {
  return crypto
    .createHash("sha256")
    .update(canonicalTokenJson(obj))
    .digest("hex");
}

/**
 * Verify the signature of a signed CA token payload.
 *
 * @param {object} tokenBody - the token's canonical body (same shape the CA hashed)
 * @param {string} signatureB64 - base64-encoded RSA-PSS signature
 * @param {string|Buffer|crypto.KeyObject} publicKeyPem - signer's public key
 * @returns {boolean}
 */
export function verifyTokenSignature(tokenBody, signatureB64, publicKeyPem) {
  const canonical = canonicalTokenJson(tokenBody);
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

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
