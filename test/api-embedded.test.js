import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../src/storage.js";
import { ExprsnCA } from "../src/exprsn-ca.js";
import { ExprsnAuth } from "../src/exprsn-auth.js";
import { EmbeddedCAAdapter } from "../src/ca-client.js";
import { createApp } from "../src/api.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "exprsndns-api-emb-"));
}

async function buildEmbeddedApp() {
  const dir = tmpDir();
  const ca = new ExprsnCA({
    dataPath: path.join(dir, "ca.json"),
    rootKeySize: 2048,
    rootValidityDays: 30,
  });
  await ca.ensureRoot();
  const authService = new ExprsnAuth({
    dataPath: path.join(dir, "auth.json"),
    ca,
  });
  const storage = new Storage(path.join(dir, "db.json"));
  const caClient = new EmbeddedCAAdapter(ca);
  const app = createApp({ storage, caClient, ca, auth: authService });
  return { app, storage, ca, authService };
}

async function request(app, method, url, { body, headers = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${url}`, {
          method,
          headers: body ? { "content-type": "application/json", ...headers } : headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        resolve({ status: res.status, body: parsed, text });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test("/auth/register + /auth/login -> bearer for /records create", async () => {
  const { app, storage } = await buildEmbeddedApp();

  const reg = await request(app, "POST", "/auth/register", {
    body: { email: "alice@example.com", password: "hunter2" },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.email, "alice@example.com");

  const login = await request(app, "POST", "/auth/login", {
    body: { email: "alice@example.com", password: "hunter2" },
  });
  assert.equal(login.status, 200);
  const tokenId = login.body.token.id;

  const create = await request(app, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", dns_address: "ns1.example.com" },
    headers: { authorization: `Bearer ${tokenId}` },
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.email, "alice@example.com");
  assert.equal(create.body.owner_id, login.body.user.id);
  assert.equal(storage.get("alice").ownerId, login.body.user.id);
});

test("/api/tokens/validate matches the embedded CA validation", async () => {
  const { app, ca } = await buildEmbeddedApp();
  const tok = await ca.issueToken({
    user: { id: "u1", email: "alice@example.com" },
    permissions: { read: true, write: true },
  });
  const res = await request(app, "POST", "/api/tokens/validate", {
    body: { tokenId: tok.id, permission: "write" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.user.id, "u1");
});

test("/api/certificates/generate issues a real X.509 chained to the embedded root", async () => {
  const { app, ca } = await buildEmbeddedApp();
  const res = await request(app, "POST", "/api/certificates/generate", {
    body: {
      type: "entity",
      subject: { commonName: "alice.exprsn", emailAddress: "alice@example.com" },
      altNames: [{ type: "dns", value: "alice.exprsn" }],
      ownerId: "u1",
    },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.pem.includes("-----BEGIN CERTIFICATE-----"));
  assert.equal(res.body.commonName, "alice.exprsn");
  // Must be retrievable from the in-process CA.
  assert.ok(ca.getCertificate(res.body.id));
});

test("/api/ca/root returns the root certificate PEM", async () => {
  const { app } = await buildEmbeddedApp();
  const res = await request(app, "GET", "/api/ca/root");
  assert.equal(res.status, 200);
  assert.ok(res.text.startsWith("-----BEGIN CERTIFICATE-----"));
});

test("end-to-end: register -> login -> create record -> issue cert", async () => {
  const { app, storage, ca } = await buildEmbeddedApp();
  await request(app, "POST", "/auth/register", {
    body: { email: "alice@example.com", password: "hunter2" },
  });
  const login = await request(app, "POST", "/auth/login", {
    body: { email: "alice@example.com", password: "hunter2" },
  });
  const bearer = login.body.token.id;
  await request(app, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", dns_address: "ns1.example.com" },
    headers: { authorization: `Bearer ${bearer}` },
  });
  const cert = await request(app, "POST", "/records/alice/certificate", {
    headers: { authorization: `Bearer ${bearer}` },
  });
  assert.equal(cert.status, 201);
  assert.ok(cert.body.pem.includes("BEGIN CERTIFICATE"));
  assert.equal(storage.get("alice").certificateId, cert.body.id);
  // The cert must be persisted in the embedded CA store.
  assert.ok(ca.getCertificate(cert.body.id));
});

test("read-only token from login (override) cannot write", async () => {
  const { app, authService } = await buildEmbeddedApp();
  const u = await authService.register({ email: "bob@example.com", password: "pw" });
  // Login with an override that strips write permission.
  const { token } = await authService.login({
    email: "bob@example.com",
    password: "pw",
    permissions: { ...u.permissions, write: false, update: false, delete: false },
  });
  const res = await request(app, "POST", "/records", {
    body: { token: "bob", ipv6: "2001:db8::2", dns_address: "ns1.example.com" },
    headers: { authorization: `Bearer ${token.id}` },
  });
  assert.equal(res.status, 403);
});
