"""Names from other story areas that a character name may clash with.

characters does not import worldbuilding (worldbuilding builds on characters, not the
reverse). So worldbuilding registers a function here at startup (worldbuilding/apps.py),
and the name-collisions endpoint asks this module for the names.

Example: a city called "Haven" -> a character named "Haven" gets a warning.
"""
from collections.abc import Callable

_sources: list[Callable] = []


def register_world_name_source(fn: Callable) -> None:
    """Register fn(project) -> list[str] of world entry titles. Idempotent."""
    if fn not in _sources:
        _sources.append(fn)


def world_names(project) -> list[str]:
    """All registered world titles for a project (empty if none registered)."""
    names: list[str] = []
    for fn in _sources:
        names.extend(fn(project))
    return names
