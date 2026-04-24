/**
 * Exprsn DNS - Authentication middleware
 *
 * Accepts either:
 *   - A bearer JWT (verified locally with the shared secret, and optionally
 *     cross-checked with exprsn-auth via the CA token validator).
 *   - An Exprsn-DNS API key header: `X-Exprsn-DNS-Key: <prefix>.<secret>`.
 *
 * Populates req.auth = { subject, scopes, source }.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { ApiKey } = require('../models');

function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({ error: 'unauthorized', message });
}

function forbidden(res, message = 'Forbidden') {
  return res.status(403).json({ error: 'forbidden', message });
}

async function verifyApiKey(headerValue) {
  if (!headerValue || !headerValue.includes('.')) return null;
  const [prefix, secret] = headerValue.split('.', 2);
  const hash = crypto.createHash('sha256').update(secret).digest('hex');
  const row = await ApiKey.findOne({ where: { keyPrefix: prefix, keyHash: hash } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  row.lastUsedAt = new Date();
  await row.save();
  return {
    subject: row.ownerId || `apikey:${row.id}`,
    scopes: row.scopes || [],
    source: 'api-key'
  };
}

function verifyJwt(header) {
  const match = /^Bearer\s+(.+)$/i.exec(header || '');
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], config.security.jwt.secret, {
      issuer: config.security.jwt.issuer,
      audience: config.security.jwt.audience,
      algorithms: config.security.jwt.algorithms
    });
    return {
      subject: payload.sub,
      scopes: payload.scopes || payload.scope?.split(' ') || [],
      source: 'jwt'
    };
  } catch (err) {
    logger.debug('JWT verification failed', { error: err.message });
    return null;
  }
}

function authenticate(options = {}) {
  const required = options.required !== false && config.security.requireAuth;
  return async (req, res, next) => {
    try {
      const apiKeyHeader = req.header('X-Exprsn-DNS-Key') || req.header('X-API-Key');
      let auth = apiKeyHeader ? await verifyApiKey(apiKeyHeader) : null;
      if (!auth) auth = verifyJwt(req.header('Authorization'));

      if (!auth) {
        if (!required) return next();
        return unauthorized(res);
      }
      req.auth = auth;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requireScope(...scopes) {
  return (req, res, next) => {
    if (!req.auth) return unauthorized(res);
    const granted = new Set(req.auth.scopes || []);
    if (granted.has('*') || granted.has('admin')) return next();
    const missing = scopes.find((s) => !granted.has(s));
    if (missing) return forbidden(res, `Missing scope: ${missing}`);
    return next();
  };
}

module.exports = { authenticate, requireScope };
