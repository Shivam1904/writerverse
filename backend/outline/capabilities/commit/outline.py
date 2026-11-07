"""Commit layer — outline / threads page."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext


def commit_accept_outline_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Apply an accepted merge-insert proposal — insert the proposed beat into its
    scene as a real beat. Reached via gather_from_proposal, so `result` is
    `{proposal, preview, args}`; the preview is the full beat dict
    `{type:'outline_beat_insert', scene_id, index, fields:{text, kind, from_rough,
    from_item}}`. Edit-before-accept lives in the proposal (update_proposed_outline_beat),
    so this just reads `preview.fields`. Re-applied against the CURRENT grand."""
    from common.ids import new_id
    preview = result.get("preview") or result
    if preview.get("type") != "outline_beat_insert":
        raise CapabilityError("Unrecognised outline proposal type; nothing was applied.", 409)
    scene_id = preview.get("scene_id")
    fields = preview.get("fields") or {}
    from outline.outline_writes import get_item, insert_item
    scene = get_item(ctx.project_id, "scene", scene_id)
    if scene is None:
        raise CapabilityError("That scene no longer exists, so the beat could not be added.", 409)
    kind = fields.get("kind") if fields.get("kind") in ("heading", "placeholder") else "text"
    new_beat = {"id": new_id("bt"), "kind": kind, "text": (fields.get("text") or "").strip()}
    if fields.get("from_rough"):
        new_beat["from_rough"] = fields["from_rough"]
    if fields.get("from_item"):
        new_beat["from_item"] = fields["from_item"]
    insert_item(ctx.project_id, "beat", scene, new_beat, index=preview.get("index", -1))
    result["beat"] = new_beat


def commit_update_proposed_outline_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Save an edited proposed outline-beat value (text/kind) back INTO the
    proposal (still pending) — the blur-save while reviewing. The outline is NOT
    touched; the value only reaches the beat on accept. Mirrors
    commit_update_proposed_beat."""
    from actions.models import Proposal
    proposal = Proposal.objects.filter(
        project_id=ctx.project_id, id=result.get("proposal_id")).first()
    if proposal is None:
        raise CapabilityError("proposal not found", 404)
    payload = dict(proposal.proposal or {})
    preview = dict(payload.get("preview") or {})
    if preview.get("type") != "outline_beat_insert":
        return
    fields = dict(preview.get("fields") or {})
    if result.get("text") is not None:
        fields["text"] = str(result["text"]).strip()
    if result.get("kind") is not None:
        fields["kind"] = result["kind"]
    preview["fields"] = fields
    payload["preview"] = preview
    proposal.proposal = payload
    proposal.save(update_fields=["proposal", "updated_at"])
