"""Command-line entry point for the Exprsn Dynamic DNS service."""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading

from .api import create_app
from .dns_server import ExprsnDNSServer
from .storage import Storage


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="exprsndns",
        description="Dynamic DNS service for the Exprsn network (.exprsn)",
    )
    parser.add_argument(
        "--data",
        default="exprsndns.json",
        help="Path to the JSON datastore (default: exprsndns.json)",
    )
    parser.add_argument(
        "--dns-host",
        default="::",
        help="Address to bind the DNS server to (default: ::)",
    )
    parser.add_argument(
        "--dns-port",
        type=int,
        default=5353,
        help="Port for the DNS server (default: 5353)",
    )
    parser.add_argument(
        "--api-host",
        default="::",
        help="Address to bind the HTTP API to (default: ::)",
    )
    parser.add_argument(
        "--api-port",
        type=int,
        default=8053,
        help="Port for the HTTP API (default: 8053)",
    )
    parser.add_argument(
        "--ttl",
        type=int,
        default=60,
        help="TTL for served DNS records in seconds (default: 60)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Verbose logging"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    log = logging.getLogger("exprsndns")

    storage = Storage(args.data)
    log.info("loaded %d records from %s", len(storage), storage.path)

    dns = ExprsnDNSServer(
        storage,
        host=args.dns_host,
        port=args.dns_port,
        ttl=args.ttl,
        quiet=not args.verbose,
    )
    dns.start()
    log.info("DNS server listening on [%s]:%d", args.dns_host, args.dns_port)

    app = create_app(storage)
    stop_event = threading.Event()

    def _shutdown(signum, frame):  # noqa: ARG001
        log.info("received signal %s, shutting down", signum)
        stop_event.set()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    from werkzeug.serving import make_server

    http_server = make_server(args.api_host, args.api_port, app)
    http_thread = threading.Thread(
        target=http_server.serve_forever, name="exprsndns-http", daemon=True
    )
    http_thread.start()
    log.info("HTTP API listening on [%s]:%d", args.api_host, args.api_port)

    try:
        stop_event.wait()
    finally:
        http_server.shutdown()
        dns.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
