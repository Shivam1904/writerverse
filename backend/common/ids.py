"""Short string ids for items stored inside JSON or as `uid` columns.

Format: `<prefix>-<8 hex chars>`, e.g. `sc-1a2b3c4d` for a scene. Pure: no
Django, no WriterVerse app imports.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable


def new_id(prefix: str, *, taken: Callable[[str], bool] | None = None) -> str:
    """A fresh `<prefix>-<hex8>` id. Pass `taken(id) -> bool` to retry until the
    id is not already used (e.g. a DB `exists()` check)."""
    while True:
        uid = f"{prefix}-{uuid.uuid4().hex[:8]}"
        if taken is None or not taken(uid):
            return uid
