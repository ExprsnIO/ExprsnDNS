import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../src/storage.js";
import { Record, RecordError } from "../src/models.js";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exprsndns-test-"));
  return path.join(dir, "db.json");
}

function sample(overrides = {}) {
  return new Record({
    token: "alice",
    ipv6: "2001:db8::1",
    email: "alice@example.com",
    dnsAddress: "ns1.example.com",
    ...overrides,
  });
}

test("create and get", async () => {
  const s = new Storage(tmpFile());
  await s.create(sample());
  const got = s.get("alice");
  assert.ok(got);
  assert.equal(got.token, "alice.exprsn");
});

test("create rejects duplicates", async () => {
  const s = new Storage(tmpFile());
  await s.create(sample());
  await assert.rejects(() => s.create(sample()), RecordError);
});

test("upsert preserves createdAt", async () => {
  const s = new Storage(tmpFile());
  const first = await s.create(sample());
  await new Promise((r) => setTimeout(r, 5));
  const updated = sample({ ipv6: "2001:db8::2" });
  await s.upsert(updated);
  const got = s.get("alice");
  assert.equal(got.ipv6, "2001:db8::2");
  assert.equal(got.createdAt, first.createdAt);
});

test("delete returns true then false", async () => {
  const s = new Storage(tmpFile());
  await s.create(sample());
  assert.equal(await s.delete("alice"), true);
  assert.equal(await s.delete("alice"), false);
});

test("persists across instances", async () => {
  const p = tmpFile();
  const s = new Storage(p);
  await s.create(sample());
  const s2 = new Storage(p);
  assert.ok(s2.get("alice"));
});
