import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../src/storage.js";
import { DNSServer } from "../src/dns-server.js";
import { Record } from "../src/models.js";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exprsndns-test-"));
  return path.join(dir, "db.json");
}

async function populated() {
  const s = new Storage(tmpFile());
  await s.create(new Record({
    token: "alice", ipv6: "2001:db8::1",
    email: "alice@example.com", dnsAddress: "2001:db8::53",
  }));
  await s.create(new Record({
    token: "bob", ipv6: "2001:db8::2",
    email: "bob@example.com", dnsAddress: "ns1.bob.example.com",
  }));
  return new DNSServer({ storage: s });
}

function query(name, type) {
  return {
    id: 1234,
    type: "query",
    flags: 0,
    questions: [{ name, type, class: "IN" }],
  };
}

test("AAAA returns the registered IPv6", async () => {
  const srv = await populated();
  const reply = srv.resolve(query("alice.exprsn", "AAAA"));
  const aaaa = reply.answers.filter((a) => a.type === "AAAA");
  assert.equal(aaaa.length, 1);
  assert.equal(aaaa[0].data, "2001:db8::1");
});

test("NS returns the registered dns_address", async () => {
  const srv = await populated();
  const reply = srv.resolve(query("bob.exprsn", "NS"));
  const ns = reply.answers.filter((a) => a.type === "NS");
  assert.equal(ns.length, 1);
  assert.equal(ns[0].data, "ns1.bob.example.com");
});

test("TXT carries contact=email", async () => {
  const srv = await populated();
  const reply = srv.resolve(query("alice.exprsn", "TXT"));
  const txt = reply.answers.filter((a) => a.type === "TXT");
  assert.equal(txt.length, 1);
  const joined = txt[0].data.map((b) => b.toString("utf8")).join(";");
  assert.match(joined, /contact=alice@example\.com/);
});

test("unknown token returns NXDOMAIN", async () => {
  const srv = await populated();
  const reply = srv.resolve(query("nobody.exprsn", "AAAA"));
  assert.equal(reply.flags & 0x0f, 3);
});

test("non-.exprsn is REFUSED", async () => {
  const srv = await populated();
  const reply = srv.resolve(query("example.com", "AAAA"));
  assert.equal(reply.flags & 0x0f, 5);
});

test("apex SOA", async () => {
  const srv = await populated();
  const reply = srv.resolve(query("exprsn", "SOA"));
  const soa = reply.answers.filter((a) => a.type === "SOA");
  assert.equal(soa.length, 1);
});
