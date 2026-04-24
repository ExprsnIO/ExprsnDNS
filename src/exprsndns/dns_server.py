"""Authoritative DNS server for the .exprsn TLD."""

from __future__ import annotations

import ipaddress
import logging
import threading

from dnslib import QTYPE, RR, A, AAAA, NS, RCODE, SOA, TXT, DNSLabel
from dnslib.server import BaseResolver, DNSLogger, DNSServer

from .models import EXPRSN_TLD
from .storage import Storage

log = logging.getLogger(__name__)

DEFAULT_TTL = 60


class ExprsnResolver(BaseResolver):
    """Resolve .exprsn tokens from the backing Storage."""

    def __init__(
        self,
        storage: Storage,
        ns_host: str = f"ns1.{EXPRSN_TLD}",
        admin_email: str = f"hostmaster.{EXPRSN_TLD}",
        ttl: int = DEFAULT_TTL,
    ) -> None:
        self.storage = storage
        self.ns_host = ns_host
        self.admin_email = admin_email
        self.ttl = ttl
        self._serial = 1

    def _soa_record(self, zone: str) -> RR:
        return RR(
            rname=zone,
            rtype=QTYPE.SOA,
            ttl=self.ttl,
            rdata=SOA(
                mname=self.ns_host,
                rname=self.admin_email,
                times=(self._serial, 3600, 600, 86400, self.ttl),
            ),
        )

    def resolve(self, request, handler):  # type: ignore[override]
        reply = request.reply()
        qname = request.q.qname
        qtype = QTYPE[request.q.qtype]
        name = str(qname).rstrip(".").lower()

        if not (name == EXPRSN_TLD or name.endswith("." + EXPRSN_TLD)):
            reply.header.rcode = RCODE.REFUSED
            return reply

        zone = DNSLabel(EXPRSN_TLD)

        # Apex queries for the zone itself.
        if name == EXPRSN_TLD:
            if qtype in ("SOA", "ANY"):
                reply.add_answer(self._soa_record(zone))
            if qtype in ("NS", "ANY"):
                reply.add_answer(
                    RR(zone, QTYPE.NS, ttl=self.ttl, rdata=NS(self.ns_host))
                )
            if not reply.rr:
                reply.add_auth(self._soa_record(zone))
            return reply

        record = self.storage.get(name)
        if record is None:
            reply.header.rcode = RCODE.NXDOMAIN
            reply.add_auth(self._soa_record(zone))
            return reply

        answered = False
        if qtype in ("AAAA", "ANY"):
            reply.add_answer(
                RR(qname, QTYPE.AAAA, ttl=self.ttl, rdata=AAAA(record.ipv6))
            )
            answered = True
        if qtype in ("NS", "ANY"):
            reply.add_answer(
                RR(qname, QTYPE.NS, ttl=self.ttl, rdata=NS(record.dns_address))
            )
            answered = True
        if qtype in ("TXT", "ANY"):
            reply.add_answer(
                RR(
                    qname,
                    QTYPE.TXT,
                    ttl=self.ttl,
                    rdata=TXT(f"contact={record.email}".encode("ascii")),
                )
            )
            answered = True
        if qtype in ("A", "ANY"):
            # If the stored dns_address is an IPv4 literal, surface it.
            try:
                ipv4 = ipaddress.IPv4Address(record.dns_address)
                reply.add_answer(
                    RR(qname, QTYPE.A, ttl=self.ttl, rdata=A(str(ipv4)))
                )
                answered = True
            except ValueError:
                pass

        if not answered:
            reply.add_auth(self._soa_record(zone))
        return reply


class ExprsnDNSServer:
    """Wrapper that runs a UDP DNS server bound to the given address."""

    def __init__(
        self,
        storage: Storage,
        host: str = "::",
        port: int = 5353,
        ttl: int = DEFAULT_TTL,
        quiet: bool = True,
    ) -> None:
        self.resolver = ExprsnResolver(storage, ttl=ttl)
        logger = DNSLogger(prefix=False) if not quiet else DNSLogger("-request,-reply,-truncated,-error", False)
        self._server = DNSServer(
            self.resolver,
            address=host,
            port=port,
            logger=logger,
        )
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._server.start_thread()
        self._thread = self._server.thread

    def stop(self) -> None:
        self._server.stop()

    def serve_forever(self) -> None:
        self._server.start()
