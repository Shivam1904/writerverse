"""Staleness config loader (D31).

Reads `backend/actions/config/staleness.yml` once and exposes the two lookups the
dispatch layer and Night Eyes need:

  - `invalidates_for(cap_name)`  -> list[domain]  (mutations only)
  - `read_domain_for(cap_name)`  -> domain | None (reads only)

No imports from `actions.capabilities` — keep this leaf module clean so
`capabilities.dispatch` can import it without a cycle (mirrors `sigs.py`).
"""
from __future__ import annotations

from pathlib import Path

import yaml

_CACHE: dict | None = None


def _load() -> dict:
    global _CACHE
    if _CACHE is None:
        path = Path(__file__).resolve().parents[1] / "config" / "staleness.yml"
        raw = yaml.safe_load(path.read_text())
        domains = raw.get("domains") or {}
        # Pre-compute reverse maps for O(1) lookup.
        mutated_by: dict[str, list[str]] = {}
        read_by: dict[str, str] = {}
        for domain, spec in domains.items():
            for cap in spec.get("mutated_by") or []:
                mutated_by.setdefault(cap, []).append(domain)
            for cap in spec.get("read_by") or []:
                # A read serves at most one domain. If two configs collide,
                # last write wins — config error worth surfacing in CI later.
                read_by[cap] = domain
        _CACHE = {
            "domains": list(domains.keys()),
            "mutated_by": mutated_by,
            "read_by": read_by,
        }
    return _CACHE


def invalidates_for(cap_name: str) -> list[str]:
    """Which domains a successful mutation through `cap_name` dirties."""
    return list(_load()["mutated_by"].get(cap_name, ()))


def read_domain_for(cap_name: str) -> str | None:
    """Which domain a read tool's result belongs to (None for unmapped reads)."""
    return _load()["read_by"].get(cap_name)

