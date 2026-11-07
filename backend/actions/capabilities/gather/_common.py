"""Shared gather helpers — reusable across pages."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext


def gather_from_proposal(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Load a Proposal row by ID and return its preview as gathered data."""
    from actions.models import Proposal
    proposal_id = args.get("proposal_id")
    if not proposal_id:
        raise CapabilityError("proposal_id is required", 400)
    try:
        proposal = Proposal.objects.get(pk=proposal_id, project_id=ctx.project_id)
    except Proposal.DoesNotExist as exc:
        raise CapabilityError("proposal not found", 404) from exc
    if proposal.status != Proposal.STATUS_PROPOSED:
        raise CapabilityError(
            f"This suggestion was already {proposal.status.lower()}.", 409,
            code="proposal_not_pending",
        )
    preview = (proposal.proposal or {}).get("preview") or {}
    return {
        "proposal": proposal, "preview": preview, "args": proposal.args or {},
        # "Use AI's": accept even though the author changed the target since.
        "force": bool(args.get("force")),
    }
