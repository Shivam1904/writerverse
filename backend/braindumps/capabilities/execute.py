"""Execute layer — braindumps page (AI annotation, element extraction)."""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext
from common.errors import log_exception

from braindumps.engine.generation import (
    run_draft_world_entity,
    run_init_elements,
    run_promote_character,
)

logger = logging.getLogger("writerverse.consistency")


def _dedup(seq) -> list:
    """Order-preserving de-dup (keeps first occurrence)."""
    seen: set = set()
    out: list = []
    for s in seq:
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _entity_tag(e: dict) -> str:
    """A structured entity {kind,name} → its flat typed tag `kind[Name]`. An untyped
    entity (no kind, e.g. a tolerated legacy payload) falls back to the bare name."""
    if not isinstance(e, dict):
        return str(e or "").strip()
    name = str(e.get("name") or "").strip()
    kind = str(e.get("kind") or "").strip()
    if not name:
        return ""
    return f"{kind}[{name}]" if kind else name


def _ai_tags(ai_data) -> list:
    """The flat tags one annotation put on the idea: craft tags + typed entity
    tags. Empty for a missing or failed annotation (it added no tags)."""
    if not isinstance(ai_data, dict) or ai_data.get("status") != "ok":
        return []
    entity_tags = [_entity_tag(e) for e in (ai_data.get("entities") or [])]
    return list(ai_data.get("tags") or []) + entity_tags


def execute_annotate_braindump(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """Run the AI annotator over one idea's body and build the merged tag list.

    The annotator never raises — on failure it returns a status:"failed" payload,
    which we still persist (so a re-run is possible) but WITHOUT touching the
    visible tags (`tags=None` leaves them as-is). On success, the mirrored flat tag
    list is the union of the author's existing tags + craft tags + the TYPED entity
    tags (`char[John Doe]`, …); per-entity scoped craft tags live in ai_data.entities.

    A re-tag (the idea was tagged before, then edited) REPLACES the old AI tags:
    tags the previous run added are dropped first, so `char[Tony]` goes once the
    text no longer names Tony. Tags the author added by hand stay. The text that
    was tagged is kept in `meta.source_text`, so the page can tell when the idea
    was edited since and offer Re-tag.
    """
    from braindumps.ai import annotator as braindump_annotator

    body = gathered["body"]
    payload = braindump_annotator.annotate(
        body,
        known_entities=gathered.get("known_entities"),
    )
    tags = None
    if payload.get("status") == "ok":
        payload.setdefault("meta", {})["source_text"] = body
        old_ai = set(_ai_tags(gathered.get("previous_ai_data")))
        author_tags = [t for t in (gathered.get("existing_tags") or []) if t not in old_ai]
        tags = _dedup(author_tags + _ai_tags(payload))
    return {
        "braindump_id": gathered["braindump_id"],
        "ai_data": payload,
        "tags": tags,
    }


def execute_init_elements(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """One LLM call → structured elements (story, characters, items, rules).

    Runs the extractor exactly once. The split into per-type proposals happens
    downstream in `preview_init_elements`, not here — so the model sees the whole
    story at once (rule scopes reference characters/items) and we pay one call,
    however many proposals it fans out into.
    """
    try:
        return run_init_elements(
            gathered["synopsis"], gathered["braindumps"],
            title=gathered.get("title", ""),
        )
    except Exception as exc:
        log_exception(logger, "run/init-elements FAILED project=%s", ctx.project_id)
        raise CapabilityError("init elements failed", 502) from exc


def execute_enrich_character(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """One LLM call → a character draft (name/role/description + arcs) from an
    already-created character's braindump material. The fan-out into a single EDIT
    proposal happens in `_preview_enrich_character`; accept goes through
    `commit_enrich_character`, which fills the arc fields on the existing Character
    row (patched by id). The `character_id` rides through to the preview/accept."""
    try:
        res = run_promote_character(
            gathered["name"], gathered["phrases"], gathered["ideas"],
            known_entities=gathered.get("known_entities"),
        )
    except Exception as exc:
        log_exception(logger, "run/enrich-character FAILED project=%s", ctx.project_id)
        raise CapabilityError("enrich character failed", 502) from exc
    res["character_id"] = gathered.get("character_id")
    return res


def execute_draft_world_entity(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """One LLM call → a short description for an already-created world entity, drawn
    from its braindump material. The fan-out into a single content-EDIT proposal
    happens in `_preview_draft_world_entity`; accept goes through
    `commit_draft_world_entity`, which writes the content onto the row by id."""
    try:
        res = run_draft_world_entity(
            gathered["name"], gathered.get("kind") or "",
            gathered["phrases"], gathered["ideas"],
        )
    except Exception as exc:
        log_exception(logger, "run/draft-world-entity FAILED project=%s", ctx.project_id)
        raise CapabilityError("draft world entity failed", 502) from exc
    res["worldbuilding_id"] = gathered.get("worldbuilding_id")
    res["name"] = gathered.get("name")
    res["block"] = gathered.get("block")
    return res
