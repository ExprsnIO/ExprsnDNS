import pytest

from exprsndns.models import (
    Record,
    RecordError,
    normalize_token,
    validate_dns_address,
    validate_email,
    validate_ipv6,
)


def test_normalize_token_adds_tld():
    assert normalize_token("alice") == "alice.exprsn"
    assert normalize_token("Alice") == "alice.exprsn"
    assert normalize_token("alice.exprsn") == "alice.exprsn"
    assert normalize_token("alice.exprsn.") == "alice.exprsn"
    assert normalize_token("team.alice") == "team.alice.exprsn"


@pytest.mark.parametrize(
    "bad",
    ["", " ", "exprsn", ".exprsn", "-alice", "alice-", "al!ce", "a" * 64],
)
def test_normalize_token_rejects_bad(bad):
    with pytest.raises(RecordError):
        normalize_token(bad)


def test_validate_ipv6_compresses():
    assert validate_ipv6("2001:0db8:0000:0000:0000:0000:0000:0001") == "2001:db8::1"


def test_validate_ipv6_rejects_ipv4():
    with pytest.raises(RecordError):
        validate_ipv6("192.0.2.1")


def test_validate_email():
    assert validate_email("Admin@Example.COM") == "admin@example.com"
    with pytest.raises(RecordError):
        validate_email("not-an-email")


def test_validate_dns_address_ip_and_host():
    assert validate_dns_address("2001:db8::53") == "2001:db8::53"
    assert validate_dns_address("192.0.2.53") == "192.0.2.53"
    assert validate_dns_address("ns1.example.com.") == "ns1.example.com"
    with pytest.raises(RecordError):
        validate_dns_address("bad label!")


def test_record_roundtrip():
    r = Record(
        token="alice",
        ipv6="2001:db8::1",
        email="alice@example.com",
        dns_address="ns1.example.com",
    )
    assert r.token == "alice.exprsn"
    data = r.to_dict()
    r2 = Record.from_dict(data)
    assert r2.token == r.token
    assert r2.ipv6 == r.ipv6
    assert r2.email == r.email
    assert r2.dns_address == r.dns_address
