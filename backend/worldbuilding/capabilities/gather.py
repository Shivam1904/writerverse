"""Gather layer — World page writes (worldbuilding entries, blocks, entities)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext


def gather_add_worldbuilding(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    title = (args.get("title") or "").strip()
    if not title:
        raise CapabilityError("title is required", 400)
    return {
        "title": title,
        "content": (args.get("content") or "").strip(),
        "tags": args.get("tags"),
        "pnote": (args.get("pnote") or "").strip(),
    }


def gather_update_worldbuilding(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    worldbuilding_id = args.get("id")
    if worldbuilding_id is None:
        raise CapabilityError("id is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    fields: dict = {}
    for f in ("title", "content", "tags", "pnote", "status", "color"):
        if args.get(f) is not None:
            fields[f] = args[f]
    if not fields:
        raise CapabilityError("nothing to update", 400)
    return {"worldbuilding_id": int(worldbuilding_id), "fields": fields}


def gather_delete_worldbuilding(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    worldbuilding_id = args.get("id")
    if worldbuilding_id is None:
        raise CapabilityError("id is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    return {"worldbuilding_id": int(worldbuilding_id)}


def gather_undelete_worldbuilding(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    return gather_delete_worldbuilding(ctx, args)


# ---- world blocks (sections) ---------------------------------------------- #
# A "block" is a World-page heading; its items are worldbuilding rows tagged with
# it. Empty / author-added headings have no row to anchor them, so they persist
# as `WorldBlock` rows. See worldbuilding/block_readers.py.

def gather_add_world_block(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    name = (args.get("name") or "").strip()
    if not name:
        raise CapabilityError("block name is required", 400)
    # glyph / color are optional presentation hints the author picked in the UI
    # (a known EntityMark kind like "location", or a hex/token + a tint). They're
    # persisted verbatim so a custom section keeps its look across reloads.
    return {
        "name": name,
        "glyph": (args.get("glyph") or "").strip() or None,
        "color": (args.get("color") or "").strip() or None,
    }


def gather_update_world_block(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Edit a section heading's presentation — label (display name), hint
    (subtitle), glyph, color. Only the passed fields are touched; the block's
    canonical key (the tag its items carry) is never renamed here, so items stay
    filed. An empty string clears that override back to the default."""
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    name = (args.get("name") or "").strip()
    if not name:
        raise CapabilityError("block name is required", 400)
    out: dict[str, Any] = {"name": name}
    for f in ("label", "hint", "glyph", "color"):
        if f in args and args[f] is not None:
            out[f] = str(args[f]).strip()  # "" clears the override
    if len(out) == 1:
        raise CapabilityError("nothing to update — pass label, hint, glyph or color", 400)
    return out


# ---- world entities (block + index) --------------------------------------- #

def gather_add_world_entity(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Caps refactor Phase 2: one entity, addressed by its category (`entity_type`,
    stored as the row's tag). `description` maps to the Worldbuilding `content`."""
    entity_type = (args.get("entity_type") or "").strip()
    if not entity_type:
        raise CapabilityError("`entity_type` is required", 400)
    title = (args.get("title") or "").strip()
    if not title:
        raise CapabilityError("`title` is required", 400)
    return {
        "entity_type": entity_type,
        "title": title,
        "description": (args.get("description") or ""),
    }


def gather_update_world_entity(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Caps refactor Phase 2: edit ONE entity by entity_id (the Worldbuilding DB
    id), not block + index. `description` maps to the `content` column."""
    entity_id = args.get("entity_id")
    if entity_id in (None, ""):
        raise CapabilityError("`entity_id` is required", 400)
    fields: dict[str, Any] = {}
    if args.get("title") is not None:
        fields["title"] = args["title"]
    if args.get("description") is not None:
        fields["content"] = args["description"]
    if not fields:
        raise CapabilityError("pass `title` and/or `description` to update", 400)
    return {"entity_id": entity_id, "fields": fields}
