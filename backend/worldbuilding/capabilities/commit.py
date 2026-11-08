"""Commit layer — World page writes (worldbuilding entries, blocks, entities)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import DispatchContext

from worldbuilding import readers as wb
from worldbuilding.block_readers import block_key, known_label
from worldbuilding.models import WorldBlock

# ---- worldbuilding -------------------------------------------------------- #

def commit_accept_add_worldbuilding(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Accept-time write for the add_worldbuilding PROPOSE flow.

    add_worldbuilding now proposes (Route.PROPOSE / AI_ONLY): the AI's call
    leaves a Proposal row; the author's own World-page add auto-applies via this
    same path. The original add args ride on the row and are loaded by
    `gather_from_proposal` into `result["args"]` — we create the entry from them,
    exactly the write the old direct-WRITE commit did, just deferred behind the
    accept. `result["worldbuilding"]` is set so the button auto-apply path can
    hand the created row straight back to the World page (`addWorldItem`)."""
    args = result.get("args") or {}
    row = wb.create_worldbuilding(
        ctx.project_id,
        title=args.get("title", ""),
        content=args.get("content", ""),
        tags=args.get("tags"),
        pnote=args.get("pnote", ""),
    )
    result["worldbuilding"] = row


def commit_update_worldbuilding(ctx: DispatchContext, result: dict[str, Any]) -> None:
    row = wb.patch_worldbuilding(
        ctx.project_id, result["worldbuilding_id"], result["fields"],
    )
    result["worldbuilding"] = row


def commit_delete_worldbuilding(ctx: DispatchContext, result: dict[str, Any]) -> None:
    deleted = wb.delete_worldbuilding(ctx.project_id, result["worldbuilding_id"])
    result.update(deleted)


def commit_undelete_worldbuilding(ctx: DispatchContext, result: dict[str, Any]) -> None:
    result["worldbuilding"] = wb.undelete_worldbuilding(
        ctx.project_id, result["worldbuilding_id"],
    )


# ---- world blocks (sections) ---------------------------------------------- #
# Blocks are tags on worldbuilding rows. add/delete here only manage the *custom
# heading registry* (one WorldBlock row per heading) — so an empty author-added
# section persists. Items themselves are added/removed via add/delete_worldbuilding
# (filed into a block by tagging the row with the block name).

def commit_add_world_block(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Register a (possibly empty) section heading. Idempotent — re-adding an
    existing block (case-insensitively) is a no-op."""
    raw = result["name"]
    key = block_key(raw)
    glyph = result.get("glyph")
    color = result.get("color")
    block, created = WorldBlock.objects.get_or_create(
        project_id=ctx.project_id, name=key,
        defaults={"label": raw, "glyph": glyph or "", "color": color or ""},
    )
    if not created and (glyph or color):
        # Re-adding is idempotent on identity, but a fresh glyph/color updates the
        # look (lets the author re-pick without a separate edit capability).
        if glyph:
            block.glyph = glyph
        if color:
            block.color = color
        block.save(update_fields=["glyph", "color", "updated_at"])

    known = known_label(key)
    result["block"] = {
        "name": key,
        "label": known or raw,
        "known": known is not None,
        "custom": True,
        "count": 0,
        "glyph": glyph,
        "color": color,
    }


def commit_update_world_block(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Patch a section heading's presentation overrides (label / hint / glyph /
    color) on its WorldBlock row. Upserts an entry keyed by the block's
    canonical key, so the override persists and applies to known / custom /
    structural sections alike. A passed empty string clears that override.

    A fresh entry carries ONLY the fields the author actually set — no default
    label — so a glyph-only edit never reads back as a rename (the structural
    sections key their heading off `label_override` being present)."""
    key = block_key(result["name"])
    block, _ = WorldBlock.objects.get_or_create(project_id=ctx.project_id, name=key)
    for f in ("label", "hint", "glyph", "color"):
        if f in result:
            setattr(block, f, result[f] or "")  # empty → clear the override
    block.save()
    result["block"] = block.to_dict()


# ---- world entities (block + index) --------------------------------------- #

def commit_add_world_entity(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Caps refactor Phase 2: create one entity, filed under `entity_type` (a tag)
    and appended to that category (no index)."""
    row = wb.create_worldbuilding(
        ctx.project_id,
        title=result["title"],
        content=result["description"],
        tags=[result["entity_type"]],
    )
    result["entity"] = row


def commit_update_world_entity(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Caps refactor Phase 2: patch one entity resolved by entity_id (the DB id)."""
    row = wb.patch_worldbuilding(ctx.project_id, result["entity_id"], result["fields"])
    result["entity"] = row
