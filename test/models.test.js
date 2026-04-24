import test from "node:test";
import assert from "node:assert/strict";
import { Record, RecordError, normalizeToken, validateIpv6, validateEmail, validateDnsAddress } from "../src/models.js";

test("normalizeToken adds the .exprsn suffix and lowercases", () => {
  assert.equal(normalizeToken("Alice"), "alice.exprsn");
  assert.equal(normalizeToken("alice.exprsn"), "alice.exprsn");
  assert.equal(normalizeToken("alice.exprsn."), "alice.exprsn");
  assert.equal(normalizeToken("team.alice"), "team.alice.exprsn");
});

test("normalizeToken rejects invalid labels", () => {
  for (const bad of ["", " ", "exprsn", "-alice", "alice-", "al!ce", "a".repeat(64)]) {
    assert.throws(() => normalizeToken(bad), RecordError, `expected reject: ${bad}`);
  }
});

test("validateIpv6 compresses and rejects non-IPv6", () => {
  assert.equal(validateIpv6("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  assert.throws(() => validateIpv6("192.0.2.1"), RecordError);
});

test("validateEmail normalizes case and rejects junk", () => {
  assert.equal(validateEmail("Admin@Example.COM"), "admin@example.com");
  assert.throws(() => validateEmail("nope"), RecordError);
});

test("validateDnsAddress accepts IPs and hostnames", () => {
  assert.equal(validateDnsAddress("2001:db8::53"), "2001:db8::53");
  assert.equal(validateDnsAddress("192.0.2.53"), "192.0.2.53");
  assert.equal(validateDnsAddress("Ns1.Example.com."), "ns1.example.com");
  assert.throws(() => validateDnsAddress("bad label!"), RecordError);
});

test("Record round-trips through JSON", () => {
  const r = new Record({
    token: "alice",
    ipv6: "2001:db8::1",
    email: "alice@example.com",
    dnsAddress: "ns1.example.com",
  });
  const r2 = Record.fromJSON(r.toJSON());
  assert.equal(r2.token, "alice.exprsn");
  assert.equal(r2.ipv6, "2001:db8::1");
  assert.equal(r2.email, "alice@example.com");
  assert.equal(r2.dnsAddress, "ns1.example.com");
});
