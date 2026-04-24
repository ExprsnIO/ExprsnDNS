"""HTTP management API for the Exprsn Dynamic DNS service."""

from __future__ import annotations

from flask import Flask, jsonify, request

from .models import Record, RecordError, normalize_token
from .storage import Storage


def create_app(storage: Storage) -> Flask:
    app = Flask("exprsndns")

    @app.errorhandler(RecordError)
    def _handle_record_error(err: RecordError):
        return jsonify({"error": str(err)}), 400

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "records": len(storage)})

    @app.get("/records")
    def list_records():
        return jsonify({"records": [r.to_dict() for r in storage.list()]})

    @app.post("/records")
    def create_record():
        payload = request.get_json(silent=True) or {}
        record = Record(
            token=payload.get("token", ""),
            ipv6=payload.get("ipv6", ""),
            email=payload.get("email", ""),
            dns_address=payload.get("dns_address", ""),
        )
        storage.create(record)
        return jsonify(record.to_dict()), 201

    @app.get("/records/<path:token>")
    def get_record(token: str):
        record = storage.get(token)
        if record is None:
            return jsonify({"error": "not found"}), 404
        return jsonify(record.to_dict())

    @app.put("/records/<path:token>")
    def upsert_record(token: str):
        payload = request.get_json(silent=True) or {}
        record = Record(
            token=token,
            ipv6=payload.get("ipv6", ""),
            email=payload.get("email", ""),
            dns_address=payload.get("dns_address", ""),
        )
        storage.upsert(record)
        return jsonify(record.to_dict())

    @app.delete("/records/<path:token>")
    def delete_record(token: str):
        # Validate token shape even on delete for consistency.
        normalize_token(token)
        if not storage.delete(token):
            return jsonify({"error": "not found"}), 404
        return ("", 204)

    return app
