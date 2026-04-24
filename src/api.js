import express from "express";
import { Record, RecordError, normalizeToken } from "./models.js";
import { createAuthMiddleware, requirePermission } from "./auth.js";

/**
 * Build the Express app that exposes the registration management API.
 *
 * Writes are gated on a valid Exprsn-CA bearer token (or CA-Token header);
 * the authenticated identity becomes the record's owner and is used as the
 * subject when requesting a certificate from the CA.
 */
export function createApp({ storage, caClient, logger = null, autoIssueCertificates = false } = {}) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  const auth = createAuthMiddleware({ caClient, required: true, logger });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      records: storage.size,
      ca: caClient?.enabled ? { baseUrl: caClient.baseUrl } : null,
    });
  });

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

  app.post("/records", auth, requirePermission("write"), async (req, res) => {
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

  app.put("/records/:token", auth, requirePermission("update"), async (req, res) => {
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

  app.delete("/records/:token", auth, requirePermission("delete"), async (req, res) => {
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

  app.post("/records/:token/certificate", auth, requirePermission("write"), async (req, res) => {
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

function handleError(err, res) {
  if (err instanceof RecordError) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message });
}

export { normalizeToken };
