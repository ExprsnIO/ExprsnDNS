import dgram from "node:dgram";
import net from "node:net";
import dnsPacket from "dns-packet";
import { EXPRSN_TLD } from "./models.js";

export const DEFAULT_TTL = 60;

export class DNSServer {
  constructor({
    storage,
    host = "::",
    port = 5353,
    ttl = DEFAULT_TTL,
    nsHost = `ns1.${EXPRSN_TLD}`,
    adminEmail = `hostmaster.${EXPRSN_TLD}`,
    logger = null,
  } = {}) {
    this.storage = storage;
    this.host = host;
    this.port = port;
    this.ttl = ttl;
    this.nsHost = nsHost;
    this.adminEmail = adminEmail;
    this.logger = logger;
    this.socket = null;
    this._serial = 1;
  }

  async start() {
    const type = net.isIPv6(this.host) || this.host === "::" ? "udp6" : "udp4";
    this.socket = dgram.createSocket({ type, reuseAddr: true });
    this.socket.on("message", (msg, rinfo) => this._onMessage(msg, rinfo));
    this.socket.on("error", (err) => {
      this.logger?.error?.(`dns socket error: ${err.message}`);
    });
    await new Promise((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.bind(this.port, this.host, () => {
        this.socket.removeListener("error", reject);
        resolve();
      });
    });
    const addr = this.socket.address();
    this.port = addr.port;
    return addr;
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.socket) return resolve();
      this.socket.close(() => {
        this.socket = null;
        resolve();
      });
    });
  }

  _soa() {
    return {
      name: EXPRSN_TLD,
      type: "SOA",
      ttl: this.ttl,
      data: {
        mname: this.nsHost,
        rname: this.adminEmail,
        serial: this._serial,
        refresh: 3600,
        retry: 600,
        expire: 86400,
        minimum: this.ttl,
      },
    };
  }

  _onMessage(msg, rinfo) {
    let query;
    try {
      query = dnsPacket.decode(msg);
    } catch (err) {
      this.logger?.warn?.(`dns decode failed: ${err.message}`);
      return;
    }
    const reply = this.resolve(query);
    try {
      const buf = dnsPacket.encode(reply);
      this.socket.send(buf, rinfo.port, rinfo.address);
    } catch (err) {
      this.logger?.error?.(`dns encode/send failed: ${err.message}`);
    }
  }

  resolve(query) {
    const q = query.questions?.[0];
    const reply = {
      id: query.id,
      type: "response",
      flags: dnsPacket.AUTHORITATIVE_ANSWER | dnsPacket.RECURSION_DESIRED,
      questions: q ? [q] : [],
      answers: [],
      authorities: [],
      additionals: [],
    };
    if (!q) {
      reply.flags |= 1; // FORMERR
      return reply;
    }

    const name = (q.name || "").toLowerCase().replace(/\.+$/, "");
    const qtype = q.type;

    if (name !== EXPRSN_TLD && !name.endsWith("." + EXPRSN_TLD)) {
      reply.flags |= 5; // REFUSED
      return reply;
    }

    if (name === EXPRSN_TLD) {
      if (qtype === "SOA" || qtype === "ANY") {
        reply.answers.push(this._soa());
      }
      if (qtype === "NS" || qtype === "ANY") {
        reply.answers.push({
          name: EXPRSN_TLD,
          type: "NS",
          ttl: this.ttl,
          data: this.nsHost,
        });
      }
      if (reply.answers.length === 0) {
        reply.authorities.push(this._soa());
      }
      return reply;
    }

    const record = this.storage.get(name);
    if (!record) {
      reply.flags |= 3; // NXDOMAIN
      reply.authorities.push(this._soa());
      return reply;
    }

    let answered = false;
    if (qtype === "AAAA" || qtype === "ANY") {
      reply.answers.push({
        name: record.token,
        type: "AAAA",
        ttl: this.ttl,
        data: record.ipv6,
      });
      answered = true;
    }
    if (qtype === "NS" || qtype === "ANY") {
      reply.answers.push({
        name: record.token,
        type: "NS",
        ttl: this.ttl,
        data: record.dnsAddress,
      });
      answered = true;
    }
    if (qtype === "TXT" || qtype === "ANY") {
      const parts = [`contact=${record.email}`];
      if (record.certificateId) parts.push(`cert=${record.certificateId}`);
      if (record.ownerId) parts.push(`owner=${record.ownerId}`);
      reply.answers.push({
        name: record.token,
        type: "TXT",
        ttl: this.ttl,
        data: parts.map((s) => Buffer.from(s, "utf8")),
      });
      answered = true;
    }
    if ((qtype === "A" || qtype === "ANY") && net.isIPv4(record.dnsAddress)) {
      reply.answers.push({
        name: record.token,
        type: "A",
        ttl: this.ttl,
        data: record.dnsAddress,
      });
      answered = true;
    }
    if (!answered) {
      reply.authorities.push(this._soa());
    }
    return reply;
  }
}
