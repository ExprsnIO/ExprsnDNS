import net from "node:net";

export const EXPRSN_TLD = "exprsn";

const LABEL_RE = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export class RecordError extends Error {
  constructor(message) {
    super(message);
    this.name = "RecordError";
  }
}

export function normalizeToken(token) {
  if (typeof token !== "string" || token.trim() === "") {
    throw new RecordError("token must be a non-empty string");
  }
  let t = token.trim().toLowerCase().replace(/\.+$/, "");
  const suffix = "." + EXPRSN_TLD;
  if (t.endsWith(suffix)) {
    t = t.slice(0, -suffix.length);
  } else if (t === EXPRSN_TLD) {
    throw new RecordError("token cannot be the bare .exprsn TLD");
  }
  if (t === "") throw new RecordError("token cannot be empty");
  for (const label of t.split(".")) {
    if (!LABEL_RE.test(label)) {
      throw new RecordError(`invalid token label: ${JSON.stringify(label)}`);
    }
  }
  return `${t}.${EXPRSN_TLD}`;
}

export function validateIpv6(value) {
  if (typeof value !== "string" || net.isIPv6(value) === false) {
    throw new RecordError(`invalid IPv6 address: ${JSON.stringify(value)}`);
  }
  return compressIpv6(value);
}

function compressIpv6(value) {
  // Node has no built-in canonical compression; fall back to lowercased input
  // after a round-trip through a URL to collapse leading zeros.
  try {
    const u = new URL(`http://[${value}]`);
    return u.hostname.replace(/^\[|\]$/g, "");
  } catch {
    return value.toLowerCase();
  }
}

export function validateEmail(value) {
  if (typeof value !== "string" || !EMAIL_RE.test(value)) {
    throw new RecordError(`invalid email address: ${JSON.stringify(value)}`);
  }
  return value.trim().toLowerCase();
}

export function validateDnsAddress(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RecordError("dns_address must be a non-empty string");
  }
  const v = value.trim();
  if (net.isIP(v) !== 0) {
    return net.isIPv6(v) ? compressIpv6(v) : v;
  }
  const host = v.replace(/\.+$/, "").toLowerCase();
  if (host.length === 0 || host.length > 253) {
    throw new RecordError(`invalid dns_address: ${JSON.stringify(value)}`);
  }
  for (const label of host.split(".")) {
    if (!LABEL_RE.test(label)) {
      throw new RecordError(`invalid dns_address label: ${JSON.stringify(label)}`);
    }
  }
  return host;
}

export class Record {
  constructor({ token, ipv6, email, dnsAddress, createdAt, updatedAt, ownerId, certificateId }) {
    this.token = normalizeToken(token);
    this.ipv6 = validateIpv6(ipv6);
    this.email = validateEmail(email);
    this.dnsAddress = validateDnsAddress(dnsAddress);
    const now = Date.now();
    this.createdAt = createdAt ?? now;
    this.updatedAt = updatedAt ?? now;
    this.ownerId = ownerId ?? null;
    this.certificateId = certificateId ?? null;
  }

  touch() {
    this.updatedAt = Date.now();
  }

  toJSON() {
    return {
      token: this.token,
      ipv6: this.ipv6,
      email: this.email,
      dns_address: this.dnsAddress,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
      owner_id: this.ownerId,
      certificate_id: this.certificateId,
    };
  }

  static fromJSON(data) {
    return new Record({
      token: data.token,
      ipv6: data.ipv6,
      email: data.email,
      dnsAddress: data.dns_address,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      ownerId: data.owner_id ?? null,
      certificateId: data.certificate_id ?? null,
    });
  }
}
