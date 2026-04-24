import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  CAClient,
  canonicalTokenJson,
  tokenChecksum,
  extractBearer,
  verifyTokenSignature,
} from "../src/ca-client.js";

test("extractBearer handles Bearer and CA-Token schemes", () => {
  assert.equal(extractBearer("Bearer abc"), "abc");
  assert.equal(extractBearer("bearer ABC "), "ABC");
  assert.equal(extractBearer("CA-Token xyz"), "xyz");
  assert.equal(extractBearer("ca-token xyz"), "xyz");
  assert.equal(extractBearer(""), null);
  assert.equal(extractBearer("Basic foo"), null);
});

test("canonicalTokenJson matches upstream: JSON.stringify(obj, sortedTopKeys)", () => {
  const obj = { b: 2, a: { y: 1, x: 2 }, c: "z" };
  const expected = JSON.stringify(obj, ["a", "b", "c"]);
  assert.equal(canonicalTokenJson(obj), expected);
});

test("tokenChecksum is sha256 over canonical JSON", () => {
  const obj = { id: "t1", version: 1, permissions: { read: true } };
  const sorted = Object.keys(obj).sort();
  const expected = crypto
    .createHash("sha256")
    .update(JSON.stringify(obj, sorted))
    .digest("hex");
  assert.equal(tokenChecksum(obj), expected);
});

test("verifyTokenSignature accepts RSA-PSS-SHA256 salt=32", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const token = {
    id: "00000000-0000-0000-0000-000000000001",
    version: 1,
    issuer: { domain: "ca.exprsn", certificateSerial: "ff" },
    permissions: { read: true, write: true, append: false, delete: false, update: false },
    resource: { url: "https://alice.exprsn/" },
    data: null,
    issuedAt: 1_700_000_000_000,
    notBefore: 1_700_000_000_000,
    expiresAt: 1_700_000_060_000,
    expiryType: "time",
  };
  const canonical = canonicalTokenJson(token);
  const sig = crypto.sign(
    "sha256",
    Buffer.from(canonical, "utf8"),
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
      mgf1Hash: "sha256",
    },
  );
  const sigB64 = sig.toString("base64");
  assert.equal(verifyTokenSignature(token, sigB64, publicKey), true);

  // A mutation to a TOP-LEVEL field breaks the signature. (Note: upstream's
  // canonicalization uses JSON.stringify(obj, Object.keys(obj).sort()), where
  // the replacer array is applied recursively - so nested-only mutations are
  // invisible to the checksum. That is a faithful reproduction of upstream
  // behavior, not a bug in this library.)
  const mutated = { ...token, expiresAt: token.expiresAt + 1 };
  assert.equal(verifyTokenSignature(mutated, sigB64, publicKey), false);
});

test("CAClient disabled when baseUrl not set", async () => {
  const c = new CAClient({ baseUrl: null });
  assert.equal(c.enabled, false);
  await assert.rejects(() => c.validateToken("x"), /disabled/);
});

test("CAClient.validateToken returns valid=true on OK response", async () => {
  let seen;
  const stubFetch = async (url, opts) => {
    seen = { url, opts };
    return new Response(JSON.stringify({
      valid: true,
      token: { permissions: { read: true, write: true } },
      user: { id: "u1", email: "alice@example.com" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const c = new CAClient({
    baseUrl: "http://ca.local",
    serviceToken: "svc-tok",
    fetchImpl: stubFetch,
  });
  const res = await c.validateToken("tok-abc", { resource: "url:https://alice.exprsn/", permission: "write" });
  assert.equal(res.valid, true);
  assert.equal(res.user.id, "u1");
  assert.equal(seen.url, "http://ca.local/api/tokens/validate");
  assert.equal(seen.opts.headers["x-service-id"], "exprsn-dns");
  assert.equal(seen.opts.headers["x-service-token"], "svc-tok");
  assert.equal(seen.opts.headers["x-service-name"], "exprsn-dns");
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.tokenId, "tok-abc");
  assert.equal(body.permission, "write");
});

test("CAClient.validateToken surfaces errors from CA", async () => {
  const stubFetch = async () =>
    new Response(JSON.stringify({ error: "token revoked" }), { status: 401 });
  const c = new CAClient({ baseUrl: "http://ca.local", fetchImpl: stubFetch });
  const res = await c.validateToken("tok");
  assert.equal(res.valid, false);
  assert.match(res.error, /revoked/);
});

test("CAClient.issueCertificate posts entity CSR request", async () => {
  let seen;
  const stubFetch = async (url, opts) => {
    seen = { url, body: JSON.parse(opts.body) };
    return new Response(JSON.stringify({ id: "cert-1", pem: "-----BEGIN CERTIFICATE-----" }), { status: 201 });
  };
  const c = new CAClient({ baseUrl: "http://ca.local", fetchImpl: stubFetch });
  const cert = await c.issueCertificate({
    token: "alice.exprsn",
    email: "alice@example.com",
    ownerId: "u1",
  });
  assert.equal(cert.id, "cert-1");
  assert.equal(seen.url, "http://ca.local/api/certificates/generate");
  assert.equal(seen.body.type, "entity");
  assert.equal(seen.body.subject.commonName, "alice.exprsn");
  assert.deepEqual(
    seen.body.altNames.find((a) => a.type === "dns"),
    { type: "dns", value: "alice.exprsn" },
  );
});
