"""Thread-safe JSON-backed storage for Exprsn DNS records."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Iterator

from .models import Record, RecordError, normalize_token


class Storage:
    """Append/update/delete .exprsn records persisted to a JSON file."""

    def __init__(self, path: str | os.PathLike[str]) -> None:
        self._path = Path(path)
        self._lock = threading.RLock()
        self._records: dict[str, Record] = {}
        self._load()

    @property
    def path(self) -> Path:
        return self._path

    def _load(self) -> None:
        if not self._path.exists():
            return
        with self._path.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)
        for entry in raw.get("records", []):
            record = Record.from_dict(entry)
            self._records[record.token] = record

    def _flush_locked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"records": [r.to_dict() for r in self._records.values()]}
        fd, tmp = tempfile.mkstemp(
            prefix=".exprsndns-", suffix=".json", dir=str(self._path.parent)
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2, sort_keys=True)
            os.replace(tmp, self._path)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    def get(self, token: str) -> Record | None:
        key = normalize_token(token)
        with self._lock:
            return self._records.get(key)

    def list(self) -> list[Record]:
        with self._lock:
            return list(self._records.values())

    def __iter__(self) -> Iterator[Record]:
        return iter(self.list())

    def __len__(self) -> int:
        with self._lock:
            return len(self._records)

    def upsert(self, record: Record) -> Record:
        with self._lock:
            existing = self._records.get(record.token)
            if existing is not None:
                record.created_at = existing.created_at
            record.touch()
            self._records[record.token] = record
            self._flush_locked()
            return record

    def create(self, record: Record) -> Record:
        with self._lock:
            if record.token in self._records:
                raise RecordError(f"token already registered: {record.token}")
            self._records[record.token] = record
            self._flush_locked()
            return record

    def delete(self, token: str) -> bool:
        key = normalize_token(token)
        with self._lock:
            if key not in self._records:
                return False
            del self._records[key]
            self._flush_locked()
            return True
