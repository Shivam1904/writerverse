"""Commit layer — gauges (3-layer reference model).

Persists gauges straight into the gauge tables (only these caps touch them —
sidesteps the dispatch bookkeeping). `gauges.store.save_gauges` writes only
the rows that changed. Dev-phase: last writer wins (no concurrent users).
"""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import DispatchContext

import gauges.binding as gb
import gauges.readers as gdata


def _save_gauges(ctx: DispatchContext, gauges: dict) -> None:
    from gauges.store import save_gauges
    save_gauges(ctx.project_id, gauges)


def commit_save_gauges(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Every no-LLM / suggest / accept write computes the new blob in execute."""
    g = result.get("gauges")
    if isinstance(g, dict):
        _save_gauges(ctx, g)


def commit_analyse_gauge(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Store one instance's analyse result by binding_id."""
    bid = result.get("_binding_id")
    if not bid:
        return
    g = gb.store_analysis(gdata.load_gauges(ctx), binding_id=bid, analysis=result)
    _save_gauges(ctx, g)

    from notifications.notifications import create_notification
    preset_id = bid.split("|")[0] if bid else "gauge"
    verdict = result.get("verdict") or "Analysis complete"
    create_notification(
        ctx.project_id,
        title=f"Gauge analysed: {preset_id}",
        content=verdict,
        slug="gauge",
        target_url=f"/project/{ctx.project_id}/gauges",
    )


def commit_extract_gauge_scale(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Write the extracted scale onto the PRESET (config layer); section/template
    refs are deferred no-ops."""
    if result.get("deferred"):
        return
    pid = result.get("_preset_id")
    y_items = result.get("y_items")
    if not pid or not isinstance(y_items, list):
        return
    g = gb.apply_update_preset(gdata.load_gauges(ctx), preset_id=pid, patch={"y_items": y_items})
    _save_gauges(ctx, g)
