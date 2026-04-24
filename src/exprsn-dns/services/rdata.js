/**
 * Exprsn DNS - RDATA parsing / serialization
 *
 * Converts between the textual zone-file form stored in Record.rdata and
 * the structured objects consumed by the `dns2` wire-format encoder.
 *
 * Only the record types listed in Record.SUPPORTED_TYPES are handled.
 */

function parseMx(rdata, data = {}) {
  const parts = rdata.trim().split(/\s+/);
  const priority = data.priority ?? parseInt(parts[0], 10);
  const exchange = data.exchange ?? parts[1];
  return { priority, exchange };
}

function parseSrv(rdata, data = {}) {
  const parts = rdata.trim().split(/\s+/);
  return {
    priority: data.priority ?? parseInt(parts[0], 10),
    weight: data.weight ?? parseInt(parts[1], 10),
    port: data.port ?? parseInt(parts[2], 10),
    target: data.target ?? parts[3]
  };
}

function parseSoa(rdata, data = {}) {
  const parts = rdata.trim().split(/\s+/);
  return {
    primary: data.primary ?? parts[0],
    admin: data.admin ?? parts[1],
    serial: data.serial ?? parseInt(parts[2], 10),
    refresh: data.refresh ?? parseInt(parts[3], 10),
    retry: data.retry ?? parseInt(parts[4], 10),
    expiration: data.expiration ?? parseInt(parts[5], 10),
    minimum: data.minimum ?? parseInt(parts[6], 10)
  };
}

function parseCaa(rdata, data = {}) {
  const parts = rdata.trim().split(/\s+/);
  const flags = data.flags ?? parseInt(parts[0], 10);
  const tag = data.tag ?? parts[1];
  const value = data.value ?? parts.slice(2).join(' ').replace(/^"(.*)"$/, '$1');
  return { flags, tag, value };
}

function parseTxt(rdata, data = {}) {
  if (Array.isArray(data.data)) return { data: data.data };
  const matches = rdata.match(/"([^"]*)"/g);
  const strings = matches ? matches.map((m) => m.slice(1, -1)) : [rdata];
  return { data: strings };
}

/**
 * Convert a stored Record row into the object shape `dns2` expects when
 * appending to an outgoing answer section.
 */
function recordToAnswer(record, absoluteName, defaultTtl) {
  const ttl = record.ttl ?? defaultTtl;
  const base = {
    name: absoluteName,
    type: record.type,
    class: record.class || 'IN',
    ttl
  };

  switch (record.type) {
    case 'A':
    case 'AAAA':
      return { ...base, address: record.data?.address ?? record.rdata.trim() };

    case 'CNAME':
    case 'NS':
    case 'PTR':
      return { ...base, domain: record.data?.domain ?? record.rdata.trim().replace(/\.$/, '') };

    case 'MX': {
      const { priority, exchange } = parseMx(record.rdata, record.data);
      return { ...base, priority, exchange };
    }

    case 'SRV': {
      const { priority, weight, port, target } = parseSrv(record.rdata, record.data);
      return { ...base, priority, weight, port, target };
    }

    case 'TXT': {
      const { data } = parseTxt(record.rdata, record.data);
      return { ...base, data };
    }

    case 'SOA':
      return { ...base, ...parseSoa(record.rdata, record.data) };

    case 'CAA':
      return { ...base, ...parseCaa(record.rdata, record.data) };

    default:
      return { ...base, data: record.rdata };
  }
}

/**
 * Validate rdata matches the declared type and normalize it.
 * Returns { rdata, data } suitable for storage.
 */
function normalizeRdata(type, rdata, data = {}) {
  const trimmed = (rdata || '').trim();
  if (!trimmed && !Object.keys(data).length) {
    throw new Error(`rdata is required for ${type}`);
  }

  switch (type) {
    case 'A': {
      const addr = data.address ?? trimmed;
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) throw new Error(`Invalid A rdata: ${addr}`);
      return { rdata: addr, data: { address: addr } };
    }
    case 'AAAA': {
      const addr = data.address ?? trimmed;
      if (!/^[0-9a-fA-F:]+$/.test(addr) || !addr.includes(':')) {
        throw new Error(`Invalid AAAA rdata: ${addr}`);
      }
      return { rdata: addr, data: { address: addr } };
    }
    case 'CNAME':
    case 'NS':
    case 'PTR': {
      const domain = (data.domain ?? trimmed).replace(/\.$/, '');
      if (!domain) throw new Error(`Invalid ${type} rdata`);
      return { rdata: domain, data: { domain } };
    }
    case 'MX': {
      const parsed = parseMx(trimmed, data);
      if (!Number.isFinite(parsed.priority) || !parsed.exchange) {
        throw new Error(`Invalid MX rdata: ${trimmed}`);
      }
      return { rdata: `${parsed.priority} ${parsed.exchange}`, data: parsed };
    }
    case 'SRV': {
      const parsed = parseSrv(trimmed, data);
      if (!Number.isFinite(parsed.priority) || !parsed.target) {
        throw new Error(`Invalid SRV rdata: ${trimmed}`);
      }
      return { rdata: `${parsed.priority} ${parsed.weight} ${parsed.port} ${parsed.target}`, data: parsed };
    }
    case 'TXT': {
      const parsed = parseTxt(trimmed, data);
      const rebuilt = parsed.data.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(' ');
      return { rdata: rebuilt, data: parsed };
    }
    case 'CAA': {
      const parsed = parseCaa(trimmed, data);
      return { rdata: `${parsed.flags} ${parsed.tag} "${parsed.value}"`, data: parsed };
    }
    case 'SOA': {
      const parsed = parseSoa(trimmed, data);
      return {
        rdata: `${parsed.primary} ${parsed.admin} ${parsed.serial} ${parsed.refresh} ${parsed.retry} ${parsed.expiration} ${parsed.minimum}`,
        data: parsed
      };
    }
    default:
      return { rdata: trimmed, data };
  }
}

module.exports = {
  recordToAnswer,
  normalizeRdata
};
