# @exprsn/dns

Authoritative DNS server with a REST management API for the Exprsn ecosystem.

## Features

- UDP + TCP authoritative DNS server (port 53 by default) built on `dns2`.
- REST API for zone & record CRUD, guarded by either JWTs from `@exprsn/auth`
  or service-scoped API keys.
- Sequelize models backed by PostgreSQL.
- Redis-backed answer cache with zone-scoped invalidation.
- Sampled query log table for observability.
- DNSSEC / TSIG metadata tables ready for signing integrations.
- HTTP `/resolve` endpoint for operator smoke-tests.

## Quick start

```bash
cd src/exprsn-dns
npm install
export DNS_DB_SYNC=true   # dev only; creates tables on boot
npm run setup             # migrate + seed the sample zone
npm start
```

The API listens on `:3053` and the DNS server on UDP/TCP `:53`.

Try:

```bash
# HTTP resolver
curl 'http://localhost:3053/api/v1/resolve?name=www.exprsn.local&type=A'

# Classic DNS
dig @127.0.0.1 www.exprsn.local
```

## Environment

All settings live in the root `.env`. See `../../.env.example` for the full
set of `DNS_*` variables.

## API

| Method | Path | Scope |
|--------|------|-------|
| GET    | `/api/v1/zones` | `zones:read` |
| POST   | `/api/v1/zones` | `zones:write` |
| GET    | `/api/v1/zones/:id` | `zones:read` |
| PATCH  | `/api/v1/zones/:id` | `zones:write` |
| DELETE | `/api/v1/zones/:id` | `zones:write` |
| GET    | `/api/v1/zones/by-name/:name` | `zones:read` |
| GET    | `/api/v1/zones/:id/records` | `zones:read` |
| POST   | `/api/v1/zones/:id/records` | `zones:write` |
| PATCH  | `/api/v1/zones/:id/records/:rid` | `zones:write` |
| DELETE | `/api/v1/zones/:id/records/:rid` | `zones:write` |
| GET    | `/api/v1/resolve?name=&type=` | public if `DNS_REQUIRE_AUTH=false` |
| GET    | `/health/live`, `/health/ready` | public |

Authenticate with either:

- `Authorization: Bearer <JWT>` issued by `@exprsn/auth`
- `X-Exprsn-DNS-Key: <prefix>.<secret>` for service API keys

## Integration with the Exprsn services

- **@exprsn/auth** mints JWTs whose `scopes` claim is honored by the DNS API.
- **@exprsn/ca** issues TLS material for DoT/DoH listeners (via
  `DNS_DOT_CERT_PATH` / `DNS_DOT_KEY_PATH`).

## Tests

```bash
npm test
```
