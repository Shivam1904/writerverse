"""Capability registrations — project metadata (World page).

Mirrors the character studio per-field proposal pipeline:
  • update_project_meta — PROPOSE; the AI's edit becomes a `meta_edit` proposal
    (a user's own form edit auto-applies). The preview callback shapes it
    per-field so it drops straight into the studio overlay.
  • get_project_meta_full — READ; every field wrapped {actual_value, proposal?,
    proposed_value?} so the World page reviews a pending edit field-by-field.
  • accept/reject/update_proposed_meta_field — per-field accept/reject/edit.
  • _accept_update_project_meta — accept-ALL (auto-apply + toast/chat accept).
"""
from actions.capabilities.commit._proposals import guarded_accept
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, ProposeWhen, Route
from actions.capabilities.stamps import stamp_meta_edit

from projects import readers
from projects.capabilities.commit import (
    commit_accept_project_meta_field,
    commit_reject_project_meta_field,
    commit_update_project_meta,
    commit_update_proposed_meta_field,
)
from projects.capabilities.gather import gather_update_project_meta


def _preview_update_project_meta(result: dict) -> dict:
    """Shape the gathered meta patch into a per-field `meta_edit` proposal —
    the same shape character_edit uses, so get_project_meta_full + the per-field
    accept/reject pipeline read it. One proposal (the World page renders each
    field; accept/reject one at a time)."""
    return {
        "type": "meta_edit",
        "project_id": (result or {}).get("project_id"),
        "fields": dict((result or {}).get("fields") or {}),
    }


# Studio-only caps: not exposed to chat. The World page (USER_BUTTON) drives the
# per-field accept/reject; internal for the auto-apply + accept paths.
_META_FIELD_ACTORS = (Actor.USER_BUTTON, Actor.INTERNAL)


register(Capability(
    name="update_project_meta",
    tool_name="update_project_overview",
    description=(
        "Update the project's metadata. Pass EVERY field you intend to change "
        "in a SINGLE call — batch them together (e.g. perspective + tense + "
        "audience + synopsis at once); never call this once per field. Omit "
        "fields you are not changing.\n"
        "Fields: title (string), synopsis (string), logline (one-sentence "
        "hook), genres (LIST of genre names, e.g. [\"Science fiction\", "
        "\"Thriller\"]), themes (LIST — what the story is ABOUT: betrayal, "
        "identity), tones (LIST — how it FEELS: dark, hopeful). Use the plural "
        "list fields genres/themes; do NOT use the legacy singular genre/theme. "
        "perspective must be one of: first, second, third-limited, "
        "third-omniscient, multiple. tense must be one of: past, present, "
        "mixed. audience must be one of: children, middle-grade, young-adult, "
        "adult, general. Send those exact codes, not prose labels."
    ),
    route=Route.PROPOSE,
    args={
        "title": "string?",
        "synopsis": "string?",
        "theme": "string?",
        "genre": "string?",
        "genres": "list?",
        "tones": "list?",
        "themes": "list?",
        "logline": "string?",
        "perspective": "string?",
        "tense": "string?",
        "audience": "string?",
    },
    gather=gather_update_project_meta,
    preview=_preview_update_project_meta,
    accept="_accept_update_project_meta",
    stamp=stamp_meta_edit,
    # AI suggestions propose for review; a user editing the metadata form
    # auto-applies (the save click is the intent — surgical CRUD).
    propose_when=ProposeWhen.AI_ONLY,
    pages=("World", "ConsistencyLab"),
))

# Accept-ALL: write every remaining proposed field in one go. The auto-apply
# path (user's own edit) and the toast/chat accept route through here.
register(Capability(
    name="_accept_update_project_meta",
    description="Accept an update-project-meta proposal (all remaining fields).",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_update_project_meta),
    pages=("World", "ConsistencyLab"),
    actors=(Actor.INTERNAL,),
))


# get_project_meta_full — READ, World only. Every metadata field wrapped with any
# pending proposed value so the World page reviews a `meta_edit` field-by-field.
# The shared flat get_project_meta (register/globals.py) stays untouched.
register(Capability(
    name="get_project_meta_full",
    description=(
        "Full project metadata for the World page — every field wrapped with "
        "any pending proposed value (the studio per-field shape)."
    ),
    route=Route.READ,
    gather=lambda ctx, args: readers.get_project_meta_full(ctx),
    pages=("World", "ConsistencyLab"),
    actors=_META_FIELD_ACTORS,
))


# Per-field accept / reject — resolve ONE proposed field on a meta_edit proposal;
# the proposal id is stable and closes (APPLIED) once no pending fields remain.
register(Capability(
    name="accept_project_meta_field",
    description=(
        "Accept one proposed metadata field: write the (possibly edited) value, "
        "drop it from the proposal."
    ),
    route=Route.WRITE,
    args={"proposal_id": "string", "field": "string", "value": "any?", "force": "bool?"},
    commit=commit_accept_project_meta_field,
    pages=("World", "ConsistencyLab"),
    actors=_META_FIELD_ACTORS,
))

register(Capability(
    name="reject_project_meta_field",
    description=(
        "Reject one proposed metadata field: drop it from the proposal without "
        "writing anything."
    ),
    route=Route.WRITE,
    args={"proposal_id": "string", "field": "string"},
    commit=commit_reject_project_meta_field,
    pages=("World", "ConsistencyLab"),
    actors=_META_FIELD_ACTORS,
))

# Blur-save: the author edited the green proposed value and clicked away (not
# accept) — persist the edit INTO the proposal; it stays pending until accepted.
register(Capability(
    name="update_proposed_meta_field",
    description="Save an edited proposed metadata value back into the proposal (still pending).",
    route=Route.WRITE,
    args={"proposal_id": "string", "field": "string", "value": "any?"},
    commit=commit_update_proposed_meta_field,
    pages=("World", "ConsistencyLab"),
    actors=_META_FIELD_ACTORS,
))
