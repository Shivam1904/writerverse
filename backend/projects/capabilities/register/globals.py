"""Capability registrations — global tools (new-style).

Available on every Night Eyes frame regardless of page:
  - get_project_meta — top-of-context grounding for this story
  - generate_title — few-word title utility (button-only; `from_project` names the book)
"""
from __future__ import annotations

from typing import Any

from actions.awareness.evaluate import run_shadow_nudges
from actions.capabilities.registry import register
from actions.capabilities.spec import (
    Actor,
    Capability,
    CapabilityError,
    DispatchContext,
    Route,
)

from projects.capabilities.execute_titles import execute_generate_title
from projects.capabilities.gather import gather_generate_title
from projects.models import Project


def _project_census(ctx: DispatchContext, p) -> dict[str, int]:
    """Caps refactor Phase 6: cheap counts of everything in the project — pointers
    for the AI to decide what to drill into (get_characters, get_world_entities,
    get_plot_threads, get_outline, get_braindumps), never the detail itself."""
    from braindumps.models import Braindump
    from characters.models import Character
    from outline.models import PlotThread
    from worldbuilding.models import Worldbuilding
    return {
        "characters": Character.objects.filter(project_id=ctx.project_id).count(),
        "world_entities": Worldbuilding.objects.filter(project_id=ctx.project_id).count(),
        "threads": PlotThread.objects.filter(project_id=ctx.project_id).count(),
        "chapters": p.total_chapters,
        "braindumps": Braindump.objects.filter(project_id=ctx.project_id).count(),
    }


def _gather_project_meta(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    try:
        p = Project.objects.get(pk=ctx.project_id)
    except Project.DoesNotExist as exc:
        raise CapabilityError(f"project {ctx.project_id} not found", 404) from exc
    if ctx.actor is Actor.USER_BUTTON:
        # The project page loading = an author visit: check (and only LOG) which
        # nudges would fire. Throttled; never raises. See awareness/evaluate.py.
        run_shadow_nudges(ctx)
    return {
        "id": p.id,
        "title": p.title,
        "description": p.description or "",
        "synopsis": p.synopsis or "",
        "genres": list(p.genres or []),
        "tones": list(p.tones or []),
        "themes": list(p.themes or []),
        "logline": p.logline or "",
        "perspective": p.perspective or "",
        "tense": p.tense or "",
        "audience": p.audience or "",
        "status": p.status,
        "target_word_count": p.target_word_count,
        "total_word_count": p.total_word_count,
        "total_acts": p.total_acts,
        "total_chapters": p.total_chapters,
        "total_scenes": p.total_scenes,
        "counts": _project_census(ctx, p),
    }


register(Capability(
    name="get_project_meta",
    tool_name="get_project_overview",
    description=(
        "The project at a glance: its metadata (title, synopsis, genre, themes, "
        "tones, logline, POV, tense, audience, word counts) plus a `counts` "
        "census of everything in it — characters, world_entities, threads, "
        "chapters, braindumps. Pointers, not detail: drill in with the matching "
        "get_* tool. Use this to ground any suggestion in what this story is."
    ),
    route=Route.READ,
    gather=_gather_project_meta,
))


register(Capability(
    name="generate_title",
    label="Suggested a title",
    uses_ai=True,
    description=(
        "Generate a short title (a few words) from a free-text `description`. "
        "Pure utility — reads only its inputs, writes nothing, "
        "and returns {title, alternatives}. Use to name a scene, chapter, "
        "thread, or idea; the caller decides what to do with the result. "
        "`case` is \"title\" (default, Title Case) or \"sentence\" (scene headings). "
        "`from_project` (instead of `description`) names the book itself from its "
        "synopsis and the author's ideas."
    ),
    route=Route.READ,
    args={"description": "string?", "case": "string?", "from_project": "bool?"},
    gather=gather_generate_title,
    execute=execute_generate_title,
    actors=(Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON),
))
