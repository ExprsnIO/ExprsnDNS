# ExprsnDNS

A Node.js port of the Exprsn ecosystem focused on DNS services, bundled
together with the `Exprsn-CA` (Certificate Authority) and `Exprsn-Auth`
(Authentication) projects from
[ExprsnIO/Exprsn](https://github.com/ExprsnIO/Exprsn).

## What's inside

```
src/
├── exprsn-dns/    # New authoritative DNS server + REST management API
├── exprsn-ca/     # Certificate Authority (ported from upstream)
├── exprsn-auth/   # Authentication & Authorization (ported from upstream)
└── shared/        # Shared utilities, IPC worker, middleware (from upstream)
```

The three services are wired together as an npm workspaces monorepo. They
share a single `.env` at the repo root so cross-service configuration
(database, Redis, JWT secrets, service URLs) is declared once.

## Prerequisites

- Node.js >= 18
- PostgreSQL 14+
- Redis 6+

Databases expected by default (override via env):

| Service       | Database       |
|---------------|----------------|
| @exprsn/dns   | `exprsn_dns`   |
| @exprsn/ca    | `exprsn_ca`    |
| @exprsn/auth  | `exprsn_auth`  |

## Quick start

```bash
# 1. Clone and install all workspaces
git clone https://github.com/ExprsnIO/ExprsnDNS.git
cd ExprsnDNS
cp .env.example .env
npm install

# 2. Bring up Postgres + Redis however you prefer (docker-compose below)
docker compose up -d postgres redis

# 3. Create schemas and seed
npm run migrate:ca
npm run migrate:auth
npm run setup:dns   # migrate + seed the sample zone

# 4. Start the services (separate terminals)
npm run start:auth  # :3002
npm run start:ca    # :3001
npm run start:dns   # :3053 API + :53 DNS
```

## The DNS service in a nutshell

```bash
dig @127.0.0.1 www.exprsn.local                         # classic DNS
curl 'http://localhost:3053/api/v1/resolve?name=www.exprsn.local&type=A'
curl -X POST http://localhost:3053/api/v1/zones \
  -H 'Authorization: Bearer <JWT>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "example.com",
    "primaryNs": "ns1.example.com",
    "adminEmail": "hostmaster.example.com"
  }'
```

See [`src/exprsn-dns/README.md`](src/exprsn-dns/README.md) for the full API
reference.

## Service topology

```
┌────────────┐    JWT    ┌─────────────┐
│ API client │──────────▶│ @exprsn/dns │──▶ PostgreSQL, Redis
└────────────┘           └─────┬───────┘
                               │ verify JWT
                               ▼
                         ┌─────────────┐
                         │ @exprsn/auth│──▶ SSO, OAuth2, MFA
                         └─────┬───────┘
                               │ request/verify certs
                               ▼
                         ┌─────────────┐
                         │  @exprsn/ca │──▶ PKI, OCSP, CRL
                         └─────────────┘
```

- `@exprsn/auth` mints JWTs (RS256/HS256). The DNS service validates them
  with the shared secret or public key referenced via `DNS_JWT_SECRET`.
- `@exprsn/ca` issues the TLS material used by the DNS service's optional
  DoT/DoH listeners.
- `src/shared` ships the IPC worker and service-token helpers the three
  services use to talk to each other.

## Scripts

Root scripts proxy into the workspaces:

| Script             | Target |
|--------------------|--------|
| `npm run dev:dns`  | nodemon `@exprsn/dns` |
| `npm run start:dns`| `@exprsn/dns` |
| `npm run start:ca` | `@exprsn/ca` |
| `npm run start:auth`| `@exprsn/auth` |
| `npm run setup:dns`| migrate + seed DNS |
| `npm run test`     | Jest across all workspaces |

## License

MIT — see [LICENSE](LICENSE). Upstream sources retained their original
MIT licensing from the [Exprsn project](https://github.com/ExprsnIO/Exprsn).
