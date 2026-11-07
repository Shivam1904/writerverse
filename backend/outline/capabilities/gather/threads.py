"""Gather layer — threads page (generate_thread, user_wishes_rough)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext
from braindumps.readers import all_braindump_texts
from projects.models import Project

from outline.store import load_threads


def _clean_texts(raw: Any) -> list[str]:
    return [
        (t if isinstance(t, str) else str(t)).strip()
        for t in (raw or [])
        if (t if isinstance(t, str) else str(t)).strip()
    ]


def gather_generate_thread(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    # `braindumps` = the focus set the writer hand-picked for this thread.
    # `all_braindumps` = the full pool for context; falls back to the focus set
    # (and is unioned with it, so the focus is always present in context).
    focus = _clean_texts(args.get("braindumps"))
    if not focus:
        raise CapabilityError("at least one braindump is required", 400)
    all_texts = _clean_texts(args.get("all_braindumps")) or list(focus)
    seen = set(all_texts)
    all_texts = all_texts + [t for t in focus if t not in seen]
    p = Project.objects.filter(pk=ctx.project_id).values("synopsis", "title").first()
    return {
        "braindumps": focus,
        "all_braindumps": all_texts,
        "synopsis": ((p or {}).get("synopsis") or "").strip(),
        "title": ((p or {}).get("title") or "").strip(),
        "existing_threads": load_threads(ctx),
        # Optional scope to stamp on the generated thread (else whole-story).
        "scope_type": (args.get("scope_type") or "").strip() or None,
        "scope_name": (args.get("scope_name") or "").strip() or None,
    }


def gather_generate_thread_from_description(
    ctx: DispatchContext, args: dict[str, Any],
) -> dict[str, Any]:
    """A plain-text description (e.g. the accepted story summary) → the same
    gathered shape generate_thread feeds the engine, with the description
    standing in for the hand-picked braindumps. Reuses the generate_thread
    engine path wholesale — no new prompt."""
    description = str(args.get("description") or "").strip()
    if not description:
        raise CapabilityError("a description is required", 400)
    p = Project.objects.filter(pk=ctx.project_id).values("synopsis", "title").first()
    return {
        "braindumps": [description],
        "all_braindumps": [description],
        "synopsis": ((p or {}).get("synopsis") or "").strip(),
        "title": ((p or {}).get("title") or "").strip(),
        "existing_threads": load_threads(ctx),
    }


def gather_user_wishes_rough(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    p = Project.objects.filter(pk=ctx.project_id).values("synopsis", "title").first()
    syn = ((p or {}).get("synopsis") or "").strip()
    braindumps = all_braindump_texts(ctx.project_id)
    if not syn and not braindumps:
        raise CapabilityError("no synopsis or braindumps to generate from", 400)
    return {
        "synopsis": syn,
        "title": ((p or {}).get("title") or "").strip(),
        "braindumps": braindumps,
    }
