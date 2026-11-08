"""Capability registrations — the World page (worldbuilding entries, blocks,
entities, and the chat `get_world` reader)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.commit._proposals import guarded_accept
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.registry import register
from actions.capabilities.spec import (
    Actor,
    Capability,
    DispatchContext,
    ProposeWhen,
    Route,
)
from actions.capabilities.stamps import additive

from worldbuilding.block_readers import (
    get_world_block,
    get_world_blocks,
    get_world_entities,
)
from worldbuilding.capabilities.commit import (
    commit_accept_add_worldbuilding,
    commit_add_world_block,
    commit_add_world_entity,
    commit_delete_worldbuilding,
    commit_undelete_worldbuilding,
    commit_update_world_block,
    commit_update_world_entity,
    commit_update_worldbuilding,
)
from worldbuilding.capabilities.gather import (
    gather_add_world_block,
    gather_add_world_entity,
    gather_add_worldbuilding,
    gather_delete_worldbuilding,
    gather_undelete_worldbuilding,
    gather_update_world_block,
    gather_update_world_entity,
    gather_update_worldbuilding,
)
from worldbuilding.readers import get_items, get_rules, get_worldbuildings

_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)


def _reader(fetch):
    def _gather(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
        return fetch(ctx, **args)
    return _gather


def _preview_add_worldbuilding(result: dict) -> dict:
    """Shape an add_worldbuilding proposal's preview for the rendering surfaces.

    `result` is the gathered add dict ({title, content, tags, pnote}). The
    surfaces read: `title` (rail title node + page-surface heading), `content`
    (the MutationDetail snippet), and `section` — the first tag, which lets the
    rail card read "Pinning <title> into <section>" and pick the matching entity
    mark (place / rule / item) via worldbuildingKind."""
    tags = [t for t in (result.get("tags") or []) if t]
    return {
        "title": result.get("title", ""),
        "content": result.get("content", ""),
        "tags": tags,
        "section": tags[0] if tags else "",
    }


# ---- worldbuilding -------------------------------------------------------- #

register(Capability(
    name="add_worldbuilding",
    description="Add one worldbuilding entry (rule, place, thing, or note).",
    route=Route.PROPOSE,
    args={
        "title": "string",
        "content": "string?",
        "tags": "list?",
        "pnote": "string?",
    },
    gather=gather_add_worldbuilding,
    accept="_accept_add_worldbuilding",
    stamp=additive,  # creates a new entry
    preview=_preview_add_worldbuilding,
    # AI suggestions propose for review on the World page surface + rail; the
    # author's own add on the World page auto-applies (the add IS the intent —
    # surgical CRUD). Mirrors update_project_meta, its sibling on this page.
    propose_when=ProposeWhen.AI_ONLY,
    pages=("World",),
    actors=_NO_CHAT,
))

register(Capability(
    name="_accept_add_worldbuilding",
    description="Accept an add-worldbuilding proposal.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_accept_add_worldbuilding),
    pages=("World",),
    actors=(Actor.INTERNAL,),
))

register(Capability(
    name="update_worldbuilding",
    description=(
        "Patch one worldbuilding entry (title / content / tags / pnote / status). "
        "Source id from `get_worldbuildings`."
    ),
    route=Route.WRITE,
    args={
        "id": "int",
        "title": "string?",
        "content": "string?",
        "tags": "list?",
        "pnote": "string?",
        "status": "string?",
    },
    gather=gather_update_worldbuilding,
    commit=commit_update_worldbuilding,
    pages=("World",),
    actors=_NO_CHAT,
))

register(Capability(
    name="delete_worldbuilding",
    description=(
        "Delete one worldbuilding entry. "
        "Source id from `get_worldbuildings`."
    ),
    route=Route.WRITE,
    args={"id": "int"},
    gather=gather_delete_worldbuilding,
    commit=commit_delete_worldbuilding,
    pages=("World",),
    actors=_NO_CHAT,
))

register(Capability(
    name="undelete_worldbuilding",
    description=(
        "Undo a delete_worldbuilding: bring the deleted world entry back. "
        "Backs the author's 10-second 'Deleted — Undo' toast."
    ),
    route=Route.WRITE,
    args={"id": "int"},
    gather=gather_undelete_worldbuilding,
    commit=commit_undelete_worldbuilding,
    pages=("World",),
    actors=_NO_CHAT,
))


# ---- world blocks (sections) ---------------------------------------------- #
# A "block" is a World-page heading; its items are worldbuilding rows tagged with
# it. To FILE an item into a block, call add_worldbuilding with tags=[block name]
# — these two only manage *empty / author-added* headings so they persist before
# any item exists. Headings already in use surface automatically via `get_world_blocks`.

register(Capability(
    name="add_world_block",
    description=(
        "Add a World-page section heading (block), e.g. 'Factions'. Persists an "
        "empty section so the author can fill it later. Optional glyph (a known "
        "mark kind — location/item/rule — else a generic token) and color tint "
        "for its look. To add an item to a block, use add_worldbuilding with "
        "tags=[the block name]."
    ),
    route=Route.WRITE,
    args={"name": "string", "glyph": "string?", "color": "string?"},
    gather=gather_add_world_block,
    commit=commit_add_world_block,
    pages=("World",),
    actors=_NO_CHAT,
))

register(Capability(
    name="update_world_block",
    description=(
        "Edit a World section heading's look — its display label (rename), hint "
        "(subtitle), glyph, or color. Pass `name` (the block) plus any of "
        "label / hint / glyph / color; an empty string clears that override back "
        "to the default. The block's underlying key isn't renamed, so its items "
        "stay filed. Source name from `get_world_blocks`."
    ),
    route=Route.WRITE,
    args={
        "name": "string",
        "label": "string?",
        "hint": "string?",
        "glyph": "string?",
        "color": "string?",
    },
    gather=gather_update_world_block,
    commit=commit_update_world_block,
    pages=("World",),
    actors=_NO_CHAT,
))

# ---- world entities (block + index) --------------------------------------- #

register(Capability(
    name="add_world_entity",
    description=(
        "Add one world entity. `entity_type` is its category (location, faction, "
        "magic, rule, creature, history, culture, … or a new custom type); `title` "
        "is its name; `description` is optional detail. Any new entity_type is "
        "created on first use."
    ),
    route=Route.WRITE,
    args={"entity_type": "string", "title": "string", "description": "string?"},
    gather=gather_add_world_entity,
    commit=commit_add_world_entity,
    pages=("World",),
))

register(Capability(
    name="update_world_entity",
    description=(
        "Edit one world entity. Pass `entity_id` (from get_world_entities) plus the "
        "fields to change — `title` and/or `description`."
    ),
    route=Route.WRITE,
    args={"entity_id": "int", "title": "string?", "description": "string?"},
    gather=gather_update_world_entity,
    commit=commit_update_world_entity,
    pages=("World",),
))


# ---- chat reader --------------------------------------------------------- #

register(Capability(
    name="get_world",
    tool_name="get_world_entities",
    description=("Every world entity, flat: `{entities:[{entity_id, entity_type, "
                 "name, description}]}`. entity_type is the entity's category "
                 "(location, faction, magic, rule, …). Edit one by entity_id via "
                 "update_world_entity."),
    route=Route.READ,
    gather=_reader(get_world_entities),
    pages=("World",),
))


# --- Page readers (not offered to chat: get_world covers them there) ----------

register(Capability(
    name="get_worldbuildings",
    description=("The author's worldbuilding entries as full rows (title + content + tags + "
                 "status + order) — for UI rendering."),
    route=Route.READ,
    gather=_reader(get_worldbuildings),
    pages=("World",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_world_blocks",
    description=("Every World-page section heading (block) — known (Locations, …) + "
                 "author-added + any tag already in use — each with its item count."),
    route=Route.READ,
    gather=_reader(get_world_blocks),
    pages=("World",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_world_block",
    description=("Items filed under one World section heading (block), by name e.g. "
                 "'Locations'. Items are worldbuilding rows tagged with that heading."),
    route=Route.READ,
    args={"name": "string"},
    gather=_reader(get_world_block),
    pages=("World",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_items",
    description="Things in play — the story's items (the StoryItem table).",
    route=Route.READ,
    gather=_reader(get_items),
    pages=("ConsistencyLab",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_rules",
    description="The author's stated rules (magic / world rules), from the StoryRule table.",
    route=Route.READ,
    gather=_reader(get_rules),
    pages=("World",),
    actors=_NO_CHAT,
))
