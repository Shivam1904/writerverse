"""Commit layer — characters page."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from characters import fields as cf
from characters import readers
from characters.models import Character

# Caps refactor Phase 1: add_character takes a `role` (protagonist | antagonist |
# main | supporting) that maps to the tier booleans (supporting = all false).
# Applied via patch_character on the fresh row so the AI can set tier + arc fields
# in one call. NOTE: create_character forces the FIRST character to protagonist;
# an explicit role here overrides that default.
_ROLE_FLAGS = {
    "protagonist": {"is_protagonist": True,  "is_antagonist": False, "is_main_character": True},
    "antagonist":  {"is_protagonist": False, "is_antagonist": True,  "is_main_character": False},
    "main":        {"is_protagonist": False, "is_antagonist": False, "is_main_character": True},
    "supporting":  {"is_protagonist": False, "is_antagonist": False, "is_main_character": False},
}


def commit_add_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Create a Character row, then apply role (→ tier booleans) + arc fields."""
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    row = readers.create_character(
        ctx.project_id,
        name=result.get("name", ""),
        type=result.get("type", ""),
        description=result.get("description", ""),
    )
    patch: dict[str, Any] = {}
    role = str(result.get("role") or "").strip().lower()
    if role in _ROLE_FLAGS:
        patch.update(_ROLE_FLAGS[role])
    for f in ("want", "need", "misbelief", "story"):
        v = result.get(f)
        if v:
            patch[f] = v
    if patch:
        row = readers.patch_character(ctx.project_id, row["id"], patch)
    result["character"] = row


def commit_generate_portrait(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Persist the generated portrait URL onto the Character row.

    The new file is already in storage. If the row can't take it, that file is
    removed (and the dispatch errors, so nothing is charged). On success the
    character's previous portrait file is removed once the write commits."""
    from django.db import transaction

    from characters.portraits import delete_portrait

    new_url = result.get("portrait_url", "")
    try:
        if ctx.project_id is None:
            raise CapabilityError("no project in scope", 400)
        old_url = (
            Character.objects.filter(project_id=ctx.project_id, id=result["character_id"])
            .values_list("portrait_url", flat=True)
            .first()
        ) or ""
        row = readers.set_character_portrait(ctx.project_id, result["character_id"], new_url)
    except Exception:
        delete_portrait(new_url)
        raise
    if old_url and old_url != new_url:
        transaction.on_commit(lambda: delete_portrait(old_url))
    result["character"] = row


# Fields a character-edit proposal is allowed to write. Derived from the ONE field
# list (characters/fields.py): the authored fields minus the tier
# flags. Guards writes from touching system/derived columns (ids, *_items,
# portrait_url, the bool flags).
EDITABLE_CHARACTER_FIELDS = frozenset(cf.AI_EDITABLE)
# Back-compat alias (was private); some call sites import the old name.
_EDITABLE_FIELDS = EDITABLE_CHARACTER_FIELDS


def _resolve_field_proposal(ctx, result, *, pending: bool = True):
    """Load (proposal, payload, preview, fields, field) for a field-level accept/reject.

    The Proposal row's JSON is `{capability, args, preview:{type, character_id, fields}}`
    — the character-edit payload lives under `preview`."""
    from actions.models import Proposal
    pid = result.get("proposal_id")
    field = result.get("field")
    if not field:
        raise CapabilityError("field is required", 400)
    proposal = Proposal.objects.filter(project_id=ctx.project_id, id=pid).first()
    if proposal is None:
        raise CapabilityError("proposal not found", 404)
    if pending and proposal.status != Proposal.STATUS_PROPOSED:
        # A closed (accepted / dismissed) proposal must not still write a field.
        raise CapabilityError(
            f"This suggestion was already {proposal.status.lower()}.", 409,
            code="proposal_not_pending",
        )
    payload = dict(proposal.proposal or {})
    preview = dict(payload.get("preview") or {})
    fields = dict(preview.get("fields") or {})
    return proposal, payload, preview, fields, field


def _close_if_empty(proposal, payload, preview, fields):
    """Write the shrunken field set back; mark APPLIED once nothing is pending."""
    from actions.models import Proposal
    preview["fields"] = fields
    payload["preview"] = preview
    proposal.proposal = payload
    update = ["proposal", "updated_at"]
    if not fields:
        proposal.status = Proposal.STATUS_APPLIED
        update.append("status")
    proposal.save(update_fields=update)


def _supersede_field_in_siblings(ctx, keep_id, character_id, field, *, empty_status):
    """Drop `field` from every OTHER pending character_edit proposal for this
    character, so a field the author just decided can't resurface from a stale
    sibling proposal. The studio shows ONE green cell per field (latest pending
    wins); resolving it on the displayed proposal must clear the same field
    everywhere or an older proposal still holding it pops back up on the next read.

    Siblings emptied by the drop are closed with `empty_status` (APPLIED when the
    field was accepted — its value reached the row via the kept proposal; REJECTED
    when it was rejected). Other sub-keys / fields on a sibling stay pending.
    `field` may be a dotted dict path (`appearance.eyes`); only that sub-key drops."""
    from actions.models import Proposal
    siblings = (
        Proposal.objects.filter(
            project_id=ctx.project_id, status=Proposal.STATUS_PROPOSED,
        )
        .exclude(id=keep_id)
    )
    for p in siblings:
        payload = dict(p.proposal or {})
        preview = dict(payload.get("preview") or {})
        if (preview.get("type") != "character_edit"
                or preview.get("character_id") != character_id):
            continue
        fields = dict(preview.get("fields") or {})
        if not _field_present(fields, field):
            continue
        _field_pop(fields, field)
        preview["fields"] = fields
        payload["preview"] = preview
        p.proposal = payload
        update = ["proposal", "updated_at"]
        if not fields:
            p.status = empty_status
            update.append("status")
        p.save(update_fields=update)


# ── dict sub-field paths ────────────────────────────────────────────────────
# A `field` may be a dotted path into a dict column, e.g. `appearance.eyes`. The
# studio explodes the `appearance` dict into per-sub-key cells so each blank is
# editable / acceptable / rejectable on its own — these helpers let the same
# accept/reject/update flow operate on one sub-key, pruning the parent dict when
# its last sub-key is resolved.
def _split_field(field: str) -> tuple[str, str | None]:
    """`'appearance.eyes'` → `('appearance', 'eyes')`; `'want'` → `('want', None)`."""
    if "." in field:
        parent, sub = field.split(".", 1)
        return parent, sub
    return field, None


def _field_get(fields: dict, field: str):
    """Read the proposed value for a flat or nested field."""
    parent, sub = _split_field(field)
    if sub is None:
        return fields.get(field)
    return (fields.get(parent) or {}).get(sub)


def _field_present(fields: dict, field: str) -> bool:
    parent, sub = _split_field(field)
    if sub is None:
        return field in fields
    return sub in (fields.get(parent) or {})


def _field_pop(fields: dict, field: str) -> None:
    """Drop a flat or nested field; prune the parent dict when its last sub-key goes."""
    parent, sub = _split_field(field)
    if sub is None:
        fields.pop(field, None)
        return
    nested = dict(fields.get(parent) or {})
    nested.pop(sub, None)
    if nested:
        fields[parent] = nested
    else:
        fields.pop(parent, None)


def _field_set(fields: dict, field: str, value: Any) -> None:
    """Set a flat or nested proposed value."""
    parent, sub = _split_field(field)
    if sub is None:
        fields[field] = value
    else:
        nested = dict(fields.get(parent) or {})
        nested[sub] = value
        fields[parent] = nested


def commit_accept_character_field(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Accept ONE proposed field: write the (possibly author-edited) value onto the
    Character, drop the field from the proposal, close the proposal once empty.

    `field` may be a dotted dict path (`appearance.eyes`): the sub-key is merged
    into the live dict and dropped from the proposed dict, leaving the other
    sub-keys pending. `value` is the final value the author confirmed in the green
    field — it WINS over the AI's original proposed value. The proposal id is
    stable across per-field accepts; only its pending `fields` set shrinks."""
    proposal, payload, preview, fields, field = _resolve_field_proposal(ctx, result)
    parent, sub = _split_field(field)
    if parent not in _EDITABLE_FIELDS:
        raise CapabilityError(f"field '{field}' is not editable", 400)
    cid = preview.get("character_id")
    char = Character.objects.filter(project_id=ctx.project_id, id=cid).first()
    if char is None:
        raise CapabilityError("character not found", 404)
    value = result.get("value")
    final = value if value is not None else _field_get(fields, field)
    if not result.get("force"):  # SA-209: don't clobber a newer author edit
        from actions.capabilities.stamps import check_fresh
        check_fresh(ctx, proposal, preview, only=field, proposed_override=final)
    if sub is None:
        cf.apply_fields(char, {parent: final}, allowed=cf.AI_EDITABLE)
    else:
        cur = dict(getattr(char, parent) or {})
        cur[sub] = final
        cf.apply_fields(char, {parent: cur}, allowed=cf.AI_EDITABLE)
    _field_pop(fields, field)
    _close_if_empty(proposal, payload, preview, fields)
    from actions.models import Proposal
    _supersede_field_in_siblings(
        ctx, proposal.id, cid, field, empty_status=Proposal.STATUS_APPLIED)
    result["character_id"] = cid


def commit_reject_character_field(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Reject ONE proposed field: drop it from the proposal (no Character write),
    close the proposal once nothing is pending. Accepts dotted dict paths."""
    proposal, payload, preview, fields, field = _resolve_field_proposal(ctx, result)
    cid = preview.get("character_id")
    _field_pop(fields, field)
    _close_if_empty(proposal, payload, preview, fields)
    from actions.models import Proposal
    _supersede_field_in_siblings(
        ctx, proposal.id, cid, field, empty_status=Proposal.STATUS_REJECTED)
    result["character_id"] = cid


def commit_update_proposed_field(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Save an EDITED proposed value back INTO the proposal (still pending) — the
    blur-save while in proposal mode. The Character is NOT touched; the value only
    moves to the actual field on accept. No-op if the field was already resolved.
    Accepts dotted dict paths (`appearance.eyes`)."""
    proposal, payload, preview, fields, field = _resolve_field_proposal(ctx, result, pending=False)
    if not _field_present(fields, field):
        return  # already accepted / rejected — nothing pending to update
    _field_set(fields, field, result.get("value"))
    preview["fields"] = fields
    payload["preview"] = preview
    proposal.proposal = payload
    proposal.save(update_fields=["proposal", "updated_at"])
    result["character_id"] = preview.get("character_id")


# ---- plain CRUD (moved from actions/capabilities/*/crud.py) ----------- #

def commit_update_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    row = readers.patch_character(ctx.project_id, result["character_id"], result["fields"])
    result["character"] = row


def commit_delete_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    deleted = readers.delete_character(ctx.project_id, result["character_id"])
    result.update(deleted)


def commit_undelete_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    result["character"] = readers.undelete_character(ctx.project_id, result["character_id"])
