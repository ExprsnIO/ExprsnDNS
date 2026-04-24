/**
 * Exprsn DNS - UDP/TCP DNS Server
 *
 * Thin adapter around `dns2` that delegates authoritative answers to the
 * resolver service. Runs UDP and TCP listeners if enabled in config.
 */

const dns2 = require('dns2');
const { Packet } = dns2;
const config = require('../config');
const logger = require('../utils/logger');
const resolver = require('./resolver');
const { QueryLog } = require('../models');

// RFC 1035 § 4.1.1 RCODE values. dns2 does not export these as constants.
const RCODE = {
  NOERROR: 0,
  FORMERR: 1,
  SERVFAIL: 2,
  NXDOMAIN: 3,
  NOTIMP: 4,
  REFUSED: 5
};

function typeName(code) {
  const entry = Object.entries(Packet.TYPE).find(([, v]) => v === code);
  return entry ? entry[0] : String(code);
}

function typeCode(name) {
  return Packet.TYPE[name.toUpperCase()];
}

async function handleQuery(request, send, rinfo) {
  const started = process.hrtime.bigint();
  const response = Packet.createResponseFromRequest(request);
  const question = request.questions && request.questions[0];

  if (!question) {
    response.header.rcode = RCODE.FORMERR;
    return send(response);
  }

  const qname = question.name;
  const qtype = typeName(question.type);
  const qclass = 'IN';

  try {
    const result = await resolver.resolve({ name: qname, type: qtype, class: qclass });

    response.header.rcode = RCODE[result.rcode] ?? RCODE.SERVFAIL;
    response.header.aa = 1;

    for (const a of result.answers) {
      const rr = toDns2Record(a);
      if (rr) response.answers.push(rr);
    }
    for (const a of result.authorities) {
      const rr = toDns2Record(a);
      if (rr) response.authorities.push(rr);
    }
    for (const a of result.additionals) {
      const rr = toDns2Record(a);
      if (rr) response.additionals.push(rr);
    }

    send(response);

    if (config.logging.queryLog.enabled && Math.random() <= config.logging.queryLog.sampleRate) {
      const durationUs = Number((process.hrtime.bigint() - started) / 1000n);
      QueryLog.create({
        clientIp: rinfo?.address,
        protocol: rinfo?.protocol || 'udp',
        qname,
        qtype,
        qclass,
        rcode: result.rcode,
        answers: result.answers.length,
        cached: !!result.cached,
        durationUs
      }).catch((err) => logger.debug('QueryLog insert failed', { error: err.message }));
    }
  } catch (err) {
    logger.error('DNS resolver error', { error: err.message, qname, qtype });
    response.header.rcode = RCODE.SERVFAIL;
    send(response);
  }
}

function toDns2Record(a) {
  const type = typeCode(a.type);
  if (type === undefined) {
    logger.debug('Skipping record with unsupported wire type', { type: a.type });
    return null;
  }
  const base = {
    name: a.name,
    type,
    class: Packet.CLASS.IN,
    ttl: a.ttl
  };
  switch (a.type) {
    case 'A':
    case 'AAAA':
      return { ...base, address: a.address };
    case 'CNAME':
    case 'NS':
    case 'PTR':
      return { ...base, domain: a.domain };
    case 'MX':
      return { ...base, priority: a.priority, exchange: a.exchange };
    case 'TXT':
      return { ...base, data: Array.isArray(a.data) ? a.data.join('') : String(a.data) };
    case 'SRV':
      return { ...base, priority: a.priority, weight: a.weight, port: a.port, target: a.target };
    case 'SOA':
      return {
        ...base,
        primary: a.primary,
        admin: a.admin,
        serial: a.serial,
        refresh: a.refresh,
        retry: a.retry,
        expiration: a.expiration,
        minimum: a.minimum
      };
    case 'CAA':
      return { ...base, flags: a.flags, tag: a.tag, value: a.value };
    default:
      return { ...base, data: a.data };
  }
}

class DnsServer {
  constructor() {
    this.server = null;
  }

  async start() {
    const handler = (request, send, rinfo) =>
      handleQuery(request, send, rinfo);

    const options = { handle: handler };
    if (config.dns.udp.enabled) options.udp = true;
    if (config.dns.tcp.enabled) options.tcp = true;

    this.server = dns2.createServer(options);

    this.server.on('listening', (addrs) => {
      logger.info('DNS server listening', { addrs });
    });

    this.server.on('error', (err, transport) => {
      logger.error('DNS server error', { transport, error: err.message });
    });

    const listenArgs = {};
    if (config.dns.udp.enabled) {
      listenArgs.udp = { port: config.dns.udp.port, address: config.dns.udp.host };
    }
    if (config.dns.tcp.enabled) {
      listenArgs.tcp = { port: config.dns.tcp.port, address: config.dns.tcp.host };
    }

    await this.server.listen(listenArgs);
    return this.server;
  }

  async stop() {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }
}

module.exports = { DnsServer, handleQuery, RCODE };
