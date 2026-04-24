import { extractBearer } from "./ca-client.js";

/**
 * Build Express middleware that gates writes on an Exprsn-Auth / Exprsn-CA
 * bearer token.
 *
 * If the CA client is disabled (no baseUrl), the middleware becomes a no-op
 * and attaches a synthetic anonymous identity. This is intended for local
 * development only; production deployments MUST configure a CA baseUrl.
 */
export function createAuthMiddleware({ caClient, required = true, logger = null } = {}) {
  return async function authMiddleware(req, res, next) {
    if (!caClient?.enabled) {
      req.auth = { anonymous: true };
      return next();
    }
    const bearer = extractBearer(req.headers.authorization) ||
      extractBearer(req.headers["ca-token"]);
    if (!bearer) {
      if (!required) {
        req.auth = { anonymous: true };
        return next();
      }
      return res.status(401).json({ error: "missing bearer token" });
    }
    try {
      const result = await caClient.validateToken(bearer, {
        forwardedFor: req.ip,
      });
      if (!result.valid) {
        return res.status(401).json({ error: result.error || "invalid token" });
      }
      req.auth = {
        anonymous: false,
        tokenId: bearer,
        token: result.token,
        user: result.user,
        ownerId: result.user?.id ?? result.token?.issuer?.certificateSerial ?? null,
        email: result.user?.email ?? null,
        permissions: result.token?.permissions ?? {},
      };
      return next();
    } catch (err) {
      logger?.error?.(`auth validation error: ${err.message}`);
      return res.status(503).json({ error: "auth upstream unavailable" });
    }
  };
}

export function requirePermission(permission) {
  return function permissionCheck(req, res, next) {
    if (req.auth?.anonymous) return next();
    const perms = req.auth?.permissions ?? {};
    if (perms[permission]) return next();
    return res.status(403).json({ error: `missing permission: ${permission}` });
  };
}
