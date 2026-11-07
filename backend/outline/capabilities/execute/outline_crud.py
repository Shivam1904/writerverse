"""Execute layer — outline CRUD.

Holds the unlocked pre-commit work for outline writes. Today that's one thing:
auto-titling a scene that gets prose saved while it still has no title. The
title-generating LLM call MUST run here (gather/execute run against an unlocked
snapshot) and never in commit — commit holds the per-project session lock, and
the dispatch concurrency design keeps LLM calls strictly outside it.

The title itself comes from the free `generate_title` capability, run as a
nested dispatch. So the save stays plain (non-AI) work: an AI policy that
refuses AI never blocks the save (wrt-78).

A scene whose auto-title failed is not retried on every autosave: the failure
leaves an "already tried" mark in the shared (database) cache for an hour (wrt-88). After that
one more try is allowed, so a passing outage heals.
"""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import DispatchContext
from common.tiptap import node_text
from django.core.cache import caches

from outline.models import Scene

logger = logging.getLogger("writerverse.consistency")

# Cap the prose we feed the titler — the opening is what names a scene, and a
# whole chapter of text would be a needlessly large (and slower) title prompt.
_TITLE_SOURCE_CHARS = 2000

# Scene titles read as chapter/scene headings — keep them serious and formal.
_TONE_NOTE = "\n\nThe title should be explanatory. include subject and activity in the title. the tense should be present participle tense."


# How long a failed scene auto-title waits before the next try (seconds).
_TITLE_RETRY_AFTER = 60 * 60

# The mark lives in the Postgres-backed cache: "default" is per-process memory,
# and autosaves on other serverless workers would never see it.
_title_marks = caches["throttle"]


def _title_failed_key(ctx: DispatchContext, scene_id: Any) -> str:
    return f"outline:auto_title_failed:{ctx.project_id}:{scene_id}"


def _title_recently_failed(ctx: DispatchContext, scene_id: Any) -> bool:
    return bool(_title_marks.get(_title_failed_key(ctx, scene_id)))


def _existing_scene_title(ctx: DispatchContext, scene_id: Any, source: str) -> str:
    """`_scene_title` for a scene that already exists, tried at most once per
    `_TITLE_RETRY_AFTER`: a failure (error or empty title) leaves a mark so the
    next autosaves skip the model call."""
    title = _scene_title(ctx, source, f"scene={scene_id}")
    if not title:
        _title_marks.set(_title_failed_key(ctx, scene_id), True, _TITLE_RETRY_AFTER)
    return title


def _scene_title(ctx: DispatchContext, source: str, where: str) -> str:
    """A sentence-case scene title for `source`, or "" if titling failed.
    Never raises: a failed title must not fail the save."""
    res = dispatch("generate_title",
                   {"description": source[:_TITLE_SOURCE_CHARS] + _TONE_NOTE, "case": "sentence"},
                   Actor.INTERNAL, ctx.scope)
    if res.status != "ran":
        logger.error("scene auto-title failed project=%s %s: %s", ctx.project_id, where, res.error)
        return ""
    return ((res.result or {}).get("title") or "").strip()


def execute_save_scene_content(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """If the scene will still be untitled after this save, generate a title.

    Two independent operations in sequence: (1) generate a title from the prose
    being saved, (2) carry it forward so commit adds it to the scene as a direct
    edit on the same write. We never title before the content is saved, and we
    only title when the scene has no title now and none is being set.
    """
    # Just the scene's title (one row): this runs on every prose autosave.
    current_title = (Scene.objects.filter(project_id=ctx.project_id, uid=gathered["scene_id"])
                     .values_list("title", flat=True).first() or "").strip()
    incoming_title = (gathered.get("text") or "").strip()
    if current_title or incoming_title:
        return gathered  # already titled, or a title is being set explicitly

    if _title_recently_failed(ctx, gathered["scene_id"]):
        return gathered  # tried and failed lately: don't call the model on every autosave
    body = node_text(gathered.get("content")).strip()
    if not body:
        return gathered  # nothing to name an empty scene after

    title = _existing_scene_title(ctx, gathered["scene_id"], body)
    if title:
        gathered["_generated_title"] = title
    return gathered


def execute_place_thread_beat(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """When a beat lands in a still-untitled scene, title that scene from its beats.

    Same shape as the scene-content auto-title: generate here (unlocked), carry
    it forward for commit to apply only if the scene is still untitled after the
    placement. The title source is the scene's current beats plus the beat being
    placed — so the very first beat dropped into an empty untitled scene still has
    something to name it after. Because the merge UI places beats one at a time,
    only the first beat into an untitled scene generates a title (one LLM call);
    a dropped heading-block names the scene after its heading.
    """
    from outline.models import OutlineBeat, ThreadBeat

    scene = Scene.objects.filter(project_id=ctx.project_id, uid=gathered["scene_id"]).first()
    if scene is None or (scene.title or "").strip():
        return gathered  # scene gone, or already titled
    if _title_recently_failed(ctx, gathered["scene_id"]):
        return gathered  # tried and failed lately

    texts = [(t or "").strip() for t in OutlineBeat.objects.filter(scene=scene)
             .order_by("position", "id").values_list("text", flat=True)]
    # the beat being placed isn't in the scene yet — its text lives on the source
    # thread item, so resolve it the same way commit will.
    item_text = (ThreadBeat.objects.filter(
        thread__project_id=ctx.project_id, thread__uid=gathered.get("thread_id"),
        uid=gathered.get("item_id"),
    ).values_list("text", flat=True).first())
    if item_text is not None:
        texts.append(item_text.strip())

    desc = "\n".join(t for t in texts if t).strip()
    if not desc:
        return gathered

    title = _existing_scene_title(ctx, gathered["scene_id"], desc)
    if title:
        gathered["_generated_title"] = title
    return gathered


def execute_add_scene_with_beats(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """Title a beat-seeded scene from the beats it's being created with.

    Same two-step shape as scene-content auto-titling: generate a title from the
    joined beat text, then carry it forward for commit to set on the new scene.
    Skipped when the caller passes an explicit title.
    """
    if gathered.get("title"):
        return gathered  # explicit title — don't generate
    desc = "\n".join(
        b["text"] for b in (gathered.get("beats") or []) if b.get("text")
    ).strip()
    if not desc:
        return gathered

    title = _scene_title(ctx, desc, f"chapter={gathered.get('chapter_id')}")
    if title:
        gathered["_generated_title"] = title
    return gathered
