from dnslib import QTYPE, DNSRecord, RCODE

from exprsndns.dns_server import ExprsnResolver
from exprsndns.models import Record
from exprsndns.storage import Storage


class _Handler:
    """Stub handler; dnslib's BaseResolver ignores it for our logic."""


def _make_resolver(tmp_path):
    storage = Storage(tmp_path / "db.json")
    storage.create(
        Record(
            token="alice",
            ipv6="2001:db8::1",
            email="alice@example.com",
            dns_address="2001:db8::53",
        )
    )
    storage.create(
        Record(
            token="bob",
            ipv6="2001:db8::2",
            email="bob@example.com",
            dns_address="ns1.bob.example.com",
        )
    )
    return ExprsnResolver(storage), storage


def test_resolves_aaaa(tmp_path):
    resolver, _ = _make_resolver(tmp_path)
    q = DNSRecord.question("alice.exprsn", "AAAA")
    reply = resolver.resolve(q, _Handler())
    assert reply.header.rcode == RCODE.NOERROR
    rrs = [r for r in reply.rr if QTYPE[r.rtype] == "AAAA"]
    assert len(rrs) == 1
    assert str(rrs[0].rdata) == "2001:db8::1"


def test_resolves_ns_for_token(tmp_path):
    resolver, _ = _make_resolver(tmp_path)
    q = DNSRecord.question("bob.exprsn", "NS")
    reply = resolver.resolve(q, _Handler())
    assert reply.header.rcode == RCODE.NOERROR
    ns_rrs = [r for r in reply.rr if QTYPE[r.rtype] == "NS"]
    assert len(ns_rrs) == 1
    assert str(ns_rrs[0].rdata).rstrip(".") == "ns1.bob.example.com"


def test_txt_contains_email(tmp_path):
    resolver, _ = _make_resolver(tmp_path)
    q = DNSRecord.question("alice.exprsn", "TXT")
    reply = resolver.resolve(q, _Handler())
    txt_rrs = [r for r in reply.rr if QTYPE[r.rtype] == "TXT"]
    assert len(txt_rrs) == 1
    assert "contact=alice@example.com" in str(txt_rrs[0].rdata)


def test_unknown_token_nxdomain(tmp_path):
    resolver, _ = _make_resolver(tmp_path)
    q = DNSRecord.question("nobody.exprsn", "AAAA")
    reply = resolver.resolve(q, _Handler())
    assert reply.header.rcode == RCODE.NXDOMAIN


def test_refuses_non_exprsn(tmp_path):
    resolver, _ = _make_resolver(tmp_path)
    q = DNSRecord.question("example.com", "AAAA")
    reply = resolver.resolve(q, _Handler())
    assert reply.header.rcode == RCODE.REFUSED


def test_apex_soa(tmp_path):
    resolver, _ = _make_resolver(tmp_path)
    q = DNSRecord.question("exprsn", "SOA")
    reply = resolver.resolve(q, _Handler())
    assert reply.header.rcode == RCODE.NOERROR
    soa = [r for r in reply.rr if QTYPE[r.rtype] == "SOA"]
    assert len(soa) == 1
