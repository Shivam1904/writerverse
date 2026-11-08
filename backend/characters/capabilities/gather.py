"""Gather layer — characters page."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from characters import fields as cf
from characters import readers
from characters.capabilities.commit import EDITABLE_CHARACTER_FIELDS
from characters.models import Character


def gather_propose_character_edit(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Night-Eyes "edit character" → the same `character_edit` proposal the studio
    pipeline already understands. Collects the editable fields the AI passed into a
    column-keyed `fields` dict (only `EDITABLE_CHARACTER_FIELDS`, empties dropped) and
    looks up the character's name for the card. Preview/accept are shared with the
    enrich flow, so the row is byte-identical to an enrichment proposal."""
    cid = args.get("character_id") or args.get("id")
    if not cid:
        raise CapabilityError("character_id is required", 400)
    char = (
        Character.objects.filter(project_id=ctx.project_id, id=cid)
        .values("id", "name").first()
    )
    if char is None:
        raise CapabilityError("character not found", 404)

    fields: dict[str, Any] = {}
    for f in EDITABLE_CHARACTER_FIELDS:
        if f not in args or args[f] is None:
            continue
        v = args[f]
        if isinstance(v, str):
            v = v.strip()
            if not v:
                continue
        fields[f] = v
    if not fields:
        raise CapabilityError("no editable fields provided", 400)
    if "relationships" in fields:
        # Resolve names → ids and refuse unknown targets NOW, so the proposal
        # (and its SA-209 stamp) holds the exact rows accept will write.
        fields["relationships"] = cf.normalize_relationships(
            ctx.project_id, char["id"], fields["relationships"])
    return {"character_id": char["id"], "name": char["name"], "fields": fields}


def gather_generate_portrait(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Validate the target character + the author's free-text portrait description."""
    character_id = args.get("character_id")
    if not character_id:
        raise CapabilityError("character_id is required", 400)
    description = (args.get("description") or "").strip()
    if not description:
        raise CapabilityError("a description is required", 400)
    char = readers.get_character(ctx.project_id, character_id)
    if char is None:
        raise CapabilityError("character not found", 404)
    return {"character_id": character_id, "description": description}


# ---- plain CRUD (moved from actions/capabilities/*/crud.py) ----------- #

def gather_update_character(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    character_id = args.get("id")
    if character_id is None:
        raise CapabilityError("id is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    # The ONE field list (characters/fields.py). An unknown
    # field is refused, not silently dropped (SA-100).
    unknown = sorted(set(args) - set(cf.AUTHOR_EDITABLE) - {"id"})
    if unknown:
        raise CapabilityError(f"not an editable character field: {', '.join(unknown)}", 400)
    fields: dict = {f: args[f] for f in cf.AUTHOR_EDITABLE if args.get(f) is not None}
    if not fields:
        raise CapabilityError("nothing to update", 400)
    return {"character_id": int(character_id), "fields": fields}


def gather_delete_character(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    character_id = args.get("id")
    if character_id is None:
        raise CapabilityError("id is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    return {"character_id": int(character_id)}


def gather_undelete_character(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    return gather_delete_character(ctx, args)
