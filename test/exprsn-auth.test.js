import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExprsnCA } from "../src/exprsn-ca.js";
import { ExprsnAuth, AuthError } from "../src/exprsn-auth.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "exprsn-auth-"));
}

function pair() {
  const dir = tmpDir();
  const ca = new ExprsnCA({
    dataPath: path.join(dir, "ca.json"),
    rootKeySize: 2048,
    rootValidityDays: 30,
  });
  const auth = new ExprsnAuth({
    dataPath: path.join(dir, "auth.json"),
    ca,
  });
  return { ca, auth, dir };
}

test("register creates a user, hashes the password, and assigns a username", async () => {
  const { auth } = pair();
  const u = await auth.register({ email: "Alice@Example.com", password: "hunter2" });
  assert.ok(u.id);
  assert.equal(u.email, "alice@example.com");
  assert.equal(u.username, "alice");
  assert.equal(u.permissions.write, true);
  // Public projection must not leak password material.
  assert.equal(u.passwordHash, undefined);
  assert.equal(u.passwordSalt, undefined);
});

test("register rejects duplicate emails and usernames", async () => {
  const { auth } = pair();
  await auth.register({ email: "alice@example.com", password: "hunter2" });
  await assert.rejects(
    () => auth.register({ email: "alice@example.com", password: "x" }),
    AuthError,
  );
  await assert.rejects(
    () => auth.register({ email: "other@example.com", username: "alice", password: "x" }),
    AuthError,
  );
});

test("login mints a CA-signed token whose user matches", async () => {
  const { ca, auth } = pair();
  await auth.register({ email: "alice@example.com", password: "hunter2" });
  const { user, token } = await auth.login({
    email: "alice@example.com",
    password: "hunter2",
  });
  assert.equal(user.email, "alice@example.com");
  assert.ok(token.id);
  assert.ok(token.signature);
  const validation = await ca.validateToken(token.id);
  assert.equal(validation.valid, true);
  assert.equal(validation.user.id, user.id);
});

test("login fails on wrong password", async () => {
  const { auth } = pair();
  await auth.register({ email: "alice@example.com", password: "hunter2" });
  await assert.rejects(
    () => auth.login({ email: "alice@example.com", password: "nope" }),
    AuthError,
  );
});

test("setPassword rotates credentials", async () => {
  const { auth } = pair();
  const u = await auth.register({ email: "alice@example.com", password: "hunter2" });
  await auth.setPassword(u.id, "secret-9");
  await assert.rejects(
    () => auth.login({ email: "alice@example.com", password: "hunter2" }),
    AuthError,
  );
  const ok = await auth.login({ email: "alice@example.com", password: "secret-9" });
  assert.equal(ok.user.id, u.id);
});
