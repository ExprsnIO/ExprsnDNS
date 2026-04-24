"""Data model and validation for Exprsn DNS records."""

from __future__ import annotations

import ipaddress
import re
import time
from dataclasses import asdict, dataclass, field

EXPRSN_TLD = "exprsn"

# Token labels: DNS label rules - 1..63 chars, alphanumeric and hyphens,
# cannot start or end with a hyphen. Dots permitted to allow multi-label tokens
# such as "foo.bar" which resolves to foo.bar.exprsn.
_TOKEN_LABEL = re.compile(r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$")
_EMAIL = re.compile(
    r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"
)


class RecordError(ValueError):
    """Raised when a record fails validation."""


def normalize_token(token: str) -> str:
    """Normalize a token to the fully-qualified .exprsn form (no trailing dot)."""
    if not isinstance(token, str) or not token.strip():
        raise RecordError("token must be a non-empty string")
    t = token.strip().lower().rstrip(".")
    if t.endswith("." + EXPRSN_TLD):
        t = t[: -(len(EXPRSN_TLD) + 1)]
    elif t == EXPRSN_TLD:
        raise RecordError("token cannot be the bare .exprsn TLD")
    if not t:
        raise RecordError("token cannot be empty")
    for label in t.split("."):
        if not _TOKEN_LABEL.match(label):
            raise RecordError(f"invalid token label: {label!r}")
    return f"{t}.{EXPRSN_TLD}"


def validate_ipv6(value: str) -> str:
    try:
        addr = ipaddress.IPv6Address(value)
    except (ipaddress.AddressValueError, ValueError, TypeError) as exc:
        raise RecordError(f"invalid IPv6 address: {value!r}") from exc
    return addr.compressed


def validate_email(value: str) -> str:
    if not isinstance(value, str) or not _EMAIL.match(value):
        raise RecordError(f"invalid email address: {value!r}")
    return value.strip().lower()


def validate_dns_address(value: str) -> str:
    """Validate a DNS address - either an IP literal or a hostname."""
    if not isinstance(value, str) or not value.strip():
        raise RecordError("dns_address must be a non-empty string")
    v = value.strip()
    # Try IPv6 first, then IPv4, then hostname.
    try:
        return ipaddress.ip_address(v).compressed
    except ValueError:
        pass
    host = v.rstrip(".").lower()
    if len(host) > 253 or not host:
        raise RecordError(f"invalid dns_address: {value!r}")
    for label in host.split("."):
        if not _TOKEN_LABEL.match(label):
            raise RecordError(f"invalid dns_address label: {label!r}")
    return host


@dataclass
class Record:
    """A single .exprsn DNS registration."""

    token: str
    ipv6: str
    email: str
    dns_address: str
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        self.token = normalize_token(self.token)
        self.ipv6 = validate_ipv6(self.ipv6)
        self.email = validate_email(self.email)
        self.dns_address = validate_dns_address(self.dns_address)

    def touch(self) -> None:
        self.updated_at = time.time()

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Record":
        return cls(
            token=data["token"],
            ipv6=data["ipv6"],
            email=data["email"],
            dns_address=data["dns_address"],
            created_at=float(data.get("created_at", time.time())),
            updated_at=float(data.get("updated_at", time.time())),
        )
