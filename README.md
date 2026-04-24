# ExprsnDNS

Dynamic DNS service for the **Exprsn** network. Hosts and performs lookups for
the `.exprsn` TLD. Each registration (an *Exprsn DNS token*) carries three
required fields:

| Field         | Notes                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `ipv6`        | IPv6 address the token points to (served as `AAAA`).                  |
| `email`       | Contact email for the owner (served as `TXT contact=...`).            |
| `dns_address` | Downstream DNS address (IP literal or hostname) served as `NS` for the token. |

The service exposes two surfaces:

- An **authoritative DNS server** for the `.exprsn` zone (UDP).
- An **HTTP management API** for dynamic registration, update, and removal.

## Install

```bash
pip install -e .
```

## Run

```bash
exprsndns --data exprsndns.json --dns-port 5353 --api-port 8053
```

Privileged port 53 requires root; the default is 5353 for development.

## HTTP API

All payloads are JSON. Tokens may be submitted bare (`alice`) or fully
qualified (`alice.exprsn`).

### Create

```bash
curl -X POST http://[::1]:8053/records \
  -H 'content-type: application/json' \
  -d '{"token":"alice","ipv6":"2001:db8::1","email":"alice@example.com","dns_address":"ns1.example.com"}'
```

### Update (upsert)

```bash
curl -X PUT http://[::1]:8053/records/alice \
  -H 'content-type: application/json' \
  -d '{"ipv6":"2001:db8::2","email":"alice@example.com","dns_address":"ns1.example.com"}'
```

### Lookup and delete

```bash
curl http://[::1]:8053/records/alice
curl -X DELETE http://[::1]:8053/records/alice
```

## DNS queries

```bash
dig @::1 -p 5353 alice.exprsn AAAA
dig @::1 -p 5353 alice.exprsn NS
dig @::1 -p 5353 alice.exprsn TXT
```

- `AAAA` -> the registered IPv6.
- `NS`   -> the registered `dns_address` (delegates resolution for the token).
- `TXT`  -> `contact=<email>` for the token owner.
- Unknown `.exprsn` tokens return `NXDOMAIN`. Non-`.exprsn` queries return `REFUSED`.

## Tests

```bash
pip install -e '.[dev]'
pytest
```
