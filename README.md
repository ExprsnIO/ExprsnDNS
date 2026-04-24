# ExprsnDNS

Dynamic DNS service for the **Exprsn** network. Hosts and resolves `.exprsn`
domains and integrates with the upstream **Exprsn-CA** and **Exprsn-Auth**
services from [`ExprsnIO/Exprsn`](https://github.com/ExprsnIO/Exprsn) as a
client: writes are gated on CA-issued bearer tokens, and each registration can
optionally be bound to an X.509 certificate issued by the CA.

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
- `node:crypto` for token verification (RSA-PSS SHA-256, salt 32).
- Tests via the built-in `node:test` runner.

## Install &amp; run

```bash
npm install
node bin/exprsndns.js --data exprsndns.json \
  --dns-port 5353 --api-port 8053 \
  --ca-url http://localhost:3000 \
  --service-token $CA_SERVICE_TOKEN
```

Privileged port 53 requires root; 5353 is the dev default. Without `--ca-url`
the API runs in **open dev mode** (no auth, no certificate issuance).

## Exprsn-CA / Exprsn-Auth integration

### Validating bearer tokens

The HTTP API accepts the two bearer schemes used upstream:

```
Authorization: Bearer <tokenId>
Authorization: CA-Token <tokenId>
```

On each mutating request (`POST`/`PUT`/`DELETE`) the service POSTs the token ID
to the CA:

```
POST {CA_URL}/api/tokens/validate
X-Service-ID: exprsn-dns
X-Service-Name: exprsn-dns
X-Service-Token: <configured>
{ "tokenId": "<id>", "permission": "write" }
```

The authenticated identity's `user.id` becomes the record's `owner_id` and
`user.email` populates the record's `email`. Subsequent writes by a different
identity are rejected with `403`.

### Permissions

The middleware honors the `permissions` object on the validated token body
(`read` / `write` / `update` / `delete` / `append`). A read-only token cannot
`POST /records`.

### Certificate issuance

After a record exists, the owner can request an X.509 certificate:

```
POST /records/<token>/certificate
Authorization: Bearer <tokenId>
```

This proxies to `POST {CA_URL}/api/certificates/generate` with the token name
as `commonName` and as a DNS `subjectAltName`. The returned certificate `id`
is stored on the record and surfaced in the DNS `TXT` response
(`cert=<id>`).

Pass `--auto-issue-certs` to request a certificate on every new registration.

### Canonical token signatures

`src/ca-client.js` exports `canonicalTokenJson`, `tokenChecksum`, and
`verifyTokenSignature` that reproduce the upstream token signing semantics
byte-for-byte:

- Canonicalization: `JSON.stringify(obj, Object.keys(obj).sort())` — note the
  replacer array is applied recursively, which is a load-bearing quirk of the
  upstream format and is preserved intentionally.
- Checksum: `sha256(canonical)`.
- Signature: RSA-PSS, SHA-256, salt length 32, MGF1-SHA256.
- All timestamps are **milliseconds since epoch**.

## HTTP API

All payloads are JSON. Tokens may be submitted bare (`alice`) or fully
qualified (`alice.exprsn`).

```bash
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

33 tests cover model validation, JSON storage, DNS resolver behavior
(AAAA/NS/TXT/NXDOMAIN/REFUSED/SOA apex), CA client (bearer extraction,
canonical JSON, checksum, PSS signature verify, validate + issue endpoints),
and HTTP API (auth gating, permission checks, ownership, cert issuance,
dev-mode fallback).
