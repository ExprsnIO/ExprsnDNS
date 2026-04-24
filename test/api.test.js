import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../src/storage.js";
import { CAClient } from "../src/ca-client.js";
import { createApp } from "../src/api.js";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exprsndns-api-"));
  return path.join(dir, "db.json");
}

function buildFetchStub({ user = { id: "u1", email: "alice@example.com" }, permissions = { read: true, write: true, update: true, delete: true } } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith("/api/tokens/validate")) {
      return new Response(JSON.stringify({
        valid: true,
        user,
        token: { permissions },
      }), { status: 200 });
    }
    if (url.endsWith("/api/certificates/generate")) {
      return new Response(JSON.stringify({ id: "cert-1", pem: "PEM" }), { status: 201 });
    }
    return new Response(JSON.stringify({ error: "unknown" }), { status: 404 });
  };
  return { fetchImpl, calls };
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
        resolve({ status: res.status, body: parsed });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

function app({ fetchImpl } = {}) {
  const storage = new Storage(tmpFile());
  const caClient = new CAClient({ baseUrl: fetchImpl ? "http://ca.local" : null, fetchImpl });
  return { app: createApp({ storage, caClient }), storage, caClient };
}

test("health endpoint", async () => {
  const { app: a } = app();
  const res = await request(a, "GET", "/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("writes are rejected without a bearer token when CA is enabled", async () => {
  const { fetchImpl } = buildFetchStub();
  const { app: a } = app({ fetchImpl });
  const res = await request(a, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", dns_address: "ns1.example.com" },
  });
  assert.equal(res.status, 401);
});

test("writes succeed with a valid bearer token; email comes from the token's user", async () => {
  const { fetchImpl, calls } = buildFetchStub();
  const { app: a, storage } = app({ fetchImpl });
  const res = await request(a, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", dns_address: "ns1.example.com" },
    headers: { authorization: "Bearer tok-123" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.email, "alice@example.com");
  assert.equal(res.body.owner_id, "u1");
  const stored = storage.get("alice");
  assert.equal(stored.ownerId, "u1");

  const validateCall = calls.find((c) => c.url.endsWith("/api/tokens/validate"));
  assert.ok(validateCall);
  assert.equal(validateCall.opts.headers["x-service-name"], "exprsn-dns");
});

test("CA-Token header scheme is accepted", async () => {
  const { fetchImpl } = buildFetchStub();
  const { app: a } = app({ fetchImpl });
  const res = await request(a, "POST", "/records", {
    body: { token: "bob", ipv6: "2001:db8::2", dns_address: "ns1.example.com" },
    headers: { authorization: "CA-Token tok-bob" },
  });
  assert.equal(res.status, 201);
});

test("permissions enforced: a read-only token cannot write", async () => {
  const { fetchImpl } = buildFetchStub({ permissions: { read: true } });
  const { app: a } = app({ fetchImpl });
  const res = await request(a, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", dns_address: "ns1.example.com" },
    headers: { authorization: "Bearer tok" },
  });
  assert.equal(res.status, 403);
});

test("another identity cannot modify someone else's record", async () => {
  const stubA = buildFetchStub({ user: { id: "u-alice", email: "alice@example.com" } });
  const { app: appA, storage, caClient } = app({ fetchImpl: stubA.fetchImpl });
  const created = await request(appA, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", dns_address: "ns1.example.com" },
    headers: { authorization: "Bearer tok-a" },
  });
  assert.equal(created.status, 201);

  // Swap identity (same storage/caClient, different fake user from CA).
  caClient.fetch = buildFetchStub({ user: { id: "u-eve", email: "eve@example.com" } }).fetchImpl;
  const hijack = await request(appA, "PUT", "/records/alice", {
    body: { ipv6: "2001:db8::666", dns_address: "ns1.example.com" },
    headers: { authorization: "Bearer tok-e" },
  });
  assert.equal(hijack.status, 403);
  assert.equal(storage.get("alice").ipv6, "2001:db8::1");
});

test("certificate issuance endpoint proxies to CA and records the cert id", async () => {
  const { fetchImpl } = buildFetchStub();
  const { app: a, storage } = app({ fetchImpl });
  await request(a, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", dns_address: "ns1.example.com" },
    headers: { authorization: "Bearer tok" },
  });
  const res = await request(a, "POST", "/records/alice/certificate", {
    headers: { authorization: "Bearer tok" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, "cert-1");
  assert.equal(storage.get("alice").certificateId, "cert-1");
});

test("dev mode (no CA configured) accepts anonymous writes", async () => {
  const { app: a } = app();
  const res = await request(a, "POST", "/records", {
    body: { token: "alice", ipv6: "2001:db8::1", email: "alice@example.com", dns_address: "ns1.example.com" },
  });
  assert.equal(res.status, 201);
});
