"""Lens data — the chat's view of the lens library, and suggestions."""
from __future__ import annotations

from worldbuilding.store import load_elements


def get_lens_templates(ctx) -> dict:
    """The lens library chat can browse — read from the SAME gauge bank the
    Lenses page shows (`get_gauge_catalogue` + `get_gauge_presets`), so Night
    Eyes never describes a different library than the author sees (SA-244).

    Compact on purpose: one row per lens (no chart/visual config) plus the
    author's own saved presets, so the payload stays small."""
    from gauges.readers import get_gauge_catalogue, get_gauge_presets
    lenses: list[dict] = []
    for t in get_gauge_catalogue(ctx).get("types") or []:
        for lens in t.get("lenses") or []:
            lenses.append({
                "lens_id": lens.get("id"),
                "name": lens.get("name"),
                "type": t.get("id"),
                "kind": t.get("kind_word"),
                "scope_type": lens.get("scope_type"),
                "watches": lens.get("watches"),
            })
    presets = [{
        "preset_id": p.get("id"),
        "name": p.get("name"),
        "type": p.get("type_id"),
        "scope_type": p.get("scope_type"),
        "watches": p.get("watches"),
    } for p in get_gauge_presets(ctx)["presets"]]
    return {"templates": lenses, "presets": presets}


def get_suggestions(ctx) -> dict:
    """Suggested lenses. The discovery pass that produced special charts and
    template fits is gone, so there are none to suggest; the page still needs
    `elements_ready`."""
    elements = load_elements(ctx)
    return {
        "suggestions": [],
        "elements_ready": isinstance(elements, dict) and bool(elements),
    }
