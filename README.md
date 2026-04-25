# ExprsnDNS

Dynamic DNS service for the **Exprsn** network. Hosts and resolves `.exprsn`
domains and ships with **Exprsn-CA** and **Exprsn-Auth** functionality
incorporated directly into the process — token issuance/validation,
self-signed root + entity X.509 certificates, and password-authenticated user
accounts all live in `src/`. Writes are gated on CA-issued bearer tokens, and
each registration can be bound to an X.509 certificate signed by the local
root.

The same code can also act as a thin client to a separately-deployed
[`ExprsnIO/Exprsn`](https://github.com/ExprsnIO/Exprsn) `exprsn-ca` service
(`--ca-url`).

Each `.exprsn` registration (*Exprsn DNS token*) carries the three required
fields from the spec:

| Field         | Purpose                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `ipv6`        | IPv6 address for the token (served as `AAAA`).                                  |
| `email`       | Owner contact (served as `TXT contact=...`; sourced from the auth identity).    |
| `dns_address` | Downstream DNS address (IP literal or hostname) served as `NS` for the token.   |

## Stack

- Node.js ≥ 20 (ESM).
- `express` for the management HTTP API.
- `dns-packet` + `node:dgram` for the authoritative DNS server.
- `node-forge` for X.509 root + entity certificate issuance.
- `node:crypto` for password hashing (PBKDF2-HMAC-SHA256, 310k iterations) and
  RSA-PSS-SHA256 token signatures.
- Tests via the built-in `node:test` runner.

## Modes

| Mode | Selected by | Description |
| --- | --- | --- |
| **Embedded CA + Auth** *(default)* | no flags | The process runs DNS, the management API, an in-process Exprsn-CA, and an in-process Exprsn-Auth. State is persisted to JSON files. |
| **External CA** | `--ca-url <url>` | The management API forwards token validation and certificate issuance to a remote `exprsn-ca`. |
| **Open dev mode** | `--no-embedded-ca` (and no `--ca-url`) | All write endpoints accept anonymous requests. Useful for local probing only. |

## Install &amp; run

```bash
npm install

# Default: embedded CA + Auth, listening on [::]:5353 (DNS) and [::]:8053 (HTTP)
node bin/exprsndns.js \
  --data exprsndns.json \
  --ca-data exprsn-ca.json \
  --auth-data exprsn-auth.json
```

On first start the embedded CA generates a 2048-bit RSA root certificate
(20-year validity) and writes it to `--ca-data`. Privileged port 53 requires
root; 5353 is the dev default.

To run against a separately-deployed CA instead:

```bash
node bin/exprsndns.js \
  --data exprsndns.json \
  --ca-url http://localhost:3000 \
  --service-token $CA_SERVICE_TOKEN
```

## Embedded Exprsn-CA

`src/exprsn-ca.js` is an in-process port of the parts of upstream
`src/exprsn-ca` that ExprsnDNS depends on. It owns:

- **Root CA** (`ensureRoot`): RSA-2048 self-signed certificate, persisted with
  its private key on first start. Configurable size (`--ca-key-size`) and
  validity (`--ca-validity-days`).
- **Entity certificate issuance** (`issueCertificate`): generates a fresh
  RSA key pair, builds a server/client X.509 with `subjectAltName` (DNS +
  email), signs it with the root, and stores the result.
- **Tokens** (`issueToken` / `validateToken` / `revokeToken`): signed token
  records with `read` / `write` / `append` / `delete` / `update` permissions,
  time-based or use-based expiry, and atomic use-count decrement during
  validation.
- **Persistence**: a single JSON file written atomically (`tmp + rename`).

The token signing format is byte-compatible with upstream:

- Canonicalization: `JSON.stringify(obj, Object.keys(obj).sort())` — note the
  replacer array is applied recursively, which is a load-bearing quirk of the
  upstream format and is preserved intentionally.
- Checksum: `sha256(canonical)`.
- Signature: RSA-PSS, SHA-256, salt length 32, MGF1-SHA256.
- All timestamps are **milliseconds since epoch**.

`canonicalTokenJson`, `tokenChecksum`, and `verifyTokenSignature` are
re-exported from `src/ca-client.js` for use by external services that need to
verify a token without going back through the CA.

When the embedded CA is enabled, the HTTP API also exposes the upstream
service-to-service routes:

```
POST /api/tokens/validate
POST /api/tokens/revoke
POST /api/certificates/generate
GET  /api/ca/root           # raw root certificate PEM
```

These accept (and require, when configured) the upstream
`X-Service-Token` header.

## Embedded Exprsn-Auth

`src/exprsn-auth.js` ports the user-account half of upstream `exprsn-auth`:

- `register({ email, username?, password, permissions? })` — creates a user,
  PBKDF2-HMAC-SHA256 over the password (310,000 iterations, 16-byte random
  salt), returns the public projection.
- `login({ email, password, permissions?, expiresAt?, expiryType?, maxUses? })` —
  verifies credentials and asks the embedded CA to mint a signed token. The
  caller uses `token.id` as the bearer.
- `setPassword`, `getUser`, `findByEmail`, `list`.

State persists to a JSON file. Public user projections never include
password material.

The HTTP API exposes:

```
POST /auth/register
POST /auth/login
GET  /auth/me                # requires bearer
```

## Validating bearer tokens

The HTTP API accepts the two bearer schemes used upstream:

```
Authorization: Bearer <tokenId>
Authorization: CA-Token <tokenId>
```

On each mutating request (`POST`/`PUT`/`DELETE`) the service validates the
token (in-process, against the embedded CA, or via HTTP to the external CA).
The authenticated identity's `user.id` becomes the record's `owner_id` and
`user.email` populates the record's `email`. Subsequent writes by a different
identity are rejected with `403`.

The middleware honors the `permissions` object on the validated token
(`read` / `write` / `update` / `delete` / `append`). A read-only token cannot
`POST /records`.

## Certificate issuance

After a record exists, the owner can request an X.509 certificate:

```
POST /records/<token>/certificate
Authorization: Bearer <tokenId>
```

The certificate is signed by the embedded root (or the external CA, if
configured). The returned certificate `id` is stored on the record and
surfaced in the DNS `TXT` response (`cert=<id>`).

Pass `--auto-issue-certs` to issue a certificate on every new registration.

## HTTP API

All payloads are JSON. Tokens may be submitted bare (`alice`) or fully
qualified (`alice.exprsn`).

```bash
# Register a user and obtain a bearer
curl -X POST http://[::1]:8053/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"hunter2"}'

TOKEN=$(curl -s -X POST http://[::1]:8053/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"hunter2"}' \
  | jq -r .token.id)

# list / get
curl http://[::1]:8053/records
curl http://[::1]:8053/records/alice

# create (requires bearer)
curl -X POST http://[::1]:8053/records \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"token":"alice","ipv6":"2001:db8::1","dns_address":"ns1.example.com"}'

# update / delete (owner-only)
curl -X PUT http://[::1]:8053/records/alice \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"ipv6":"2001:db8::2","dns_address":"ns1.example.com"}'
curl -X DELETE http://[::1]:8053/records/alice -H "authorization: Bearer $TOKEN"

# issue a certificate for the registration
curl -X POST http://[::1]:8053/records/alice/certificate \
  -H "authorization: Bearer $TOKEN"
```

## DNS queries

```bash
dig @::1 -p 5353 alice.exprsn AAAA
dig @::1 -p 5353 alice.exprsn NS
dig @::1 -p 5353 alice.exprsn TXT
```

- `AAAA` → registered IPv6.
- `NS`   → registered `dns_address` (delegates resolution for the token).
- `TXT`  → `contact=<email>`, plus `cert=<id>` / `owner=<id>` when bound.
- Unknown `.exprsn` tokens return `NXDOMAIN`. Non-`.exprsn` queries return `REFUSED`.

## Tests

```bash
npm test
```

54 tests cover:

- model validation (token, IPv6, email, DNS address) and JSON storage,
- DNS resolver behavior (AAAA / NS / TXT / NXDOMAIN / REFUSED / SOA apex),
- CA client (bearer extraction, canonical JSON, checksum, PSS signature
  verify, HTTP validate + issue against an external CA),
- embedded **Exprsn-CA**: root generation, entity X.509 chain validation,
  token issuance/validation, permissions, time/use expiry, revocation,
  RSA-PSS signature, persistence,
- embedded **Exprsn-Auth**: registration, duplicate rejection, login →
  CA-signed token, password rotation,
- end-to-end HTTP API: register → login → create record → issue cert,
  service-to-service `/api/tokens/validate` and `/api/certificates/generate`,
  `/api/ca/root`, ownership and permission gating, dev-mode fallback.
