import crypto from "node:crypto";
import {
  canonicalTokenJson as embeddedCanonicalTokenJson,
  sha256Hex,
  verifyCanonicalSignature,
} from "./exprsn-ca.js";

/**
 * HTTP client for an external Exprsn-CA service.
 *
 * Historically ExprsnDNS spoke to Exprsn-CA over HTTP. With the embedded CA
 * (`src/exprsn-ca.js`) this client is now optional: it is retained so an
 * operator can still point ExprsnDNS at a separately-deployed CA when
 * desired, and so the upstream wire format stays in one place.
 *
 * Wire contract (mirrors upstream `ExprsnIO/Exprsn` / `src/exprsn-ca`):
 *   - Bearer headers: "Bearer <tokenId>" or "CA-Token <tokenId>".
 *   - Service headers on outbound calls: X-Service-ID, X-Service-Token,
 *     X-Service-Name.
 *   - Validation endpoint: POST {baseUrl}/api/tokens/validate { tokenId }.
 *   - Certificate issuance: POST {baseUrl}/api/certificates/generate.
 *   - Canonical checksum / signature: see `exprsn-ca.js`.
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

/**
 * Adapter that lets the embedded `ExprsnCA` plug in wherever an HTTP
 * `CAClient` was previously expected (auth middleware, API routes).
 *
 * Method signatures are identical to `CAClient`; the implementation just
 * forwards to the in-process CA.
 */
export class EmbeddedCAAdapter {
  constructor(ca, { serviceId = "exprsn-dns" } = {}) {
    if (!ca) throw new Error("EmbeddedCAAdapter requires an ExprsnCA instance");
    this.ca = ca;
    this.serviceId = serviceId;
    this.baseUrl = ca.baseUrl;
  }

  get enabled() {
    return true;
  }

  async validateToken(tokenId, opts = {}) {
    return await this.ca.validateToken(tokenId, opts);
  }

  async issueCertificate(args) {
    return await this.ca.issueCertificate(args);
  }

  async revokeToken(tokenId, reason) {
    return await this.ca.revokeToken(tokenId, reason);
  }
}

export function extractBearer(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return null;
  const m = headerValue.match(/^(Bearer|CA-Token)\s+(.+)$/i);
  return m ? m[2].trim() : null;
}

/**
 * Upstream canonicalization: `JSON.stringify(obj, Object.keys(obj).sort())`.
 * Note: applying a replacer array is recursive, so only top-level keys are
 * filtered/sorted - load-bearing quirk of the upstream format.
 */
export function canonicalTokenJson(obj) {
  return embeddedCanonicalTokenJson(obj);
}

export function tokenChecksum(obj) {
  return sha256Hex(canonicalTokenJson(obj));
}

/**
 * Verify the signature of a signed CA token payload.
 *
 * @param {object} tokenBody - the token's canonical body
 * @param {string} signatureB64 - base64-encoded RSA-PSS signature
 * @param {string|Buffer|crypto.KeyObject} publicKeyPem - signer's public key
 */
export function verifyTokenSignature(tokenBody, signatureB64, publicKeyPem) {
  return verifyCanonicalSignature(tokenBody, signatureB64, publicKeyPem);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Re-export so callers can use a single `crypto` reference if they wish.
export { crypto };
