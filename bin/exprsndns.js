#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { Storage } from "../src/storage.js";
import { DNSServer } from "../src/dns-server.js";
import { CAClient, EmbeddedCAAdapter } from "../src/ca-client.js";
import { ExprsnCA } from "../src/exprsn-ca.js";
import { ExprsnAuth } from "../src/exprsn-auth.js";
import { createApp } from "../src/api.js";

function usage() {
  console.log(`exprsndns - Dynamic DNS for the .exprsn TLD with embedded
                Exprsn-CA and Exprsn-Auth

Usage: exprsndns [options]

Options:
  --data <path>            JSON datastore path (default: exprsndns.json)
  --dns-host <addr>        DNS bind host (default: ::)
  --dns-port <n>           DNS bind port (default: 5353)
  --api-host <addr>        HTTP API bind host (default: ::)
  --api-port <n>           HTTP API bind port (default: 8053)
  --ttl <seconds>          DNS TTL (default: 60)

  --embedded-ca            Use the embedded Exprsn-CA (default unless --ca-url)
  --no-embedded-ca         Disable the embedded CA (open dev mode)
  --ca-data <path>         CA datastore path (default: exprsn-ca.json)
  --auth-data <path>       Auth datastore path (default: exprsn-auth.json)
  --ca-key-size <bits>     Root CA key size (default: 2048)
  --ca-validity-days <n>   Root CA validity in days (default: 7300)
  --entity-validity-days <n>  Entity certificate validity (default: 365)

  --ca-url <url>           Use external Exprsn-CA at this URL instead of embedded
  --service-token <t>      X-Service-Token header value (default: \$CA_SERVICE_TOKEN)
  --service-id <id>        X-Service-ID header value (default: exprsn-dns)
  --auto-issue-certs       Issue a certificate on each new registration

  -h, --help               Show this help
`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      data: { type: "string", default: "exprsndns.json" },
      "dns-host": { type: "string", default: "::" },
      "dns-port": { type: "string", default: "5353" },
      "api-host": { type: "string", default: "::" },
      "api-port": { type: "string", default: "8053" },
      ttl: { type: "string", default: "60" },

      "embedded-ca": { type: "boolean", default: false },
      "no-embedded-ca": { type: "boolean", default: false },
      "ca-data": { type: "string", default: "exprsn-ca.json" },
      "auth-data": { type: "string", default: "exprsn-auth.json" },
      "ca-key-size": { type: "string", default: "2048" },
      "ca-validity-days": { type: "string", default: "7300" },
      "entity-validity-days": { type: "string", default: "365" },

      "ca-url": { type: "string", default: process.env.CA_URL ?? "" },
      "service-token": { type: "string", default: process.env.CA_SERVICE_TOKEN ?? "" },
      "service-id": { type: "string", default: process.env.CA_SERVICE_ID ?? "exprsn-dns" },
      "auto-issue-certs": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    return;
  }

  const storage = new Storage(values.data);

  // Mode selection: external CA URL takes precedence; otherwise the embedded
  // CA is on by default unless explicitly disabled.
  const externalCa = !!values["ca-url"];
  const useEmbedded = !externalCa && !values["no-embedded-ca"];

  let ca = null;
  let authService = null;
  let caClient;

  if (externalCa) {
    caClient = new CAClient({
      baseUrl: values["ca-url"],
      serviceId: values["service-id"],
      serviceToken: values["service-token"] || null,
    });
  } else if (useEmbedded) {
    ca = new ExprsnCA({
      dataPath: path.resolve(values["ca-data"]),
      rootKeySize: Number(values["ca-key-size"]),
      rootValidityDays: Number(values["ca-validity-days"]),
      entityValidityDays: Number(values["entity-validity-days"]),
      serviceId: values["service-id"],
      logger: console,
    });
    await ca.ensureRoot();
    authService = new ExprsnAuth({
      dataPath: path.resolve(values["auth-data"]),
      ca,
      logger: console,
    });
    caClient = new EmbeddedCAAdapter(ca, { serviceId: values["service-id"] });
    caClient.serviceToken = values["service-token"] || null;
  } else {
    // Open dev mode: no CA at all.
    caClient = new CAClient({ baseUrl: null });
  }

  const dns = new DNSServer({
    storage,
    host: values["dns-host"],
    port: Number(values["dns-port"]),
    ttl: Number(values.ttl),
    logger: console,
  });
  await dns.start();
  console.log(`[exprsndns] DNS listening on [${values["dns-host"]}]:${values["dns-port"]}`);

  const app = createApp({
    storage,
    caClient,
    ca,
    auth: authService,
    logger: console,
    autoIssueCertificates: values["auto-issue-certs"],
  });
  const apiHost = values["api-host"];
  const apiPort = Number(values["api-port"]);
  const server = app.listen(apiPort, apiHost, () => {
    console.log(`[exprsndns] HTTP API listening on [${apiHost}]:${apiPort}`);
    if (externalCa) {
      console.log(`[exprsndns] external Exprsn-CA -> ${caClient.baseUrl}`);
    } else if (useEmbedded) {
      console.log(`[exprsndns] embedded Exprsn-CA + Exprsn-Auth (data: ${values["ca-data"]}, ${values["auth-data"]})`);
    } else {
      console.log(`[exprsndns] Exprsn-CA disabled - API runs in open dev mode`);
    }
  });

  const shutdown = async (signal) => {
    console.log(`[exprsndns] received ${signal}, shutting down`);
    server.close();
    await dns.stop();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
