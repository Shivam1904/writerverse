"""Execute layer — gauges (the 3-layer reference model).

No-LLM writes apply their pure ``gauge_binding`` transform against the current
store snapshot and return the new ``gauges`` blob for the commit to persist.
LLM writes (analyse / extract / suggest) reuse ``ai_engine.gauges``.
"""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext
from common.errors import log_exception

import gauges.binding as gb
import gauges.engine as gengine
import gauges.readers as gdata

logger = logging.getLogger("writerverse.consistency")


def _cur(ctx: DispatchContext) -> dict:
    return gdata.load_gauges(ctx)


def _vw(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except ValueError as exc:
        raise CapabilityError(str(exc), 400) from exc


# ---- preset layer (the user's reusable library) --------------------------- #

def execute_create_preset(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    new, pid = _vw(gb.apply_create_preset, _cur(ctx), config=g)
    return {"gauges": new, "ok": True, "preset_id": pid}


def execute_update_preset(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    patch = {k: v for k, v in g.items() if k != "preset_id"}
    new = _vw(gb.apply_update_preset, _cur(ctx), preset_id=g.get("preset_id", ""), patch=patch)
    return {"gauges": new, "ok": True}


def execute_delete_preset(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    new = gb.apply_delete_preset(_cur(ctx), preset_id=g.get("preset_id", ""))
    return {"gauges": new, "ok": True}


def execute_accept_suggestion(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    new, pid = _vw(gb.apply_accept_suggestion, _cur(ctx), id=g.get("id", ""))
    return {"gauges": new, "ok": True, "preset_id": pid}


def execute_accept_invention(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    new, pid = _vw(gb.apply_accept_invention, _cur(ctx), id=g.get("id", ""))
    return {"gauges": new, "ok": True, "preset_id": pid}


def execute_add_invention(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    new, iid = _vw(gb.apply_add_invention, _cur(ctx), spec=g)
    return {"gauges": new, "ok": True, "id": iid}


def execute_dismiss_candidate(kind: str):
    def _ex(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
        new = _vw(gb.apply_dismiss_candidate, _cur(ctx), kind=kind, id=g.get("id", ""))
        return {"gauges": new, "ok": True}
    return _ex


# ---- bind layer (instances) ----------------------------------------------- #

def execute_bind_gauge(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    new, bid = _vw(
        gb.apply_bind, _cur(ctx),
        ref=g.get("ref"), source=g.get("source", ""), lens_id=g.get("lens_id", ""),
        scope_name=g.get("scope_name", ""), scope_type=g.get("scope_type", ""),
        pair=g.get("pair"), block_key=g.get("block_key", ""),
        visual=g.get("visual", ""), report_view=g.get("report_view", ""),
        thread_ref=g.get("thread_ref", ""),
    )
    return {"gauges": new, "ok": True, "binding_id": bid}


def execute_unbind_gauge(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    new = gb.apply_unbind(_cur(ctx), binding_id=g.get("binding_id", ""))
    return {"gauges": new, "ok": True}


def execute_update_gauge(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    patch = {k: v for k, v in g.items() if k != "binding_id"}
    new = _vw(gb.apply_update_binding, _cur(ctx), binding_id=g.get("binding_id", ""), patch=patch)
    return {"gauges": new, "ok": True}


def execute_set_gauge_view(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    patch = {k: g[k] for k in ("visual", "report_view") if k in g}
    new = _vw(gb.apply_update_binding, _cur(ctx), binding_id=g.get("binding_id", ""), patch=patch)
    return {"gauges": new, "ok": True}


# ---- LLM writes ----------------------------------------------------------- #

def execute_analyse_gauge(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    logger.info("gauge/analyse project=%s binding=%s rules=%s",
                ctx.project_id, g["binding_id"], (g["lens"] or {}).get("rules"))
    try:
        result = gengine.run_gauge_analyse(
            g["lens"], g["scope"], g["y_items"], g["grand_outline"],
            g["plot_threads"], g["synopsis"], g["braindumps"],
            thread_ref=g.get("thread_ref", ""),
        )
    except Exception as exc:
        log_exception(logger, "gauge/analyse FAILED project=%s binding=%s",
                         ctx.project_id, g["binding_id"])
        raise CapabilityError("analyse failed", 502) from exc
    result["_binding_id"] = g["binding_id"]
    return result


def execute_extract_gauge_scale(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    lens, ref = g["lens"], g.get("ref") or {}
    # extracted scales live on the CONFIG → only a preset-backed binding can take
    # the write (templates are shared/read-only; section reads live from World).
    if lens.get("y_items_source") == "section":
        return {"deferred": True, "reason": "Section-bound — the scale lives in World."}
    if ref.get("kind") != "preset":
        return {"deferred": True,
                "reason": "Save this as a preset first to extract its scale."}
    try:
        result = gengine.run_gauge_extract(
            lens, g["scope"], g["synopsis"], g["braindumps"],
            g["plot_threads"], g["grand_outline"], g.get("prior_values"),
        )
    except Exception as exc:
        log_exception(logger, "gauge/extract FAILED project=%s binding=%s",
                         ctx.project_id, g["binding_id"])
        raise CapabilityError("extract failed", 502) from exc
    result["_preset_id"] = ref.get("id")
    return result


def _suggest(run_fn, flatten_fn, kind: str):
    def _ex(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
        logger.info("gauge/%s project=%s", kind, ctx.project_id)
        try:
            res = run_fn(g["elements"], g.get("synopsis", ""), g.get("braindumps", []))
        except Exception as exc:
            log_exception(logger, "gauge/%s FAILED project=%s", kind, ctx.project_id)
            raise CapabilityError(f"{kind} failed", 502) from exc
        entries = flatten_fn(res)
        new = gb.apply_add_candidates(_cur(ctx), kind=kind, entries=entries)
        return {"gauges": new, "ok": True, "added": len(entries)}
    return _ex


execute_suggest_gauges = _suggest(
    gengine.run_suggest_gauges, gengine.flatten_suggestions, "suggested")
execute_suggest_custom_gauges = _suggest(
    gengine.run_suggest_custom_gauges, gengine.flatten_inventions, "invented")


def execute_invent_lens_from_ask(ctx: DispatchContext, g: dict[str, Any]) -> dict[str, Any]:
    """Shape ONE lens from the writer's ask. Returns the spec; persists nothing
    (the caller binds it lazily through the attach box)."""
    logger.info("gauge/invent_from_ask project=%s", ctx.project_id)
    try:
        res = gengine.run_invent_lens_from_ask(
            g["ask"], g["elements"], g.get("synopsis", ""), g.get("braindumps", []))
    except Exception as exc:
        log_exception(logger, "gauge/invent_from_ask FAILED project=%s", ctx.project_id)
        raise CapabilityError("invent failed", 502) from exc
    return {"lens": res.get("lens"), "ok": bool(res.get("lens"))}
