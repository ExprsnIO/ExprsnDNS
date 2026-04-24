import pytest

from exprsndns.models import Record, RecordError
from exprsndns.storage import Storage


def _record(token="alice", ipv6="2001:db8::1"):
    return Record(
        token=token,
        ipv6=ipv6,
        email="alice@example.com",
        dns_address="ns1.example.com",
    )


def test_create_and_get(tmp_path):
    store = Storage(tmp_path / "db.json")
    store.create(_record())
    got = store.get("alice")
    assert got is not None
    assert got.token == "alice.exprsn"
    assert got.ipv6 == "2001:db8::1"


def test_create_duplicate_rejected(tmp_path):
    store = Storage(tmp_path / "db.json")
    store.create(_record())
    with pytest.raises(RecordError):
        store.create(_record())


def test_upsert_preserves_created_at(tmp_path):
    store = Storage(tmp_path / "db.json")
    first = store.create(_record())
    updated = _record(ipv6="2001:db8::2")
    updated.created_at = 0  # would be overwritten anyway
    store.upsert(updated)
    got = store.get("alice")
    assert got.ipv6 == "2001:db8::2"
    assert got.created_at == first.created_at


def test_delete(tmp_path):
    store = Storage(tmp_path / "db.json")
    store.create(_record())
    assert store.delete("alice") is True
    assert store.delete("alice") is False
    assert store.get("alice") is None


def test_persistence(tmp_path):
    path = tmp_path / "db.json"
    store = Storage(path)
    store.create(_record())
    reopened = Storage(path)
    assert reopened.get("alice") is not None
