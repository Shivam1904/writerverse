"""Gauges serving — the bank (+ presets), the candidate lists, and the board.

3-layer reference model (PLAN §3.5). Reads:
  - ``get_gauge_catalogue``   → shared templates (grouped) + vocab — static
  - ``get_gauge_presets``     → the user's `presets` (per project)
  - ``get_gauge_suggestions`` → the `suggested` candidate list (bank-shape)
  - ``get_gauge_inventions``  → the `invented` candidate list (bank-shape)
  - ``get_gauge_board``       → instances, each RESOLVED through its ref to a config
``resolve_binding`` is the shared resolution for the analyse/extract gather. Old
route untouched.
"""
from __future__ import annotations

from collections.abc import Callable

from outline.store import load_outline, load_threads
from worldbuilding.block_readers import get_world_block

import gauges.engine as gengine


def load_gauges(ctx) -> dict:
    """The project's gauges as one dict, read from the gauge tables (see
    `gauges/store.py`)."""
    from gauges.store import load_gauges as load_rows
    return load_rows(getattr(ctx, "project_id", None))


def _section_resolver(ctx) -> Callable[[str], list[dict]]:
    """``block_key`` → ``[{value, description}]`` live from the bound World block
    (World ≠ the bank; the one live read analyse is allowed)."""
    def resolve(key: str) -> list[dict]:
        blk = get_world_block(ctx, name=key)
        out: list[dict] = []
        for it in blk.get("items") or []:
            title = (it.get("title") or "").strip()
            if title:
                out.append({"value": title, "description": (it.get("content") or "").strip()})
        return out
    return resolve


# --------------------------------------------------------------------------- #
# Reads                                                                        #
# --------------------------------------------------------------------------- #

def get_gauge_catalogue(ctx=None, **_ignore) -> dict:
    """The shared lens templates, grouped by type, + the shared vocab. Static (built
    from config, the same for every project), so the frontend reads it once per
    session. The author's own presets are a separate, small read."""
    return gengine.build_catalogue()


def get_gauge_presets(ctx, **_ignore) -> dict:
    """The author's reusable presets (bank-shaped configs). One query."""
    from gauges.store import load_presets
    return {"presets": load_presets(getattr(ctx, "project_id", None))}


def get_gauge_suggestions(ctx, **_ignore) -> dict:
    """source=suggested — the candidate list (each references a template)."""
    from gauges.store import load_candidates
    sug = load_candidates(getattr(ctx, "project_id", None), "suggested")
    lenses = [gengine.shape_suggestion_item(e) for e in sug if isinstance(e, dict)]
    return {"lenses": [x for x in lenses if x]}


def get_gauge_inventions(ctx, **_ignore) -> dict:
    """source=invented — the candidate list (each carries the full AI spec)."""
    from gauges.store import load_candidates
    inv = load_candidates(getattr(ctx, "project_id", None), "invented")
    lenses = [gengine.shape_invention_item(e) for e in inv if isinstance(e, dict)]
    return {"lenses": [x for x in lenses if x]}


def get_gauge_board(ctx, **_ignore) -> dict:
    """The charts page — every instance, resolved through its ref + scope +
    live section + analysis."""
    g = load_gauges(ctx)
    return gengine.build_board(
        bindings=g.get("bindings") or [],
        presets=g.get("presets") or {},
        analyses=g.get("analyses") or {},
        grand_outline=load_outline(ctx),
        threads=load_threads(ctx),
        section_resolver=_section_resolver(ctx),
    )


# --------------------------------------------------------------------------- #
# Shared resolution for analyse / extract gather                               #
# --------------------------------------------------------------------------- #

def resolve_binding(ctx, binding_id: str) -> dict | None:
    """Resolve a binding to ``{lens(config), scope, y_items, ref, binding_id}`` —
    reads THROUGH the ref to its template/preset (+ live section). None if the
    binding is gone or its ref is stale."""
    from gauges.store import load_binding, load_preset_map
    project_id = getattr(ctx, "project_id", None)
    b = load_binding(project_id, binding_id)   # one row, not every analysis
    if b is None:
        return None
    ref = b.get("ref") or {}
    cfg = gengine.resolve_config(ref.get("id"), ref.get("kind"), load_preset_map(project_id))
    if cfg is None:
        return None
    scope = {"type": b.get("scope_type"), "name": b.get("scope_name")}
    if isinstance(b.get("pair"), list):
        scope["pair"] = b["pair"]
    if cfg.get("y_items_source") == "section" and b.get("block_key"):
        y_items = _section_resolver(ctx)(b["block_key"])
    else:
        y_items = cfg.get("y_items") or []
    return {"lens": cfg, "scope": scope, "y_items": y_items,
            "ref": ref, "binding_id": binding_id,
            "thread_ref": b.get("thread_ref", "")}

