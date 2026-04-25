import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import { ExprsnCA } from "../src/exprsn-ca.js";

function tmp(name = "ca.json") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exprsn-ca-"));
  return path.join(dir, name);
}

function newCA(overrides = {}) {
  return new ExprsnCA({
    dataPath: tmp(),
    rootKeySize: 2048,
    rootValidityDays: 30,
    entityKeySize: 2048,
    entityValidityDays: 7,
    ...overrides,
  });
}

test("ensureRoot generates a self-signed RSA root", async () => {
  const ca = newCA();
  const root = await ca.ensureRoot();
  assert.ok(root.certificatePem.startsWith("-----BEGIN CERTIFICATE-----"));
  assert.ok(root.privateKeyPem.startsWith("-----BEGIN RSA PRIVATE KEY-----"));
  const x = new X509Certificate(root.certificatePem);
  assert.match(x.subject, /Exprsn Root CA/);
  assert.equal(x.subject, x.issuer);
  assert.equal(x.ca, true);
});

test("issueCertificate produces an entity cert chained to the root", async () => {
  const ca = newCA();
  const cert = await ca.issueCertificate({
    token: "alice.exprsn",
    email: "alice@example.com",
    ownerId: "u1",
  });
  assert.ok(cert.id);
  assert.ok(cert.pem.startsWith("-----BEGIN CERTIFICATE-----"));
  assert.equal(cert.commonName, "alice.exprsn");
  assert.equal(cert.ownerId, "u1");

  const x = new X509Certificate(cert.pem);
  const root = new X509Certificate(ca.rootCertificatePem());
  assert.equal(x.checkIssued(root), true);
  assert.equal(x.verify(root.publicKey), true);
  assert.match(x.subject, /alice\.exprsn/);
  // SAN must include the dns name
  assert.match(x.subjectAltName ?? "", /alice\.exprsn/);
});

test("issueToken + validateToken happy path", async () => {
  const ca = newCA();
  const token = await ca.issueToken({
    user: { id: "u1", email: "alice@example.com", username: "alice" },
    permissions: { read: true, write: true },
  });
  assert.ok(token.id);
  assert.equal(token.permissions.write, true);
  assert.equal(token.permissions.delete, false);

  const result = await ca.validateToken(token.id);
  assert.equal(result.valid, true);
  assert.equal(result.user.id, "u1");
  assert.equal(result.user.email, "alice@example.com");
  assert.equal(result.token.id, token.id);
});

test("validateToken rejects unknown tokens", async () => {
  const ca = newCA();
  const r = await ca.validateToken("unknown-id");
  assert.equal(r.valid, false);
  assert.match(r.error, /not found/);
});

test("validateToken enforces requested permission", async () => {
  const ca = newCA();
  const tok = await ca.issueToken({
    user: { id: "u1", email: "alice@example.com" },
    permissions: { read: true, write: false },
  });
  const ok = await ca.validateToken(tok.id, { permission: "read" });
  assert.equal(ok.valid, true);
  const denied = await ca.validateToken(tok.id, { permission: "write" });
  assert.equal(denied.valid, false);
  assert.match(denied.error, /missing permission/);
});

test("revokeToken makes subsequent validation fail", async () => {
  const ca = newCA();
  const tok = await ca.issueToken({
    user: { id: "u1", email: "alice@example.com" },
  });
  await ca.revokeToken(tok.id, "test");
  const r = await ca.validateToken(tok.id);
  assert.equal(r.valid, false);
  assert.match(r.error, /revoked/);
});

test("expired time-based tokens are rejected", async () => {
  const ca = newCA();
  const past = Date.now() - 1000;
  const tok = await ca.issueToken({
    user: { id: "u1", email: "a@example.com" },
    expiryType: "time",
    expiresAt: past,
  });
  const r = await ca.validateToken(tok.id);
  assert.equal(r.valid, false);
  assert.match(r.error, /expired/);
});

test("use-based tokens decrement and exhaust", async () => {
  const ca = newCA();
  const tok = await ca.issueToken({
    user: { id: "u1", email: "a@example.com" },
    expiryType: "use",
    maxUses: 2,
  });
  assert.equal((await ca.validateToken(tok.id)).valid, true);
  assert.equal((await ca.validateToken(tok.id)).valid, true);
  const out = await ca.validateToken(tok.id);
  assert.equal(out.valid, false);
  assert.match(out.error, /exhausted/);
});

test("token signature uses RSA-PSS-SHA256 over canonical JSON", async () => {
  const ca = newCA();
  const tok = await ca.issueToken({
    user: { id: "u1", email: "a@example.com" },
    permissions: { read: true },
  });
  // Reconstruct the body the way the CA did and verify against the root
  // public key directly.
  const body = {
    id: tok.id,
    version: tok.version,
    issuer: tok.issuer,
    permissions: tok.permissions,
    resource: tok.resource ?? null,
    data: tok.data ?? null,
    issuedAt: tok.issuedAt,
    notBefore: tok.notBefore,
    expiresAt: tok.expiresAt,
    expiryType: tok.expiryType,
  };
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  const ok = crypto.verify(
    "sha256",
    Buffer.from(canonical, "utf8"),
    {
      key: ca.getRoot().publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
      mgf1Hash: "sha256",
    },
    Buffer.from(tok.signature, "base64"),
  );
  assert.equal(ok, true);
});

test("state persists across CA instances at the same path", async () => {
  const dataPath = tmp();
  const a = new ExprsnCA({ dataPath, rootKeySize: 2048, rootValidityDays: 30 });
  await a.ensureRoot();
  const cert = await a.issueCertificate({ token: "alice.exprsn", email: "a@example.com" });
  const tok = await a.issueToken({ user: { id: "u1", email: "a@example.com" } });
  // Wait for the in-flight write to settle before opening a second handle.
  await new Promise((r) => setTimeout(r, 50));

  const b = new ExprsnCA({ dataPath, rootKeySize: 2048, rootValidityDays: 30 });
  assert.equal(b.getRoot().serialNumber, a.getRoot().serialNumber);
  assert.ok(b.getCertificate(cert.id));
  const r = await b.validateToken(tok.id);
  assert.equal(r.valid, true);
});
