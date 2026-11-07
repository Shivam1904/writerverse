"""Commit layer — project page metadata.

Two tiers, mirroring the character studio:
  • commit_update_project_meta — accept-ALL: write every proposed field at once
    (the auto-apply path for a user's own edit + the toast/chat accept).
  • commit_accept/reject/update_proposed_meta_field — per-field: the World page
    reviews a `meta_edit` proposal one field at a time (green accept/reject),
    shrinking the proposal until it closes (APPLIED).
"""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from projects.meta_fields import canonicalize_meta_patch
from projects.models import Project

# Fields a meta-edit proposal may write — the canonical metadata columns the
# World form speaks (post-canonicalisation: plural genres/themes, coded
# perspective/tense/audience). Guards setattr from touching derived columns.
EDITABLE_META_FIELDS = frozenset({
    "title", "description", "synopsis", "logline",
    "genres", "themes", "tones", "perspective", "tense", "audience",
})


def commit_update_project_meta(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Accept-ALL: persist every proposed field of a meta_edit proposal in one
    write. Used by the auto-apply path (a user's own form edit) and the
    toast/chat accept. The per-field World surface uses the field caps below."""
    preview = result.get("preview") or result
    project_id = preview.get("project_id") or ctx.project_id
    # Canonicalise defensively: proposals created before field-folding shipped
    # still carry legacy singular genre/theme and free-text choice labels.
    # Idempotent for fresh (already-canonical) rows.
    patch = canonicalize_meta_patch(preview.get("fields") or {})

    try:
        project = Project.objects.get(pk=project_id)
    except Project.DoesNotExist as exc:
        raise CapabilityError(f"project {project_id} not found", 404) from exc

    update_fields = []
    for field_name, val in patch.items():
        # Never blank a book's title from an accept-all — proposals authored
        # before the gather-side guard can still carry `title: ""`.
        if field_name == "title" and not (val or "").strip():
            continue
        setattr(project, field_name, val)
        update_fields.append(field_name)
    if update_fields:
        project.save(update_fields=update_fields + ["updated_at"])


# ── per-field accept / reject / edit ────────────────────────────────────────
# The studio pattern, simplified: metadata fields are flat (no dotted dict
# paths), so a `field` is just a column name. The Proposal row's JSON is
# `{capability, args, preview:{type:"meta_edit", project_id, fields}}`.

def _resolve_meta_field_proposal(ctx: DispatchContext, result: dict[str, Any], *, pending: bool = True):
    """Load (proposal, payload, preview, fields, field) for a field-level op."""
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


def _close_meta_if_empty(proposal, payload, preview, fields) -> None:
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


def _supersede_meta_field_in_siblings(ctx, keep_id, field, *, empty_status) -> None:
    """Drop `field` from every OTHER pending meta_edit proposal for this project,
    so a field the author just decided can't resurface from a stale sibling. The
    World page shows ONE green cell per field (latest pending wins); resolving it
    on the displayed proposal must clear the same field everywhere or an older
    proposal still holding it pops back up on the next read. Siblings emptied by
    the drop are closed with `empty_status` (APPLIED when the field was accepted —
    its value reached the row via the kept proposal; REJECTED when rejected)."""
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
        if preview.get("type") != "meta_edit":
            continue
        fields = dict(preview.get("fields") or {})
        if field not in fields:
            continue
        fields.pop(field, None)
        preview["fields"] = fields
        payload["preview"] = preview
        p.proposal = payload
        update = ["proposal", "updated_at"]
        if not fields:
            p.status = empty_status
            update.append("status")
        p.save(update_fields=update)


def commit_accept_project_meta_field(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Accept ONE proposed field: write the (possibly author-edited) value onto
    the Project, drop the field from the proposal, close it once empty. `value`
    (the value the author confirmed in the green field) wins over the AI's
    original proposed value."""
    proposal, payload, preview, fields, field = _resolve_meta_field_proposal(ctx, result)
    if field not in EDITABLE_META_FIELDS:
        raise CapabilityError(f"field '{field}' is not editable", 400)
    project_id = preview.get("project_id") or ctx.project_id
    project = Project.objects.filter(pk=project_id).first()
    if project is None:
        raise CapabilityError("project not found", 404)

    value = result.get("value")
    final = value if value is not None else fields.get(field)
    if not result.get("force"):  # SA-209: don't clobber a newer author edit
        from actions.capabilities.stamps import check_fresh
        check_fresh(ctx, proposal, preview, only=field, proposed_override=final)
    # Canonicalise the single field (coerces enum labels, folds legacy keys).
    canon = canonicalize_meta_patch({field: final})
    updated = []
    for k, v in canon.items():
        setattr(project, k, v)
        updated.append(k)
    if updated:
        project.save(update_fields=updated + ["updated_at"])

    fields.pop(field, None)
    _close_meta_if_empty(proposal, payload, preview, fields)
    from actions.models import Proposal
    _supersede_meta_field_in_siblings(
        ctx, proposal.id, field, empty_status=Proposal.STATUS_APPLIED)
    result["project_id"] = project_id


def commit_reject_project_meta_field(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Reject ONE proposed field: drop it from the proposal (no Project write),
    close the proposal once nothing is pending."""
    proposal, payload, preview, fields, field = _resolve_meta_field_proposal(ctx, result)
    fields.pop(field, None)
    _close_meta_if_empty(proposal, payload, preview, fields)
    from actions.models import Proposal
    _supersede_meta_field_in_siblings(
        ctx, proposal.id, field, empty_status=Proposal.STATUS_REJECTED)
    result["project_id"] = preview.get("project_id")


def commit_update_proposed_meta_field(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Save an EDITED proposed value back INTO the proposal (still pending) — the
    blur-save while in proposal mode. The Project is NOT touched; the value only
    moves to the actual field on accept. No-op if the field was already resolved."""
    proposal, payload, preview, fields, field = _resolve_meta_field_proposal(ctx, result, pending=False)
    if field not in fields:
        return  # already accepted / rejected — nothing pending to update
    fields[field] = result.get("value")
    preview["fields"] = fields
    payload["preview"] = preview
    proposal.proposal = payload
    proposal.save(update_fields=["proposal", "updated_at"])
    result["project_id"] = preview.get("project_id")
