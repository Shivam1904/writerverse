"""Scene analysis pipelines — a factory for on-save AI analyses over scene prose.

Each *pipeline* is one AI analysis (summary, pacing, continuity, …). Registering
one with `register_scene_pipeline(...)` produces a `Route.WRITE` capability
`analyze_scene__<key>` that:

  - gather:  locates the scene in `grand_outline`, extracts its prose body
  - execute: runs the (Django-free) analyzer — defensively wrapped, never crashes
  - commit:  writes `scene["analysis"][<key>] = result` to that scene's row only
             (under the project write lock); marks `outline` for refetch

Pipelines run on scene save as best-effort follow-ups, exactly like braindump
annotation. `save_scene_content` and the standalone `analyze_scene` fan-out both
call `queue_scene_pipelines()` to enqueue one follow-up per ENABLED pipeline.

Switches live on `Project.scene_pipelines` = {<key>: bool}
(see `outline/store.py`). A missing key falls back to the pipeline's
`default_enabled`.

This module holds the reusable plumbing; `register/scene_pipelines.py` registers
the real pipelines + the fan-out/switch capabilities at import time.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from actions.capabilities.registry import register
from actions.capabilities.spec import (
    Actor,
    Capability,
    CapabilityError,
    DispatchContext,
    Route,
)
from common.tiptap import node_text

from outline.store import load_scene_pipelines, save_scene_pipelines

logger = logging.getLogger("writerverse.consistency")

CAP_PREFIX = "analyze_scene__"
_ANALYSIS_KEY = "analysis"                # the per-scene dict of pipeline outputs

# Analyzer signature: (body: str, *, context: dict | None) -> dict
AnalyzeFn = Callable[..., dict]
# Optional per-pipeline context loader: (ctx, scene_dict) -> dict merged into the
# gathered payload (e.g. an entity list, preceding-scene prose). Runs unlocked.
GatherContextFn = Callable[..., dict]
# Optional post-process applied to the analyzer's output at commit (locked, Django
# side): (ctx, data) -> data. For DB-dependent enrichment the Django-free analyzer
# can't do — e.g. resolving extracted nouns to entity ids. Best-effort.
EnrichFn = Callable[..., dict]


@dataclass(frozen=True)
class ScenePipeline:
    key: str
    label: str
    analyze: AnalyzeFn
    default_enabled: bool = True
    cost: str = "medium"
    gather_context: GatherContextFn | None = None
    enrich: EnrichFn | None = None

    @property
    def cap_name(self) -> str:
        return f"{CAP_PREFIX}{self.key}"


_PIPELINES: dict[str, ScenePipeline] = {}


# --------------------------------------------------------------------------- #
# Scene lookup / switch helpers
# --------------------------------------------------------------------------- #

def _locate_scene(ctx: DispatchContext, scene_id: str) -> dict | None:
    """The one scene as a dict (its beats and prose), without loading the outline."""
    from outline.outline_writes import get_item, item_dict
    row = get_item(ctx.project_id, "scene", scene_id)
    return item_dict(ctx.project_id, "scene", row) if row is not None else None


def _switches(ctx: DispatchContext) -> dict:
    return load_scene_pipelines(ctx)


def is_enabled(ctx: DispatchContext, pipeline: ScenePipeline) -> bool:
    """Effective on/off: the project's switch wins, else the pipeline default."""
    val = _switches(ctx).get(pipeline.key)
    return pipeline.default_enabled if val is None else bool(val)


def queue_scene_pipelines(ctx: DispatchContext, scene_id: str) -> list[dict]:
    """One follow-up per ENABLED pipeline — the shared fan-out used by both
    `save_scene_content` (auto, on save) and the standalone `analyze_scene`."""
    return [
        {"capability": p.cap_name, "args": {"scene_id": scene_id}}
        for p in _PIPELINES.values()
        if is_enabled(ctx, p)
    ]


# --------------------------------------------------------------------------- #
# Per-pipeline layer callables (built per pipeline by the factory)
# --------------------------------------------------------------------------- #

def _run_analyzer(pipeline: ScenePipeline, gathered: dict) -> dict:
    """Run the analyzer best-effort: a raise becomes a stored failure payload,
    a non-dict is wrapped, and `status` always defaults to "ok"."""
    try:
        out = pipeline.analyze(gathered.get("body") or "", context=gathered)
    except Exception as exc:  # noqa: BLE001 — best-effort; never crash dispatch
        logger.exception("scene pipeline %s failed scene=%s",
                         pipeline.key, gathered.get("scene_id"))
        return {"status": "failed", "error": str(exc)[:200]}
    if not isinstance(out, dict):
        out = {"status": "ok", "value": out}
    out.setdefault("status", "ok")
    return out


def _make_gather(pipeline: ScenePipeline):
    def gather(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
        scene_id = args.get("scene_id")
        if not scene_id:
            raise CapabilityError("scene_id is required", 400)
        scene = _locate_scene(ctx, scene_id)
        if scene is None:
            raise CapabilityError(f"scene {scene_id!r} not found", 404)
        gathered = {
            "scene_id": scene_id,
            "body": node_text(scene.get("content")).strip(),
            "title": (scene.get("text") or "").strip(),
        }
        if pipeline.gather_context is not None:
            gathered.update(pipeline.gather_context(ctx, scene) or {})
        return gathered
    return gather


def _make_execute(pipeline: ScenePipeline):
    def execute(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
        return {"scene_id": gathered["scene_id"], "data": _run_analyzer(pipeline, gathered)}
    return execute


def _make_commit(pipeline: ScenePipeline):
    def commit(ctx: DispatchContext, result: dict[str, Any]) -> None:
        from outline.outline_writes import get_item
        # Only the scene's own row: `analysis` is a column on it.
        scene = get_item(ctx.project_id, "scene", result["scene_id"])
        if scene is None:
            logger.warning("scene pipeline %s: scene %s gone at commit",
                           pipeline.key, result["scene_id"])
            return
        data = result["data"]
        analysis = scene.analysis if isinstance(scene.analysis, dict) else {}
        prev = analysis.get(pipeline.key)
        if data.get("status") == "failed" and isinstance(prev, dict) and prev.get("status") == "ok":
            # A failed re-run must not wipe the last good analysis.
            logger.warning("scene pipeline %s failed scene=%s; keeping previous analysis (%s)",
                           pipeline.key, result["scene_id"], data.get("error"))
            return
        if pipeline.enrich is not None:
            try:
                data = pipeline.enrich(ctx, data) or data
            except Exception:  # noqa: BLE001 — enrichment is best-effort; store raw
                logger.exception("scene pipeline %s enrich failed scene=%s",
                                 pipeline.key, result["scene_id"])
        scene.analysis = {**analysis, pipeline.key: data}
        scene.save(update_fields=["analysis"])
        result["_invalidates"] = list({*(result.get("_invalidates") or []), "outline"})
    return commit


# --------------------------------------------------------------------------- #
# The factory
# --------------------------------------------------------------------------- #

def register_scene_pipeline(
    key: str,
    label: str,
    analyze: AnalyzeFn,
    *,
    default_enabled: bool = True,
    cost: str = "medium",
    description: str | None = None,
    gather_context: GatherContextFn | None = None,
    enrich: EnrichFn | None = None,
) -> Capability:
    """Register one scene-analysis pipeline. Returns the underlying Capability.

    Adds it to the pipeline registry (so `queue_scene_pipelines` / the switch API
    see it) and registers a `Route.WRITE` capability `analyze_scene__<key>` with
    shared gather/execute/commit. The analyzer is `(body, *, context) -> dict`,
    lives in `ai_engine` (Django-free), and is best-effort (never raises).

    `gather_context(ctx, scene) -> dict` optionally loads extra context (an entity
    list, preceding-scene prose, …) merged into the analyzer's `context`. It runs
    unlocked in gather, so it may hit the DB.

    `enrich(ctx, data) -> data` optionally post-processes the analyzer's output at
    commit (locked, Django side) — for DB-dependent work the analyzer can't do,
    e.g. resolving extracted nouns to entity ids. Best-effort: a raise stores raw.
    """
    pipeline = ScenePipeline(
        key=key, label=label, analyze=analyze,
        default_enabled=default_enabled, cost=cost,
        gather_context=gather_context, enrich=enrich,
    )
    _PIPELINES[key] = pipeline
    return register(Capability(
        name=pipeline.cap_name,
        description=(description or (
            f"Run the '{label}' analysis on one scene's prose and store it at "
            f"scene.analysis.{key}. Best-effort; on-save pipeline."
        )),
        route=Route.WRITE,
        args={"scene_id": "string"},
        gather=_make_gather(pipeline),
        execute=_make_execute(pipeline),
        commit=_make_commit(pipeline),
        uses_ai=True,  # every pipeline runs an AI analyzer over the prose
        label=f"Scene check: {label}",
        # Scene pipelines are on-save hooks, never a chat tool pick.
        actors=(Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON),
    ))


# --------------------------------------------------------------------------- #
# Fan-out + switch capabilities (gather/commit; registered in register/)
# --------------------------------------------------------------------------- #

def gather_analyze_scene(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    scene_id = args.get("scene_id")
    if not scene_id:
        raise CapabilityError("scene_id is required", 400)
    return {"scene_id": scene_id}


def commit_analyze_scene(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Fan-out only: queue one follow-up per enabled pipeline. `run_followups`
    (the facade) dispatches them after the lock releases."""
    result["_followups"] = queue_scene_pipelines(ctx, result["scene_id"])


def gather_get_scene_pipelines(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    return {}


def read_scene_pipelines(ctx: DispatchContext, _gathered: dict[str, Any]) -> dict[str, Any]:
    """READ: the toggle list with each pipeline's effective enabled state."""
    return {"pipelines": [
        {
            "key": p.key,
            "label": p.label,
            "enabled": is_enabled(ctx, p),
            "default_enabled": p.default_enabled,
            "cost": p.cost,
        }
        for p in _PIPELINES.values()
    ]}


def gather_set_scene_pipeline(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    key = (args.get("key") or "").strip()
    if not key:
        raise CapabilityError("key is required", 400)
    if key not in _PIPELINES:
        raise CapabilityError(f"unknown scene pipeline: {key!r}", 404)
    if "enabled" not in args:
        raise CapabilityError("enabled is required", 400)
    return {"key": key, "enabled": bool(args.get("enabled"))}


def commit_set_scene_pipeline(ctx: DispatchContext, result: dict[str, Any]) -> None:
    switches = dict(_switches(ctx))
    switches[result["key"]] = result["enabled"]
    save_scene_pipelines(ctx, switches)
