import express from "express";
import { Record, RecordError, normalizeToken } from "./models.js";
import { createAuthMiddleware, requirePermission } from "./auth.js";
import { extractBearer } from "./ca-client.js";
import { AuthError } from "./exprsn-auth.js";

/**
 * Build the Express app that exposes the registration management API.
 *
 * Writes are gated on a valid Exprsn-CA bearer token (or CA-Token header).
 * The authenticated identity becomes the record's owner and is used as the
 * subject when requesting a certificate from the CA.
 *
 * When the embedded `ExprsnCA` and `ExprsnAuth` modules are passed in, this
 * app additionally exposes the upstream Exprsn-CA / Exprsn-Auth routes
 * (`/api/tokens/validate`, `/api/certificates/generate`, `/auth/register`,
 * `/auth/login`) so the same process serves DNS, CA, and Auth roles.
 */
export function createApp({
  storage,
  caClient,
  ca = null,
  auth: authService = null,
  logger = null,
  autoIssueCertificates = false,
} = {}) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  const authMiddleware = createAuthMiddleware({ caClient, required: true, logger });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      records: storage.size,
      ca: caClient?.enabled ? { baseUrl: caClient.baseUrl, embedded: !!ca } : null,
      auth: authService ? { embedded: true, users: authService.list().length } : null,
    });
  });

  // ───────────────────── DNS records ─────────────────────────────────

  app.get("/records", (req, res) => {
    res.json({ records: storage.list().map((r) => r.toJSON()) });
  });

  app.get("/records/:token", (req, res) => {
    try {
      const rec = storage.get(req.params.token);
      if (!rec) return res.status(404).json({ error: "not found" });
      res.json(rec.toJSON());
    } catch (err) {
      handleError(err, res);
    }
  });

  app.post("/records", authMiddleware, requirePermission("write"), async (req, res) => {
    try {
      const rec = buildRecord(req.body, req.auth);
      await storage.create(rec);
      if (autoIssueCertificates && caClient?.enabled && !req.auth.anonymous) {
        await maybeIssueCertificate({ storage, caClient, record: rec, auth: req.auth, logger });
      }
      res.status(201).json(rec.toJSON());
    } catch (err) {
      handleError(err, res);
    }
  });

  app.put("/records/:token", authMiddleware, requirePermission("update"), async (req, res) => {
    try {
      const existing = storage.get(req.params.token);
      if (existing && !canModify(existing, req.auth)) {
        return res.status(403).json({ error: "token owned by another identity" });
      }
      const rec = buildRecord({ ...req.body, token: req.params.token }, req.auth);
      await storage.upsert(rec);
      res.json(rec.toJSON());
    } catch (err) {
      handleError(err, res);
    }
  });

  app.delete("/records/:token", authMiddleware, requirePermission("delete"), async (req, res) => {
    try {
      const existing = storage.get(req.params.token);
      if (!existing) return res.status(404).json({ error: "not found" });
      if (!canModify(existing, req.auth)) {
        return res.status(403).json({ error: "token owned by another identity" });
      }
      await storage.delete(req.params.token);
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

  app.post("/records/:token/certificate", authMiddleware, requirePermission("write"), async (req, res) => {
    if (!caClient?.enabled) {
      return res.status(503).json({ error: "CA integration not configured" });
    }
    try {
      const rec = storage.get(req.params.token);
      if (!rec) return res.status(404).json({ error: "not found" });
      if (!canModify(rec, req.auth)) {
        return res.status(403).json({ error: "token owned by another identity" });
      }
      const cert = await caClient.issueCertificate({
        token: rec.token,
        email: rec.email,
        ownerId: rec.ownerId,
      });
      if (cert?.id) {
        rec.certificateId = cert.id;
        rec.touch();
        await storage.upsert(rec);
      }
      res.status(201).json(cert);
    } catch (err) {
      handleError(err, res);
    }
  });

  // ───────────── Embedded Exprsn-Auth routes (optional) ──────────────

  if (authService) {
    app.post("/auth/register", async (req, res) => {
      try {
        const user = await authService.register(req.body ?? {});
        res.status(201).json({ user });
      } catch (err) {
        if (err instanceof AuthError) {
          return res.status(400).json({ error: err.message });
        }
        handleError(err, res);
      }
    });

    app.post("/auth/login", async (req, res) => {
      try {
        const { user, token } = await authService.login(req.body ?? {});
        res.json({ user, token });
      } catch (err) {
        if (err instanceof AuthError) {
          return res.status(401).json({ error: err.message });
        }
        handleError(err, res);
      }
    });

    app.get("/auth/me", authMiddleware, (req, res) => {
      if (req.auth?.anonymous) return res.status(401).json({ error: "not authenticated" });
      const user = authService.getUser(req.auth.ownerId);
      res.json({ auth: req.auth, user });
    });
  }

  // ────────────── Embedded Exprsn-CA routes (optional) ───────────────
  //
  // These reproduce the upstream Exprsn-CA endpoints used by service-to-
  // service callers, gated on the configured X-Service-Token. ExprsnDNS's
  // own middleware does not call out via HTTP when the embedded CA is in
  // use - this is for *other* services that still expect a remote CA.

  if (ca) {
    app.post("/api/tokens/validate", requireServiceAuth(caClient), async (req, res) => {
      try {
        const tokenId = req.body?.tokenId ?? extractBearer(req.headers.authorization);
        if (!tokenId) return res.status(400).json({ error: "tokenId required" });
        const result = await ca.validateToken(tokenId, {
          resource: req.body?.resource,
          permission: req.body?.permission,
        });
        if (!result.valid) {
          return res.status(401).json({ valid: false, error: result.error });
        }
        res.json(result);
      } catch (err) {
        handleError(err, res);
      }
    });

    app.post("/api/tokens/revoke", requireServiceAuth(caClient), async (req, res) => {
      try {
        const { tokenId, reason } = req.body ?? {};
        if (!tokenId) return res.status(400).json({ error: "tokenId required" });
        const token = await ca.revokeToken(tokenId, reason);
        res.json({ token });
      } catch (err) {
        handleError(err, res);
      }
    });

    app.post("/api/certificates/generate", requireServiceAuth(caClient), async (req, res) => {
      try {
        const body = req.body ?? {};
        const subject = body.subject ?? {};
        const cert = await ca.issueCertificate({
          token: subject.commonName,
          email: subject.emailAddress,
          ownerId: body.ownerId ?? null,
          altNames: body.altNames,
          keySize: body.keySize,
          validityDays: body.validityDays,
        });
        res.status(201).json(cert);
      } catch (err) {
        handleError(err, res);
      }
    });

    app.get("/api/ca/root", (req, res) => {
      const pem = ca.rootCertificatePem();
      if (!pem) return res.status(404).json({ error: "root not initialized" });
      res.type("application/x-pem-file").send(pem);
    });
  }

  return app;
}

function buildRecord(payload, auth) {
  const email = auth?.email ?? payload?.email;
  const ownerId = auth?.ownerId ?? null;
  return new Record({
    token: payload?.token,
    ipv6: payload?.ipv6,
    email,
    dnsAddress: payload?.dns_address,
    ownerId,
  });
}

function canModify(record, auth) {
  if (!record.ownerId) return true;
  if (!auth || auth.anonymous) return false;
  return record.ownerId === auth.ownerId;
}

async function maybeIssueCertificate({ storage, caClient, record, auth, logger }) {
  try {
    const cert = await caClient.issueCertificate({
      token: record.token,
      email: record.email,
      ownerId: auth.ownerId,
    });
    if (cert?.id) {
      record.certificateId = cert.id;
      record.touch();
      await storage.upsert(record);
    }
  } catch (err) {
    logger?.warn?.(`auto cert issuance failed for ${record.token}: ${err.message}`);
  }
}

function requireServiceAuth(caClient) {
  return function serviceAuth(req, res, next) {
    const expected = caClient?.serviceToken;
    if (!expected) return next();
    const supplied = req.headers["x-service-token"];
    if (supplied === expected) return next();
    return res.status(401).json({ error: "service authentication required" });
  };
}

function handleError(err, res) {
  if (err instanceof RecordError) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message });
}

export { normalizeToken };
