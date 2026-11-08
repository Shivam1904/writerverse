"""Capability registrations — characters page (new-style).

The AI does plain write-CRUD on characters: `add_character` (this file) to
create and `update_character` (below) to edit. Both are
`Route.WRITE` and run directly — no AI-drafting proposal.
"""
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route
from actions.capabilities.stamps import stamp_character_edit

from characters import fields as cf
from characters import readers
from characters.capabilities.commit import (
    commit_accept_character_field,
    commit_add_character,
    commit_delete_character,
    commit_generate_portrait,
    commit_reject_character_field,
    commit_undelete_character,
    commit_update_character,
    commit_update_proposed_field,
)
from characters.capabilities.execute import (
    execute_generate_portrait,
)
from characters.capabilities.gather import (
    gather_delete_character,
    gather_generate_portrait,
    gather_propose_character_edit,
    gather_undelete_character,
    gather_update_character,
)


def _preview_propose_character_edit(result: dict) -> list[dict]:
    """One Night-Eyes edit → a single character-EDIT proposal, identical in shape to
    the enrichment one (`{type:'character_edit', character_id, name, fields}`). The
    studio overlay + per-field accept + accept-all all key off the shape, never the
    capability — so this row drops straight into that pipeline."""
    cid = (result or {}).get("character_id")
    fields = dict((result or {}).get("fields") or {})
    if not cid or not fields:
        return []
    return [{
        "args": {"character_id": cid},
        "preview": {
            "type": "character_edit", "character_id": cid,
            "name": (result or {}).get("name") or "", "fields": fields,
        },
    }]

# Studio-only caps: not exposed to chat (Night Eyes awareness is a deferred
# follow-up). User-button drives them from the studio; internal for completeness.
_STUDIO_ACTORS = (Actor.USER_BUTTON, Actor.INTERNAL)
_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)

# 1. add_character — WRITE, no AI. Available to every actor (the AI creates
# characters directly via this cap; it then fills the arc with update_character).
register(Capability(
    name="add_character",
    description=(
        "Create a character. `name` is required; optionally set `role` "
        "(protagonist | antagonist | main | supporting), `description`, and the "
        "arc fields `want` / `need` / `misbelief` / `story` in the same call. "
        "Anything you omit can be set later via update_character. The first "
        "character created becomes the protagonist unless you pass a `role`."
    ),
    route=Route.WRITE,
    args={
        "name": "string",
        "role": "string?",
        "description": "string?",
        "want": "string?",
        "need": "string?",
        "misbelief": "string?",
        "story": "string?",
    },
    commit=commit_add_character,
    pages=("Characters",),
))


# 2. generate_character_portrait — WRITE, with AI (user button only).
# Direct (Route.WRITE): the author types a description and clicks generate;
# gpt-image-1 returns a transparent-background PNG of just the character, which
# we save to media and stamp onto the row. Author-driven, low-stakes, regenerable.
register(Capability(
    name="generate_character_portrait",
    label="Drew a character portrait",
    uses_ai=True,
    description=(
        "Generate a transparent-background portrait image for a character from a "
        "free-text description and save its URL on the character. "
        "Source character_id from `get_characters`."
    ),
    route=Route.WRITE,
    args={"character_id": "string", "description": "string"},
    gather=gather_generate_portrait,
    execute=execute_generate_portrait,
    commit=commit_generate_portrait,
    pages=("Characters",),
    actors=(Actor.USER_BUTTON,),
))


# 3. get_character_full — READ, studio only. Full character with every field
# wrapped {actual_value, proposal?, proposed_value?} so pending AI enrichments
# can be reviewed field-by-field. The shared get_characters reader stays flat.
register(Capability(
    name="get_character_full",
    description=(
        "Full character detail for the studio — every field wrapped with any "
        "pending proposed value. Source character_id from get_characters."
    ),
    route=Route.READ,
    args={"character_id": "int"},
    gather=lambda ctx, args: readers.get_character_full(ctx, **args),
    pages=("Characters",),
    actors=_STUDIO_ACTORS,
))

# 4. accept_character_field / reject_character_field — WRITE, studio only. Resolve
# ONE proposed field on a character-edit proposal; the proposal id is stable and
# closes (APPLIED) once no pending fields remain.
register(Capability(
    name="accept_character_field",
    description=(
        "Accept one proposed field on a character: write the (possibly edited) "
        "value, drop it from the proposal."
    ),
    route=Route.WRITE,
    args={"proposal_id": "string", "field": "string", "value": "any?", "force": "bool?"},
    commit=commit_accept_character_field,
    pages=("Characters",),
    actors=_STUDIO_ACTORS,
))

register(Capability(
    name="reject_character_field",
    description=(
        "Reject one proposed field on a character: drop it from the proposal "
        "without writing anything."
    ),
    route=Route.WRITE,
    args={"proposal_id": "string", "field": "string"},
    commit=commit_reject_character_field,
    pages=("Characters",),
    actors=_STUDIO_ACTORS,
))

# Blur-save: the author edited the green proposed value and clicked away (not
# accept) — persist the edit INTO the proposal; it stays pending until accepted.
register(Capability(
    name="update_proposed_field",
    description="Save an edited proposed field value back into the proposal (still pending).",
    route=Route.WRITE,
    args={"proposal_id": "string", "field": "string", "value": "any?"},
    commit=commit_update_proposed_field,
    pages=("Characters",),
    actors=_STUDIO_ACTORS,
))


# Night-Eyes "edit character" — the AI sees a tool literally named `update_character`
# (via tool_name), but it PROPOSES: it writes the same `character_edit` proposal the
# studio pipeline already renders + accepts field-by-field, instead of patching the
# Character directly. The author's own edits keep going through the WRITE
# `update_character` (below), which no longer exposes itself to chat.
register(Capability(
    name="propose_character_edit",
    tool_name="update_character",
    description=(
        "Edit one character. Pass `character_id` plus only the fields you want to "
        "change (identity/description, arc text want / need / misbelief / story / "
        "internal_arc, backstory, notes pnote / summary / status / relationship_notes, the "
        "voice_profile / appearance dicts, aliases, and `relationships` — the FULL "
        "list of this character's links to other characters, each "
        "{character_id, label, note?} (label like 'rival' or 'mentor to'; pass the "
        "whole list, it replaces the old one). The edits are applied to the character "
        "page. Source character_id from get_characters."
    ),
    route=Route.PROPOSE,
    args={"character_id": "int", **cf.arg_schema(cf.AI_EDITABLE)},
    gather=gather_propose_character_edit,
    accept="_accept_enrich_character",
    stamp=stamp_character_edit,
    preview=_preview_propose_character_edit,
    pages=("Characters",),
    actors=(Actor.CHAT,),
))


# ---- plain CRUD (moved from actions/capabilities/*/crud.py) ----------- #

register(Capability(
    name="update_character",
    description=(
        "Patch one character. All args are optional except `id`; only the "
        "fields you pass get updated. Covers identity (name / type / "
        "description), arc text (want / need / misbelief / story), notes "
        "(pnote / summary / status), the three protagonist/antagonist flags, "
        "and the voice_profile JSON, plus the appearance dict "
        "(physical look). Use this for both surgical edits and a full arc "
        "fill — when asked to draft/flesh out a character, compose the "
        "want/need/misbelief/story values yourself and pass them here. "
        "Source id from `get_characters`."
    ),
    route=Route.WRITE,
    args={"id": "int", **cf.arg_schema(cf.AUTHOR_EDITABLE)},
    gather=gather_update_character,
    commit=commit_update_character,
    pages=("Characters",),
    # The author's direct patch (facade PATCH /characters/<id>/). NOT exposed to
    # chat — Night Eyes edits a character via `propose_character_edit` (which the AI
    # sees as `update_character`) so its edits land as a reviewable proposal.
    actors=_NO_CHAT,
))

register(Capability(
    name="delete_character",
    description=(
        "Delete one character. Source id from `get_characters`."
    ),
    route=Route.WRITE,
    args={"id": "int"},
    gather=gather_delete_character,
    commit=commit_delete_character,
    pages=("Characters",),
    actors=_NO_CHAT,
))

register(Capability(
    name="undelete_character",
    description=(
        "Undo a delete_character: bring the deleted character back. "
        "Backs the author's 10-second 'Deleted — Undo' toast."
    ),
    route=Route.WRITE,
    args={"id": "int"},
    gather=gather_undelete_character,
    commit=commit_undelete_character,
    pages=("Characters",),
    actors=_NO_CHAT,
))


register(Capability(
    name="get_character",
    description=("One character by id, all fields (flat). Source id from get_characters."),
    route=Route.READ,
    args={"character_id": "int"},
    gather=lambda ctx, args: readers.get_character_detail(ctx, **args),
    pages=("Characters",),
))


# --- List reader -------------------------------------------------------------

def _char_role(r):
    if r.get("is_protagonist"):
        return "protagonist"
    if r.get("is_antagonist"):
        return "antagonist"
    if r.get("is_main_character"):
        return "main"
    return "supporting"


def _gather_characters(ctx, args):
    # Chat sees a lean list (id + name + role) read from the small index, not
    # every column and every relationship. The page (USER_BUTTON) and every
    # other actor keep the full rows.
    if ctx.actor is Actor.CHAT:
        return {"characters": [
            {"id": r["id"], "name": r["name"], "role": _char_role(r)}
            for r in readers.index(ctx.project_id)
        ]}
    return readers.get_characters(ctx, **args)


register(Capability(
    name="get_characters",
    description="The story's characters.",
    route=Route.READ,
    gather=_gather_characters,
    pages=("Characters",),
))
