"""The capability registry: a name -> Capability map with register()/get().

The registry is canonical: every "button" is registered here exactly once. Built-in
capabilities register themselves at import time (Phase 2+); until then the registry
is empty. `clear()` exists for test isolation.
"""
from __future__ import annotations

from .spec import Actor, Capability

_REGISTRY: dict[str, Capability] = {}


def register(cap: Capability) -> Capability:
    """Register a capability. Raises on a duplicate name — names are unique ids
    — and on a `stub` capability that Actor.CHAT can reach.

    Returns the capability so it can be used as a decorator-ish one-liner:
        FOO = register(Capability(name="foo", ...))
    """
    if cap.name in _REGISTRY:
        raise ValueError(f"capability already registered: {cap.name!r}")
    if cap.stub and Actor.CHAT in cap.actors:
        raise ValueError(
            f"stub capability {cap.name!r} must not be chat-callable — drop "
            "Actor.CHAT from its actors until it is built"
        )
    _REGISTRY[cap.name] = cap
    return cap


def get(name: str) -> Capability | None:
    return _REGISTRY.get(name)


def all_capabilities() -> list[Capability]:
    return list(_REGISTRY.values())


def names() -> list[str]:
    return list(_REGISTRY.keys())


def clear() -> None:
    """Test-only: empty the registry. Production code never calls this."""
    _REGISTRY.clear()


def snapshot() -> dict[str, Capability]:
    """Test-only: copy the current registry so a test can restore it after
    mutating. Built-ins register at import time, so tests must restore rather
    than leave the registry cleared."""
    return dict(_REGISTRY)


def restore(snap: dict[str, Capability]) -> None:
    """Test-only: replace the registry contents with a prior snapshot()."""
    _REGISTRY.clear()
    _REGISTRY.update(snap)
