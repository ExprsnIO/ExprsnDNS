import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Embedded Exprsn-Auth.
 *
 * In-process port of the upstream `src/exprsn-auth` service: user
 * registration, password authentication, and CA-issued session tokens.
 *
 * Passwords are stored as PBKDF2-HMAC-SHA256 (310,000 iterations) with a
 * 16-byte random salt. Identifiers are UUIDv4. State persists to a single
 * JSON file, atomically, just like `Storage` and `ExprsnCA`.
 *
 * The auth service does not mint tokens itself - it delegates to the
 * embedded CA, mirroring the upstream split where Exprsn-Auth issues
 * sessions but Exprsn-CA is the signing root.
 */

const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";
const PBKDF2_SALT_BYTES = 16;

const DEFAULT_PERMISSIONS = {
  read: true,
  write: true,
  append: true,
  delete: true,
  update: true,
};

export class ExprsnAuth {
  constructor({ dataPath, ca, defaultPermissions = DEFAULT_PERMISSIONS, logger = null } = {}) {
    if (!dataPath) throw new Error("ExprsnAuth requires dataPath");
    if (!ca) throw new Error("ExprsnAuth requires an ExprsnCA instance");
    this.path = path.resolve(dataPath);
    this.ca = ca;
    this.defaultPermissions = defaultPermissions;
    this.logger = logger;
    this._writing = Promise.resolve();
    this._users = new Map();
    this._byEmail = new Map();
    this._byUsername = new Map();
    this._load();
  }

  // ────────────────────────── persistence ───────────────────────────

  _load() {
    if (!fs.existsSync(this.path)) return;
    const raw = JSON.parse(fs.readFileSync(this.path, "utf8"));
    for (const u of raw.users ?? []) {
      this._users.set(u.id, u);
      if (u.email) this._byEmail.set(u.email, u.id);
      if (u.username) this._byUsername.set(u.username, u.id);
    }
  }

  async _flush() {
    const payload = {
      users: [...this._users.values()].sort((a, b) => a.createdAt - b.createdAt),
    };
    const dir = path.dirname(this.path);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.exprsn-auth-${process.pid}-${Date.now()}.tmp`);
    await fsp.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await fsp.rename(tmp, this.path);
  }

  _serialize(work) {
    const next = this._writing.then(work, work);
    this._writing = next.catch(() => {});
    return next;
  }

  // ─────────────────────────── users ────────────────────────────────

  async register({ email, username, password, permissions } = {}) {
    if (!email || !password) throw new AuthError("email and password are required");
    const normEmail = email.trim().toLowerCase();
    const normUser = (username ?? normEmail.split("@")[0]).trim().toLowerCase();
    if (this._byEmail.has(normEmail)) throw new AuthError("email already registered");
    if (this._byUsername.has(normUser)) throw new AuthError("username already taken");
    const { salt, hash } = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      email: normEmail,
      username: normUser,
      passwordSalt: salt,
      passwordHash: hash,
      passwordIterations: PBKDF2_ITERATIONS,
      passwordDigest: PBKDF2_DIGEST,
      permissions: { ...this.defaultPermissions, ...(permissions ?? {}) },
      createdAt: Date.now(),
      lastLoginAt: null,
    };
    this._users.set(user.id, user);
    this._byEmail.set(user.email, user.id);
    this._byUsername.set(user.username, user.id);
    await this._serialize(() => this._flush());
    return publicUser(user);
  }

  getUser(id) {
    const u = this._users.get(id);
    return u ? publicUser(u) : null;
  }

  findByEmail(email) {
    if (typeof email !== "string") return null;
    const id = this._byEmail.get(email.trim().toLowerCase());
    return id ? publicUser(this._users.get(id)) : null;
  }

  /**
   * Verify credentials and mint a CA-signed token. Returns `{ user, token }`
   * where `token` includes the raw `id` clients use as a bearer.
   */
  async login({ email, password, permissions, expiresAt, expiryType, maxUses } = {}) {
    if (!email || !password) throw new AuthError("email and password are required");
    const id = this._byEmail.get(email.trim().toLowerCase());
    const user = id ? this._users.get(id) : null;
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash, user.passwordIterations, user.passwordDigest)) {
      throw new AuthError("invalid credentials");
    }
    user.lastLoginAt = Date.now();
    await this._serialize(() => this._flush());
    const token = await this.ca.issueToken({
      user: { id: user.id, email: user.email, username: user.username },
      permissions: { ...user.permissions, ...(permissions ?? {}) },
      expiryType: expiryType ?? "time",
      expiresAt,
      maxUses,
    });
    return { user: publicUser(user), token };
  }

  async setPassword(userId, newPassword) {
    const user = this._users.get(userId);
    if (!user) throw new AuthError("user not found");
    const { salt, hash } = hashPassword(newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    user.passwordIterations = PBKDF2_ITERATIONS;
    user.passwordDigest = PBKDF2_DIGEST;
    await this._serialize(() => this._flush());
    return publicUser(user);
  }

  list() {
    return [...this._users.values()].map(publicUser);
  }
}

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

// ─────────────────────── password hashing ─────────────────────────────

function hashPassword(password, salt = crypto.randomBytes(PBKDF2_SALT_BYTES).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash, iterations = PBKDF2_ITERATIONS, digest = PBKDF2_DIGEST) {
  const actual = crypto
    .pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, digest)
    .toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    permissions: u.permissions,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}
