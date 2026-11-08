"""Gather layer — gauges (the new parallel lens/charts route)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext
from braindumps.readers import all_braindump_texts
from outline.store import load_outline, load_threads
from projects.models import Project
from worldbuilding.store import load_elements

import gauges.readers as gdata


def _story_context(ctx: DispatchContext) -> dict[str, Any]:
    p = Project.objects.filter(pk=ctx.project_id).values("synopsis").first()
    return {
        "grand_outline": load_outline(ctx),
        "plot_threads": load_threads(ctx),
        "synopsis": ((p or {}).get("synopsis") or "").strip(),
        "braindumps": all_braindump_texts(ctx.project_id),
    }


def gather_passthrough(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """No-LLM writes validate + apply in execute; just forward the args."""
    return dict(args)


def gather_analyse_gauge(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    bid = (args.get("binding_id") or "").strip()
    if not bid:
        raise CapabilityError("binding_id required", 400)
    chart = gdata.resolve_binding(ctx, bid)   # reads THROUGH the ref to the config
    if chart is None:
        raise CapabilityError("no such bound gauge", 400)
    return {**chart, **_story_context(ctx)}


def gather_extract_gauge_scale(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    bid = (args.get("binding_id") or "").strip()
    if not bid:
        raise CapabilityError("binding_id required", 400)
    chart = gdata.resolve_binding(ctx, bid)
    if chart is None:
        raise CapabilityError("no such bound gauge", 400)
    prior = [yi["value"] for yi in (chart["y_items"] or []) if yi.get("value")]
    return {**chart, **_story_context(ctx), "prior_values": prior or None}


def _require_elements(ctx: DispatchContext) -> dict[str, Any]:
    elements = load_elements(ctx)
    if not isinstance(elements, dict) or not elements:
        raise CapabilityError("no story elements yet — run init first", 400)
    p = Project.objects.filter(pk=ctx.project_id).values("synopsis").first()
    return {
        "elements": elements,
        "synopsis": ((p or {}).get("synopsis") or "").strip(),
        "braindumps": all_braindump_texts(ctx.project_id),
    }


def gather_suggest_gauges(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    return _require_elements(ctx)


def gather_suggest_custom_gauges(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    return _require_elements(ctx)


def gather_invent_lens_from_ask(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    # Caps refactor Phase 6: arg is `description` (was `ask`); internal key stays `ask`.
    ask = (args.get("description") or args.get("ask") or "").strip()
    if not ask:
        raise CapabilityError("description required", 400)
    return {**_require_elements(ctx), "ask": ask}
