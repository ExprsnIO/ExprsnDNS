#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Storage } from "../src/storage.js";
import { DNSServer } from "../src/dns-server.js";
import { CAClient } from "../src/ca-client.js";
import { createApp } from "../src/api.js";

function usage() {
  console.log(`exprsndns - Dynamic DNS for the .exprsn TLD

Usage: exprsndns [options]

Options:
  --data <path>         JSON datastore path (default: exprsndns.json)
  --dns-host <addr>     DNS bind host (default: ::)
  --dns-port <n>        DNS bind port (default: 5353)
  --api-host <addr>     HTTP API bind host (default: ::)
  --api-port <n>        HTTP API bind port (default: 8053)
  --ttl <seconds>       DNS TTL (default: 60)
  --ca-url <url>        Exprsn-CA base URL (default: \$CA_URL)
  --service-token <t>   X-Service-Token header value (default: \$CA_SERVICE_TOKEN)
  --service-id <id>     X-Service-ID header value (default: exprsn-dns)
  --auto-issue-certs    Request a CA certificate on each new registration
  -h, --help            Show this help
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
  const caClient = new CAClient({
    baseUrl: values["ca-url"] || null,
    serviceId: values["service-id"],
    serviceToken: values["service-token"] || null,
  });

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
    logger: console,
    autoIssueCertificates: values["auto-issue-certs"],
  });
  const apiHost = values["api-host"];
  const apiPort = Number(values["api-port"]);
  const server = app.listen(apiPort, apiHost, () => {
    console.log(`[exprsndns] HTTP API listening on [${apiHost}]:${apiPort}`);
    if (caClient.enabled) {
      console.log(`[exprsndns] Exprsn-CA client -> ${caClient.baseUrl}`);
    } else {
      console.log(`[exprsndns] Exprsn-CA disabled (no --ca-url) - API runs in open dev mode`);
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
