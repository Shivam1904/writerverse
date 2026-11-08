"""Gather layer — braindumps page."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import Actor, CapabilityError, DispatchContext
from characters.models import Character
from outline.store import load_threads
from projects.models import Project

from braindumps.models import Braindump
from braindumps.readers import all_braindump_texts, known_entities_for


def gather_init_elements(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Synopsis + braindumps + working title for Phase-1 element extraction."""
    p = Project.objects.filter(pk=ctx.project_id).values("synopsis", "title").first()
    synopsis = ((p or {}).get("synopsis") or "").strip()
    title = ((p or {}).get("title") or "").strip()
    braindumps = all_braindump_texts(ctx.project_id)
    if not synopsis and not braindumps:
        raise CapabilityError("no synopsis or braindumps to init from", 400)
    return {"synopsis": synopsis, "title": title, "braindumps": braindumps}


def _norm(s) -> str:
    return " ".join(str(s or "").split()).lower()


def _braindump_material_for(project_id, name: str) -> tuple[list[dict], list[str]]:
    """Every annotated phrase (with its craft tags) + the source idea body that
    mention `name`, across the project's braindumps. The canonical `ai_data` lives
    on the Braindump table.
    Shared by the character enrichment + the world-entity draft."""
    nn = _norm(name)
    phrases: list[dict] = []
    ideas: list[str] = []
    seen_ideas: set[str] = set()
    for b in Braindump.objects.filter(project_id=project_id).values("content", "ai_data"):
        ai = b.get("ai_data") or {}
        matched = False
        for p in ai.get("phrases") or []:
            ents = p.get("entities") or []
            hit = next((e for e in ents if _norm(e.get("name") if isinstance(e, dict) else e) == nn), None)
            if hit is not None:
                # v3 ideas carry tags per entity: use THIS one's (Milo's emotion
                # isn't Rosa's). Older ideas only have the phrase's tags.
                own = hit.get("tags") if isinstance(hit, dict) else None
                tags = own if own is not None else (p.get("tags") or [])
                phrases.append({"text": p.get("text") or "", "tags": list(tags)})
                matched = True
        if matched:
            body = (b.get("content") or "").strip()
            if body and body not in seen_ideas:
                seen_ideas.add(body)
                ideas.append(body)
    return phrases, ideas


def gather_enrich_character(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Everything the braindumps say about ONE already-created Character, for the
    enrichment draft. Queued as a follow-up after `promote_to_character` creates the
    row, so `args` carries `character_id` + `name` (name falls back to a lookup by id).
    (Known entity names are still collected for signature compatibility, but the
    draft no longer references them.) Feeds `run_promote_character`."""
    cid = args.get("character_id")
    name = (args.get("name") or "").strip()
    if not name and cid is not None:
        row = (
            Character.objects.filter(project_id=ctx.project_id, id=cid)
            .values("name").first()
        )
        name = ((row or {}).get("name") or "").strip()
    if not name:
        raise CapabilityError("character not found", 404)

    phrases, ideas = _braindump_material_for(ctx.project_id, name)
    if not phrases and not ideas:
        raise CapabilityError(f"no braindumps mention '{name}'", 400)

    return {
        "character_id": cid,
        "name": name,
        "phrases": phrases,
        "ideas": ideas,
        "known_entities": known_entities_for(ctx.project_id),
    }


def gather_draft_world_entity(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Everything the braindumps say about ONE world entity, for its description
    draft. Queued as a follow-up after `promote_to_world_entity` creates the row, so
    `args` carries `worldbuilding_id` + `name` + `block` (+ `kind` for prompt tone).
    Feeds `run_draft_world_entity`."""
    name = (args.get("name") or "").strip()
    if not name:
        raise CapabilityError("name is required", 400)
    phrases, ideas = _braindump_material_for(ctx.project_id, name)
    if not phrases and not ideas:
        raise CapabilityError(f"no braindumps mention '{name}'", 400)
    return {
        "worldbuilding_id": args.get("worldbuilding_id"),
        "name": name,
        "block": (args.get("block") or "").strip(),
        "kind": (args.get("kind") or "").strip(),
        "phrases": phrases,
        "ideas": ideas,
    }


# ---- braindump CRUD (moved from actions/capabilities/gather/crud.py) --- #

def gather_add_braindump(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    body = (args.get("body") or "").strip()
    if not body:
        raise CapabilityError("body is required", 400)
    # An AI (Night Eyes) add is never auto-pinned — the author owns the star /
    # highlight. We just stamp `ai_generated` so the page can show its quiet
    # hover marker. The author's own page add (USER_BUTTON) keeps any pinned arg.
    ai_generated = getattr(ctx, "actor", None) == Actor.CHAT
    return {
        "body": body,
        "subtext": args.get("subtext"),
        "tags": args.get("tags"),
        "pinned": bool(args.get("pinned")) and not ai_generated,
        "ai_generated": ai_generated,
        # Pass the raw value through; commit treats only an explicit False as
        # opt-out (None / absent → annotate). Default ON for every source but the
        # page, which sends false + self-fires.
        "auto_annotate": args.get("auto_annotate"),
    }


def gather_annotate_braindump(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Load the idea's body + current tags + the project's known entity set for the
    annotator. id from `get_braindumps`."""
    braindump_id = args.get("id")
    if braindump_id is None:
        raise CapabilityError("id is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    try:
        b = Braindump.objects.get(project_id=ctx.project_id, id=int(braindump_id))
    except Braindump.DoesNotExist as exc:
        raise CapabilityError("braindump not found", 404) from exc
    known = known_entities_for(
        ctx.project_id,
        exclude_braindump_id=int(braindump_id),
        threads=load_threads(ctx),
    )
    return {
        "braindump_id": int(braindump_id),
        "body": b.content or b.title or "",
        "existing_tags": list(b.tags or []),
        "previous_ai_data": b.ai_data if isinstance(b.ai_data, dict) else {},
        "known_entities": known,
    }


def gather_update_braindump(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    braindump_id = args.get("id")
    if braindump_id is None:
        raise CapabilityError("id is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    fields: dict = {}
    if args.get("body") is not None:
        fields["body"] = args["body"]
    if args.get("subtext") is not None:
        fields["subtext"] = args["subtext"]
    if args.get("tags") is not None:
        fields["tags"] = args["tags"]
    if args.get("pinned") is not None:
        fields["pinned"] = args["pinned"]
    if args.get("ai_data") is not None:
        fields["ai_data"] = args["ai_data"]
    if not fields:
        raise CapabilityError("nothing to update", 400)
    return {"braindump_id": int(braindump_id), "fields": fields}


def gather_delete_braindump(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    braindump_id = args.get("id")
    if braindump_id is None:
        raise CapabilityError("id is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    return {"braindump_id": int(braindump_id)}


def gather_undelete_braindump(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    return gather_delete_braindump(ctx, args)
