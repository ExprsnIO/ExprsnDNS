import pytest

from exprsndns.api import create_app
from exprsndns.storage import Storage


@pytest.fixture
def client(tmp_path):
    storage = Storage(tmp_path / "db.json")
    app = create_app(storage)
    app.config["TESTING"] = True
    with app.test_client() as client:
        client.storage = storage
        yield client


def _payload(**overrides):
    base = {
        "token": "alice",
        "ipv6": "2001:db8::1",
        "email": "alice@example.com",
        "dns_address": "ns1.example.com",
    }
    base.update(overrides)
    return base


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok", "records": 0}


def test_create_and_get(client):
    resp = client.post("/records", json=_payload())
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["token"] == "alice.exprsn"

    got = client.get("/records/alice")
    assert got.status_code == 200
    assert got.get_json()["ipv6"] == "2001:db8::1"


def test_create_duplicate_returns_400(client):
    assert client.post("/records", json=_payload()).status_code == 201
    resp = client.post("/records", json=_payload())
    assert resp.status_code == 400


def test_put_upserts(client):
    client.post("/records", json=_payload())
    resp = client.put("/records/alice", json=_payload(ipv6="2001:db8::2"))
    assert resp.status_code == 200
    assert resp.get_json()["ipv6"] == "2001:db8::2"


def test_validation_error(client):
    resp = client.post("/records", json=_payload(ipv6="not-an-ip"))
    assert resp.status_code == 400
    assert "ipv6" in resp.get_json()["error"].lower()


def test_delete(client):
    client.post("/records", json=_payload())
    assert client.delete("/records/alice").status_code == 204
    assert client.delete("/records/alice").status_code == 404


def test_missing_returns_404(client):
    resp = client.get("/records/nobody")
    assert resp.status_code == 404
