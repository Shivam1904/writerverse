"""ConsistencyLab tool registry — the one library behind the run-AI buttons.

A *capability* is one "button": a data fetch (read) or a run-AI action, defined
once and invokable by any actor (page button, chat, on-save hook, cron) through a
single `dispatch()`. Big picture: docs/system/map.md.

The contract is Route + the Capability dataclass (spec.py), a registry, and
dispatch(). Capabilities register themselves at import time via the
`register/` subpackage.
"""
from __future__ import annotations

from .dispatch import DispatchResult, dispatch
from .register import (  # noqa: F401  (import for registration side effect)
    _proposals as _reg_proposals,
)
from .registry import all_capabilities, clear, get, names, register, restore, snapshot
from .spec import (
    Actor,
    Capability,
    CapabilityError,
    DispatchContext,
    ProjectScope,
    ProposeWhen,
    Route,
)

__all__ = [
    # contract
    "Actor",
    "Capability",
    "CapabilityError",
    "DispatchContext",
    "ProjectScope",
    "ProposeWhen",
    "Route",
    # registry
    "register",
    "get",
    "names",
    "all_capabilities",
    "clear",
    "snapshot",
    "restore",
    # dispatch
    "dispatch",
    "DispatchResult",
]
