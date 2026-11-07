"""Commit layer — generic proposal operations (accept + reject)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import Actor, CapabilityError, DispatchContext
from actions.capabilities.stamps import STALE_CODE, check_fresh

NOT_PENDING_CODE = "proposal_not_pending"
ACCEPT_FAILED_MESSAGE = (
    "Couldn't apply this suggestion, so nothing changed. "
    "It is still here: try again, or dismiss it."
)


def load_pending_proposal(ctx: DispatchContext, proposal_id: Any):
    """Re-read a proposal inside the write lock and insist it is still PROPOSED.

    The gather step that first loaded the row ran WITHOUT the project lock, so two
    quick clicks could both see PROPOSED. Re-checking here, under the lock, makes
    a second accept (or an accept after a dismiss) a clean 409 instead of a
    second write (e.g. the same beat inserted twice)."""
    from actions.models import Proposal
    proposal = Proposal.objects.filter(project_id=ctx.project_id, pk=proposal_id).first()
    if proposal is None:
        raise CapabilityError("proposal not found", 404)
    if proposal.status != Proposal.STATUS_PROPOSED:
        raise CapabilityError(
            f"This suggestion was already {proposal.status.lower()}.", 409,
            code=NOT_PENDING_CODE,
        )
    return proposal


def guarded_accept(commit):
    """Wrap a per-type accept commit with the shared SA-209 checks.

    Every capability named in some capability's `accept=` uses this (a registry
    test enforces it), so EVERY proposal kind gets the same rules:
      1. the proposal is re-read under the lock and must still be PROPOSED;
      2. unless `force` ("Use AI's"), the fields it overwrites must still hold
         the values stamped when it was made — else ProposalConflict (409
         `proposal_stale`) and nothing is written;
      3. then the real commit runs."""
    def run(ctx: DispatchContext, result: dict[str, Any]) -> None:
        current = result.get("proposal")
        if current is not None:
            proposal = load_pending_proposal(ctx, current.pk)
            result["proposal"] = proposal
            # `preview` stays as gathered: an accept's execute step may have
            # folded extra fields into it.
            if not result.get("force"):
                check_fresh(ctx, proposal, result.get("preview") or {})
        commit(ctx, result)

    run.accept_guarded = True  # type: ignore[attr-defined]
    run.__name__ = getattr(commit, "__name__", "guarded_accept")
    run.__doc__ = commit.__doc__
    return run


def commit_accept_proposal(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Resolve the per-type accept capability and dispatch it, then mark APPLIED.
    If the per-type accept fails, the proposal stays PROPOSED and its error is
    passed on to the author.

    The generic accept_proposal capability delegates to the specific accept
    capability registered on the propose capability's `accept` field. This
    keeps the frontend simple — it only ever calls `accept_proposal` with a
    proposal_id, never needs to know per-type accept names.
    """
    from actions.capabilities import registry
    from actions.capabilities.dispatch import dispatch
    from actions.models import Proposal

    proposal = result["proposal"]
    # Look up the propose capability to find its linked accept capability.
    cap = registry.get(proposal.capability)
    if cap is None or not cap.accept:
        raise CapabilityError(
            f"no accept capability for {proposal.capability}", 400,
        )

    # Dispatch the per-type accept as INTERNAL — it does the actual writes.
    accept_result = dispatch(
        cap.accept,
        {"proposal_id": str(proposal.pk), "force": bool(result.get("force"))},
        Actor.INTERNAL,
        ctx.scope,
    )
    if accept_result.status == "error" and accept_result.code in (
        STALE_CODE, NOT_PENDING_CODE,
    ):
        # Stale: nothing was written and the author still has to choose (Use
        # AI's / Keep mine), so the proposal stays PROPOSED. Not pending: some
        # other request already closed it — leave its status alone.
        raise CapabilityError(
            accept_result.error or "conflict", accept_result.http_status or 409,
            code=accept_result.code, data=accept_result.error_data,
        )
    if accept_result.status == "error":
        # The proposal stays PROPOSED so the author can try again or dismiss it.
        # (No FAILED write: this whole accept runs in one transaction, and the
        # raise below rolls any write back.) Tell the author what went wrong:
        # the per-type accept's own message, or a plain sentence.
        raise CapabilityError(
            accept_result.error or ACCEPT_FAILED_MESSAGE,
            accept_result.http_status or 400,
            code=accept_result.code, data=accept_result.error_data,
        )

    proposal.refresh_from_db(fields=["status"])
    if proposal.status != Proposal.STATUS_PROPOSED:
        # Belt and braces: the guarded per-type accept already refused a closed
        # proposal; never flip a REJECTED/APPLIED row back.
        raise CapabilityError("This suggestion was already closed.", 409, code=NOT_PENDING_CODE)
    proposal.status = Proposal.STATUS_APPLIED
    proposal.save(update_fields=["status", "updated_at"])

    invalidates = list(accept_result.invalidates or [])
    # `result` (from gather_from_proposal) holds the Proposal model instance +
    # preview/args for this commit's use — those are NOT JSON-serializable and
    # must not leak into the HTTP response (the facade serializes res.result).
    # Replace with a clean summary; keep `_invalidates` so the outer dispatch's
    # bookkeep bubbles the mutated domains up. (The per-type accept's own result
    # is intentionally dropped — it can carry a Proposal too, and the FE only
    # needs success + invalidates.)
    result.clear()
    result["proposal_id"] = proposal.pk
    result["applied"] = True
    result["_invalidates"] = invalidates
    # Bubble any follow-up proposals the per-type accept queued (e.g. accepting
    # the story slice of run_init_elements asks for a generate_thread_from_
    # description proposal) up to the outer dispatch, which carries them out to
    # the facade where `run_followups` runs them OUTSIDE the session lock.
    if accept_result.followups:
        result["_followups"] = list(accept_result.followups)


def supersede_accepted_siblings(ctx: DispatchContext, *, keep_id, match) -> int:
    """Reject every OTHER pending proposal whose `preview` satisfies `match` — the
    siblings that target the SAME thing the just-accepted proposal did.

    The studio surfaces show ONE proposal per target (latest pending wins): the
    World page keys description drafts by `worldbuilding_id`, get_thread keys beat
    edits by `beat_id`. Accepting the displayed one must close same-target siblings
    or they resurface (with a stale value) on the next read. Callers pass the
    accepted proposal's id as `keep_id` so it's left for the generic accept flow to
    mark APPLIED. `match(preview)` is a predicate the caller scopes by type + target
    key. Returns the number of siblings rejected. Accept-side only."""
    from actions.models import Proposal
    rejected = 0
    siblings = (
        Proposal.objects.filter(
            project_id=ctx.project_id, status=Proposal.STATUS_PROPOSED,
        )
        .exclude(pk=keep_id)
    )
    for p in siblings:
        preview = (p.proposal or {}).get("preview") or {}
        if not match(preview):
            continue
        p.status = Proposal.STATUS_REJECTED
        p.save(update_fields=["status", "updated_at"])
        rejected += 1
    return rejected


def commit_reject_proposal(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Mark a Proposal as rejected (re-checked under the lock: rejecting an
    already-applied proposal must not flip it to REJECTED)."""
    from actions.models import Proposal
    proposal = load_pending_proposal(ctx, result["proposal"].pk)
    proposal.status = Proposal.STATUS_REJECTED
    proposal.save(update_fields=["status", "updated_at"])
    # Strip the non-serializable Proposal/preview/args gather loaded (facade
    # serializes res.result).
    proposal_pk = proposal.pk
    result.clear()
    result["proposal_id"] = proposal_pk
    result["rejected"] = True
