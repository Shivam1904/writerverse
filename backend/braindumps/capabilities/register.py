"""Capability registrations — braindumps page (new-style)."""
from actions.capabilities.commit._proposals import guarded_accept
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route
from actions.capabilities.stamps import (
    additive,
    stamp_character_edit,
    stamp_world_entity,
)

from braindumps import readers as braindump_readers
from braindumps.capabilities.commit import (
    commit_add_braindump,
    commit_alias_character,
    commit_annotate_braindump,
    commit_delete_braindump,
    commit_draft_world_entity,
    commit_enrich_character,
    commit_init_elements,
    commit_promote_to_character,
    commit_promote_to_world_entity,
    commit_unalias_character,
    commit_undelete_braindump,
    commit_update_braindump,
    commit_update_proposed_world_entity,
)
from braindumps.capabilities.execute import (
    execute_annotate_braindump,
    execute_draft_world_entity,
    execute_enrich_character,
    execute_init_elements,
)
from braindumps.capabilities.gather import (
    gather_add_braindump,
    gather_annotate_braindump,
    gather_delete_braindump,
    gather_draft_world_entity,
    gather_enrich_character,
    gather_init_elements,
    gather_undelete_braindump,
    gather_update_braindump,
)


def _preview_init_elements(result: dict) -> list[dict]:
    """Fan one extraction run out into one proposal per individual ENTITY.

    Returns a list of units — `_commit_proposal` creates one Proposal row each —
    so the author accepts/rejects every single character, item and rule on its
    own (plus the one story-summary unit). The LLM still ran exactly once (in
    execute); this is a pure split of its output. Empty / unnamed entries are
    dropped (no empty proposals)."""
    elements = result.get("elements") or {}
    units: list[dict] = []

    story = elements.get("story") or {}
    if story:
        units.append({
            "args": {"type": "story"},
            "preview": {"type": "story", "story": story},
        })
    for c in elements.get("characters") or []:
        name = (c.get("name") or "").strip()
        if not name:
            continue
        units.append({
            "args": {"type": "character", "name": name},
            "preview": {"type": "character", "name": name, "character": c},
        })
    for it in elements.get("items") or []:
        name = (it.get("name") or "").strip()
        if not name:
            continue
        units.append({
            "args": {"type": "item", "name": name},
            "preview": {"type": "item", "name": name, "item": it},
        })
    for r in elements.get("rules") or []:
        text = (r.get("text") or "").strip()
        if not text:
            continue
        units.append({
            "args": {"type": "rule"},
            "preview": {"type": "rule", "text": text, "rule": r},
        })
    return units


# Extract elements (Braindumps page) — one LLM call, then a per-type fan-out of
# proposals (story / characters / items / rules), each accepted independently.
register(Capability(
    name="run_init_elements",
    label="Set up your story elements",
    uses_ai=True,
    description=(
        "Read the synopsis + braindumps and extract structured story elements "
        "(story summary, characters, items, world rules). Proposes each element "
        "TYPE as its own card the author accepts independently."
    ),
    route=Route.PROPOSE,
    gather=gather_init_elements,
    execute=execute_init_elements,
    accept="_accept_init_elements",
    preview=_preview_init_elements,
    # Creates entities; the story slice only fills EMPTY title/synopsis (a
    # differing value becomes its own stamped meta_edit proposal).
    stamp=additive,
    pages=("Braindumps", "ConsistencyLab"),
    actors=(Actor.USER_BUTTON,),
))

register(Capability(
    name="_accept_init_elements",
    description="Accept one extracted element-type slice.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_init_elements),
    pages=("Braindumps", "ConsistencyLab"),
    actors=(Actor.INTERNAL,),
))


# Engine draft key → Character column. external_arc→story, role→type; rest 1:1.
# These are exactly the fields the enrichment may populate.
_ENRICH_FIELD_MAP = {
    "role": "type",
    "description": "description",
    "want": "want",
    "need": "need",
    "misbelief": "misbelief",
    "external_arc": "story",
    "internal_arc": "internal_arc",
    "summary": "summary",
    "pnote": "pnote",
    "status": "status",
    "appearance": "appearance",
    "voice_profile": "voice_profile",
    "aliases": "aliases",
}


def _preview_enrich_character(result: dict) -> list[dict]:
    """One drafted enrichment → a single character-EDIT proposal, Character-schema
    shaped: `{type:'character_edit', character_id, fields:{<column>: <value>}}`. `fields`
    holds only the columns the draft actually populated (empties dropped). Per-field
    accept/reject shrinks it; the studio's get_character_full overlays it onto the row.
    Empty draft (no id / no populated fields) → no proposal."""
    cid = (result or {}).get("character_id")
    c = dict((result or {}).get("character") or {})
    if not cid:
        return []
    fields: dict = {}
    for engine_key, column in _ENRICH_FIELD_MAP.items():
        v = c.get(engine_key)
        if isinstance(v, str):
            v = v.strip()
        if v:
            fields[column] = v
    if not fields:
        return []
    name = (c.get("name") or "").strip()
    return [{
        "args": {"character_id": cid},
        # `name` is carried for the toast/cast surfaces to label the card; the studio
        # reader (get_character_full) ignores it and overlays `fields` onto the row.
        "preview": {"type": "character_edit", "character_id": cid, "name": name, "fields": fields},
    }]


# Promote a candidate entity → a real Character in TWO tiers (D24). The button
# fires this WRITE, which create-or-gets the Character row NOW (instant feedback on
# the cast page) and queues `enrich_promoted_character` as a follow-up. The author's
# intent (the row) applies directly; the AI-drafted description + arcs land as an
# editable proposal on the new card.
register(Capability(
    name="promote_to_character",
    description=(
        "Make a named braindump candidate a real character NOW (creates the cast "
        "row), then queue an AI enrichment proposal (description + arcs) on it."
    ),
    route=Route.WRITE,
    args={"name": "string"},
    commit=commit_promote_to_character,
    pages=("Braindumps",),
    actors=(Actor.USER_BUTTON,),
))

# Fold a candidate character into a REAL one as an alias (idea-tree drag → drop).
# Cheap, reversible CRUD — the alias name is just appended to the target's
# `aliases` — so it applies directly (Route.WRITE). The tree then resolves the
# candidate to "alias of <primary>" at render time; no braindump data moves.
register(Capability(
    name="alias_character",
    description=(
        "Fold a braindump candidate character into an existing real character: "
        "add the candidate's name to that character's aliases."
    ),
    route=Route.WRITE,
    args={"primary_name": "string", "alias_name": "string"},
    commit=commit_alias_character,
    pages=("Braindumps",),
    actors=(Actor.USER_BUTTON,),
))

# The inverse — un-fold an alias back to a standalone candidate (the tree's ✕).
register(Capability(
    name="unalias_character",
    description="Remove a name from a character's aliases (un-fold a merged candidate).",
    route=Route.WRITE,
    args={"primary_name": "string", "alias_name": "string"},
    commit=commit_unalias_character,
    pages=("Braindumps",),
    actors=(Actor.USER_BUTTON,),
))

# The enrichment half: drafts a full character from the candidate's braindump
# material and proposes it as an EDIT to the row promote_to_character just created.
register(Capability(
    name="enrich_promoted_character",
    label="Drafted a character",
    uses_ai=True,
    description=(
        "Draft a character (description, external + internal arcs) from everything "
        "the braindumps say about an existing character, and propose it as an edit."
    ),
    route=Route.PROPOSE,
    args={"character_id": "int", "name": "string?"},
    gather=gather_enrich_character,
    execute=execute_enrich_character,
    accept="_accept_enrich_character",
    stamp=stamp_character_edit,
    preview=_preview_enrich_character,
    pages=("Braindumps", "characters"),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL),
))

register(Capability(
    name="_accept_enrich_character",
    description="Accept an enrichment — fill the existing Character's blank arc fields (description + arcs).",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_enrich_character),
    pages=("Braindumps", "characters"),
    actors=(Actor.INTERNAL,),
))


def _preview_draft_world_entity(result: dict) -> list[dict]:
    """One drafted description → a single world-entity content-EDIT proposal
    (`{type:'world_entity_edit', worldbuilding_id, name, block, content}`). Accept
    (`commit_draft_world_entity`) writes the content onto the row by id. Empty draft
    (no id / no content) → no proposal."""
    wid = (result or {}).get("worldbuilding_id")
    content = ((result or {}).get("content") or "").strip()
    if not wid or not content:
        return []
    return [{
        "args": {"worldbuilding_id": wid},
        "preview": {
            "type": "world_entity_edit", "worldbuilding_id": wid,
            "name": ((result or {}).get("name") or "").strip(),
            "block": ((result or {}).get("block") or "").strip(),
            "content": content,
        },
    }]


# Promote a candidate world entity → a real Worldbuilding row in TWO tiers (D24),
# mirroring promote_to_character. The "make real" button fires this WRITE, which
# creates the row NOW (instant — it shows in its section) and queues
# `draft_world_entity` as a follow-up that drafts its description from the ideas.
register(Capability(
    name="promote_to_world_entity",
    description=(
        "Make a named braindump candidate a real world entry NOW (creates the row "
        "in its block), then queue an AI description-draft proposal on it."
    ),
    route=Route.WRITE,
    args={"name": "string", "block": "string", "kind": "string?"},
    commit=commit_promote_to_world_entity,
    pages=("World",),
    actors=(Actor.USER_BUTTON,),
))

# The drafting half: writes a description from everything the braindumps say about
# the entity and proposes it as an EDIT to the row promote just created.
register(Capability(
    name="draft_world_entity",
    label="Drafted a world entry",
    uses_ai=True,
    description=(
        "Draft a description for an existing world entry from everything the "
        "braindumps say about it, and propose it as an edit."
    ),
    route=Route.PROPOSE,
    args={
        "worldbuilding_id": "int",
        "name": "string?",
        "block": "string?",
        "kind": "string?",
    },
    gather=gather_draft_world_entity,
    execute=execute_draft_world_entity,
    accept="_accept_draft_world_entity",
    stamp=stamp_world_entity,
    preview=_preview_draft_world_entity,
    pages=("World",),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL),
))

register(Capability(
    name="_accept_draft_world_entity",
    description="Accept a world-entity draft — write the drafted description onto the row.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_draft_world_entity),
    pages=("World",),
    actors=(Actor.INTERNAL,),
))

# Blur-save while reviewing a draft: persist the edited description INTO the
# proposal (still pending); it only reaches the row on accept.
register(Capability(
    name="update_proposed_world_entity",
    description="Save an edited proposed world-entity description back into the proposal (still pending).",
    route=Route.WRITE,
    args={"proposal_id": "string", "value": "any?"},
    commit=commit_update_proposed_world_entity,
    pages=("World",),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL),
))


# ---- braindump CRUD (moved from actions/capabilities/register/crud.py) - #

_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)

register(Capability(
    name="add_braindump",
    description=(
        "Add one brain-dump entry — pass `body` (the idea text). "
        "It's queued for AI annotation as a follow-up."
    ),
    route=Route.WRITE,
    args={"body": "string"},
    gather=gather_add_braindump,
    commit=commit_add_braindump,
    pages=("Braindumps",),
))

register(Capability(
    name="annotate_braindump",
    label="Tagged an idea",
    uses_ai=True,
    description=(
        "Run AI annotation on one brain-dump entry: split the body into phrases, "
        "group them into packs, extract named entities, and assign tags — all "
        "stored on the entry's `ai_data`. The union of tags + entity names is "
        "mirrored onto the entry's `tags`. Large entries are chunked internally. "
        "Best-effort (the entry is already saved); fired right after add_braindump. "
        "Source id from `get_braindumps`."
    ),
    route=Route.WRITE,
    args={"id": "int"},
    gather=gather_annotate_braindump,
    execute=execute_annotate_braindump,
    commit=commit_annotate_braindump,
    pages=("Braindumps",),
    actors=_NO_CHAT,
))

register(Capability(
    name="update_braindump",
    description=(
        "Edit one brain-dump entry's text. Pass id + the new `body`. "
        "Source id from get_braindumps."
    ),
    route=Route.WRITE,
    args={"id": "int", "body": "string"},
    gather=gather_update_braindump,
    commit=commit_update_braindump,
    pages=("Braindumps",),
    actors=_NO_CHAT,  # dropped from chat (caps refactor 2026-07-03)
))

register(Capability(
    name="delete_braindump",
    description=(
        "Delete one brain-dump entry (an braindump on the Braindumps page). "
        "Source id from `get_braindumps`."
    ),
    route=Route.WRITE,
    args={"id": "int"},
    gather=gather_delete_braindump,
    commit=commit_delete_braindump,
    pages=("Braindumps",),
    actors=_NO_CHAT,
))

register(Capability(
    name="undelete_braindump",
    description=(
        "Undo a delete_braindump: bring the deleted brain-dump entry back. "
        "Backs the author's 10-second 'Deleted — Undo' toast."
    ),
    route=Route.WRITE,
    args={"id": "int"},
    gather=gather_undelete_braindump,
    commit=commit_undelete_braindump,
    pages=("Braindumps",),
    actors=_NO_CHAT,
))


# ---- page readers --------------------------------------------------------- #

register(Capability(
    name="get_braindumps",
    description=("The author's brain-dump entries as full rows (content + planning note + tags + "
                 "pinned + order) — the author's loose braindumps captured so far."),
    route=Route.READ,
    gather=lambda ctx, args: braindump_readers.get_braindumps(ctx, **args),
    pages=("Braindumps", "ConsistencyLab"),
))

register(Capability(
    name="get_braindump_tag_categories",
    description="The braindump tag taxonomy (categories → colour + leaf tags), from config.",
    route=Route.READ,
    gather=lambda ctx, args: braindump_readers.get_braindump_tag_categories(ctx, **args),
    pages=("Braindumps",),
    actors=_NO_CHAT,
))
