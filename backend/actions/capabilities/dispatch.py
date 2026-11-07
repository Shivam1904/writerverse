"""dispatch() — the single path every actor uses to invoke a capability.

Actor check → gather → execute → route-specific handling:
  READ:    return result
  WRITE:   commit + bookkeep
  PROPOSE: create Proposal row
"""
from __future__ import annotations

import contextvars
import logging
from dataclasses import dataclass, field
from typing import Any

from ai_engine.config import (
    AI_NOT_CONFIGURED_CODE,
    AI_NOT_CONFIGURED_MESSAGE,
    AINotConfiguredError,
)

from actions import domain_versions
from actions.awareness.staleness import (
    invalidates_for,
    read_domain_for,
)

from . import registry
from .args import check_args
from .spec import (
    Actor,
    Capability,
    CapabilityError,
    DispatchContext,
    ProposeWhen,
    Route,
)

logger = logging.getLogger("writerverse.consistency")


@dataclass
class DispatchResult:
    """Uniform return for every dispatch, whatever the actor/decision."""

    status: str  # "ran" | "proposed" | "denied" | "unknown" | "error"
    capability: str
    result: dict[str, Any] | None = None
    proposal: dict[str, Any] | None = None
    error: str | None = None
    http_status: int | None = None  # status hint when status == "error"
    code: str | None = None  # machine-readable error code, e.g. "ai_not_configured"
    # Extra fields for the error body, e.g. {"conflicts": [...]} on a stale accept.
    error_data: dict[str, Any] | None = None
    # One PROPOSE dispatch may emit MULTIPLE proposals (one Proposal row each):
    # the caller's preview returns a list of units → one row per unit. This list
    # always carries every row created ({proposal_id, capability, args, proposal});
    # `proposal` + `result["proposal_id"]` above mirror the FIRST entry for the
    # single-proposal callers/back-compat path. Empty for non-PROPOSE dispatches.
    proposals: list[dict[str, Any]] = field(default_factory=list)
    # D31 staleness fields. `invalidates` is populated on successful writes:
    # the list of domains whose version was bumped. `staleness` is populated
    # on successful reads: {domain: current_version_string}. Either can be
    # empty for capabilities not mapped in `actions/config/staleness.yml`.
    invalidates: list[str] = field(default_factory=list)
    staleness: dict[str, str] = field(default_factory=dict)
    # Follow-up proposals a WRITE asked to spawn (e.g. accepting the story slice
    # of run_init_elements queues a generate_thread_from_description proposal).
    # Each entry is {capability, args}. They are COLLECTED through nested
    # dispatches but executed by the top-level caller via `run_followups()`,
    # AFTER the write's project lock is released — so a follow-up's LLM call
    # never runs inside the lock.
    followups: list[dict[str, Any]] = field(default_factory=list)


def _context_for(
    scope: Any,
    actor: Actor,
    *,
    thread_id: Any = None,
    page: str = "",
) -> DispatchContext:
    # No project data is loaded here: this runs on EVERY dispatch (reads too).
    # A gather that needs braindumps loads them itself.
    project_id = getattr(scope, "project_id", None)
    return DispatchContext(
        actor=actor,
        project_id=project_id,
        thread_id=thread_id,
        page=page,
        scope=scope,
    )


def dispatch(
    name: str,
    args: dict[str, Any] | None,
    actor: Actor,
    scope: Any,
    *,
    thread_id: Any = None,
    page: str = "",
) -> DispatchResult:
    """Run (or propose) a capability for an actor.

    `scope` is a `ProjectScope` (anything with a `.project_id`).

    `thread_id` and `page` are optional chat context — used by Route.PROPOSE
    to create the Proposal row with the correct thread/page association.
    """
    args = args or {}
    cap = registry.get(name)
    if cap is None:
        logger.warning("dispatch unknown capability=%s actor=%s", name, actor.value)
        return DispatchResult(
            status="unknown", capability=name, error=f"unknown capability: {name}"
        )

    project_id = getattr(scope, "project_id", None)

    # Who owns the tokens: see `ai_engine/units.py`. Inside an open AI unit (a
    # chat turn, or an outer dispatch) this dispatch only adds its tokens to it.
    from ai_engine import units
    from common.turns import trace_tag, turn

    # AI calls inside carry `capability:<name>` (LangSmith, ai_engine/call_log.py).
    tag = f"capability:{cap.name}"
    unit = units.current()
    if unit is not None:
        with trace_tag(tag):
            return _dispatch_nested(cap, args, actor, scope, unit,
                                    thread_id=thread_id, page=page)

    # Outermost dispatch = one AI turn: its logs, usage and traces share one
    # turn_id (`common/turns.py`). A dispatch inside a chat turn joins that turn.
    with turn(), trace_tag(tag):
        return _dispatch_outermost(cap, args, actor, scope, project_id,
                                   thread_id=thread_id, page=page)


def _dispatch_outermost(
    cap: Capability,
    args: dict[str, Any],
    actor: Actor,
    scope: Any,
    project_id: Any,
    *,
    thread_id: Any = None,
    page: str = "",
) -> DispatchResult:
    """A dispatch with no AI unit open: gate, open one, settle it."""
    from ai_engine import units

    # AI policy pre-flight (`usage/policy.py`). Checked BEFORE the model runs,
    # so a refused author gets the policy's status (402) and we spend nothing.
    if cap.uses_ai:
        refused = _ai_gate(cap, project_id)
        if refused is not None:
            return refused

    # Outermost dispatch — open the AI unit (meters every LLM call
    # underneath), then settle it once. Settling runs in `finally`, so tokens
    # spent before a crash are still recorded (SA-217). An unreadable AI reply
    # (ask_json's UnreadableReply) is the exception: its tokens never reach the
    # meter, so a run that fails only because of it records 0 (wrt-100).
    feature = cap.name
    res: DispatchResult | None = None
    opened: units.AIUnit | None = None
    try:
        with units.open_unit(feature) as opened:
            res = _dispatch_new(cap, args, actor, scope,
                                thread_id=thread_id, page=page)
    finally:
        if opened is not None:
            used = opened.usage()
            _settle_dispatch(
                res, project_id, used.cost_usd, feature, opened.key,
                tokens_in=used.tokens_in, tokens_out=used.tokens_out,
            )
    return res


def _dispatch_nested(
    cap: Capability,
    args: dict[str, Any],
    actor: Actor,
    scope: Any,
    unit: Any,
    *,
    thread_id: Any = None,
    page: str = "",
) -> DispatchResult:
    """A dispatch inside an open AI unit. Most work just joins the unit's
    meter. A feature the AI policy says has its own price keeps it: it is gated
    on its own, its tokens are carved out of the unit, and it is settled here,
    once, under a key derived from the unit's key."""
    if not cap.uses_ai:
        return _dispatch_new(cap, args, actor, scope,
                             thread_id=thread_id, page=page)

    from usage.policy import get_policy

    feature = cap.name
    try:
        own_price = get_policy().has_own_price(feature)
    except Exception:  # noqa: BLE001 — a policy hiccup: the outer unit owns it
        logger.exception("has_own_price failed feature=%s", feature)
        own_price = False
    if not own_price:
        return _dispatch_new(cap, args, actor, scope,
                             thread_id=thread_id, page=page)

    project_id = getattr(scope, "project_id", None)
    # The outer unit was gated for its own feature, not this one.
    refused = _ai_gate(cap, project_id)
    if refused is not None:
        return refused

    from ai_engine.units import usage_of

    res: DispatchResult | None = None
    sub: Any = None
    try:
        with unit.carve_out() as sub:
            res = _dispatch_new(cap, args, actor, scope,
                                thread_id=thread_id, page=page)
    finally:
        used = usage_of(sub)
        _settle_dispatch(
            res, project_id, used.cost_usd, feature, unit.child_key(feature),
            tokens_in=used.tokens_in, tokens_out=used.tokens_out,
        )
    return res


def _ai_gate(cap: Capability, project_id: Any) -> DispatchResult | None:
    """An error result when the AI policy refuses this AI capability for the
    project's owner, else None.

    Same check, status, message and code as the chat pre-flight
    (`night_eyes/stream.py`). No resolvable owner (no project) → allow; the
    settle after it is skipped too.
    """
    from usage.services import gate, owner_of

    refusal = gate(owner_of(project_id), cap.name)
    if refusal is None:
        return None
    logger.info("dispatch DENY (%s) capability=%s", refusal.code, cap.name)
    return DispatchResult(
        status="error", capability=cap.name, error=refusal.message,
        http_status=refusal.http_status, code=refusal.code,
    )


def _settle_dispatch(
    res: DispatchResult | None,
    project_id: Any,
    cost_usd: Any,
    cap_name: str,
    idempotency_key: str,
    tokens_in: int = 0,
    tokens_out: int = 0,
) -> None:
    """Settle a dispatch's AI usage for the project's owner
    (`usage.services.settle`) and flag project_meta for refetch.

    `res` is None when the dispatch raised: its tokens are still recorded
    (SA-217). Never raises: a finished result is never turned into an error."""
    from decimal import Decimal

    from ai_engine.units import Usage
    from usage.services import owner_of, settle

    if not project_id:
        return
    try:
        cost = Decimal(str(cost_usd))
    except Exception:  # noqa: BLE001
        cost = Decimal("0")
    try:
        user = owner_of(project_id)
    except Exception:  # noqa: BLE001
        logger.exception("dispatch owner lookup failed project=%s", project_id)
        return
    cap = registry.get(cap_name)
    done = settle(
        user, cap_name, Usage(cost, tokens_in, tokens_out), idempotency_key,
        succeeded=res is not None and res.status in ("ran", "proposed"),
        label=cap.label if cap else "",
    )
    if done.refusal is not None:
        # This result is already paid for, so it is still returned; the
        # policy's `check` refuses the next AI request.
        logger.warning(
            "dispatch refused after the call project=%s cap=%s key=%s: %s",
            project_id, cap_name, idempotency_key, done.refusal.code,
        )
    if not done.changed:
        return
    if res is not None:
        res.invalidates = list({*(res.invalidates or []), "project_meta"})
    try:
        domain_versions.bump_ai_usage(project_id)
    except Exception:  # noqa: BLE001
        logger.exception("ai_usage version bump failed")


def run_followups(
    res: DispatchResult,
    scope: Any,
    *,
    page: str = "",
) -> DispatchResult:
    """Execute the follow-up proposals a write queued, OUTSIDE its project lock.

    A WRITE commit can ask for a follow-up proposal by appending to
    `result["_followups"]` (e.g. accepting the story slice of run_init_elements
    queues a generate_thread_from_description proposal). Those requests bubble up
    through nested dispatches into `res.followups`, but are NOT run inside
    `dispatch()` — the write still holds its `select_for_update` lock there, and
    a follow-up's LLM call must never run under the lock.

    The TOP-LEVEL caller (the HTTP facade) invokes this once, after `dispatch()`
    has fully returned and the lock is released. Each follow-up runs as
    USER_BUTTON, so the Proposal row it creates is indistinguishable from a
    button-generated one (source=button, accepted via the generic
    accept_proposal path). Created proposals are merged into `res.proposals` so
    the facade can ride them back to the gateway in the response body; any
    invalidates they raise merge into `res.invalidates`.
    """
    if not res.followups:
        return res
    created = list(res.proposals or [])
    invalidates = set(res.invalidates or [])
    for fu in res.followups:
        cap_name = (fu or {}).get("capability")
        if not cap_name:
            continue
        sub = dispatch(cap_name, (fu or {}).get("args") or {},
                       Actor.USER_BUTTON, scope, page=page)
        if sub.status == "proposed":
            created.extend(sub.proposals or [])
        elif sub.status == "ran":
            invalidates |= set(sub.invalidates or [])
        else:
            logger.warning(
                "followup dispatch failed cap=%s status=%s err=%s",
                cap_name, sub.status, sub.error,
            )
    res.proposals = created
    res.invalidates = list(invalidates)
    res.followups = []
    return res


# ---- New-style dispatch ---------------------------------------------------

# Tokens the dispatch frames nested inside the current one have already
# accounted for (see `_dispatch_new`). None at the outermost dispatch.
_AI_FRAME: contextvars.ContextVar[list[int] | None] = contextvars.ContextVar(
    "dispatch_ai_frame", default=None,
)


def _unit_tokens(unit: Any) -> int:
    from ai_engine.usage_meter import input_tokens, output_tokens
    return input_tokens(unit.cb) + output_tokens(unit.cb)


def _dispatch_new(
    cap: Capability,
    args: dict[str, Any],
    actor: Actor,
    scope: Any,
    *,
    thread_id: Any = None,
    page: str = "",
) -> DispatchResult:
    """Run one capability, and check its `uses_ai` flag is honest.

    The open AI unit's meter shows how many tokens this run spent. Tokens
    spent by nested dispatches are theirs to explain (a nested AI capability is
    fine inside a plain one). If a `uses_ai=False` capability spent tokens of
    its own, the AI policy gate was skipped for real AI work: an error log in
    dev/tests, a warning in prod."""
    from ai_engine import units

    unit = units.current()
    if unit is None:
        return _run_capability(cap, args, actor, scope,
                               thread_id=thread_id, page=page)
    before = _unit_tokens(unit)
    nested = [0]
    parent = _AI_FRAME.get()
    tok = _AI_FRAME.set(nested)
    try:
        return _run_capability(cap, args, actor, scope,
                               thread_id=thread_id, page=page)
    finally:
        _AI_FRAME.reset(tok)
        used = _unit_tokens(unit) - before
        own = used - nested[0]
        if not cap.uses_ai and own > 0:
            from ai_engine import usage_meter
            log = logger.error if usage_meter.STRICT else logger.warning
            log(
                "capability %s spent %d LLM tokens but has uses_ai=False: its "
                "AI policy check was skipped. Set uses_ai=True.", cap.name, own,
            )
        if parent is not None:
            parent[0] += used


def _run_capability(
    cap: Capability,
    args: dict[str, Any],
    actor: Actor,
    scope: Any,
    *,
    thread_id: Any = None,
    page: str = "",
) -> DispatchResult:
    if actor not in cap.actors:
        logger.info("dispatch DENY capability=%s actor=%s", cap.name, actor.value)
        return DispatchResult(
            status="denied", capability=cap.name,
            error=f"{actor.value} may not run {cap.name}",
        )

    ctx = _context_for(scope, actor, thread_id=thread_id, page=page)

    try:
        # Every actor's args are checked against `cap.args` (400 on a wrong
        # type; a missing required arg is a 400 only for the AI). The
        # original args go on unchanged.
        check_args(cap, args, require=actor is Actor.CHAT)
        gathered = cap.gather(ctx, args) if cap.gather else dict(args)
        result = cap.execute(ctx, gathered) if cap.execute else gathered
    except CapabilityError as exc:
        logger.info(
            "dispatch ERROR capability=%s actor=%s status=%s msg=%s",
            cap.name, actor.value, exc.status, exc.message,
        )
        return DispatchResult(
            status="error", capability=cap.name, error=exc.message,
            http_status=exc.status, code=exc.code, error_data=exc.data,
        )
    except AINotConfiguredError as exc:
        # The server has no API key for this AI call: a calm 503, not a crash.
        logger.warning("dispatch AI-NOT-CONFIGURED capability=%s: %s", cap.name, exc)
        return DispatchResult(
            status="error", capability=cap.name, error=AI_NOT_CONFIGURED_MESSAGE,
            http_status=503, code=AI_NOT_CONFIGURED_CODE,
        )

    if cap.route is Route.READ:
        staleness: dict[str, str] = {}
        domain = read_domain_for(cap.name)
        if domain is not None:
            staleness[domain] = (
                domain_versions.version_of(ctx.project_id, domain)
                if ctx.project_id is not None else ""
            )
        logger.info("dispatch READ capability=%s actor=%s", cap.name, actor.value)
        return DispatchResult(
            status="ran", capability=cap.name, result=result, staleness=staleness,
        )

    if cap.route is Route.PROPOSE:
        return _commit_proposal(cap, args, result, ctx)

    # Route.WRITE
    try:
        invalidates = _commit_and_bookkeep(cap, ctx, result)
    except CapabilityError as exc:
        logger.info(
            "dispatch COMMIT-ERROR capability=%s actor=%s status=%s msg=%s",
            cap.name, actor.value, exc.status, exc.message,
        )
        return DispatchResult(
            status="error", capability=cap.name, error=exc.message,
            http_status=exc.status, code=exc.code, error_data=exc.data,
        )

    # Merge invalidates from nested dispatches (e.g. generic accept_proposal
    # dispatches a per-type accept whose invalidates land in result["_invalidates"]).
    nested = result.get("_invalidates") if isinstance(result, dict) else None
    if nested:
        invalidates = list(set(invalidates) | set(nested))
    # Carry up any follow-up proposals this write requested (set on the result by
    # a commit, or bubbled up from a nested accept). We only COLLECT them here —
    # `run_followups()` dispatches them at the top level, AFTER the lock released.
    followups = result.pop("_followups", None) if isinstance(result, dict) else None
    # Other open tabs learn about this write from the version bump above:
    # the live-update stream (actions/staleness_stream.py) polls it.
    logger.info("dispatch WROTE capability=%s actor=%s", cap.name, actor.value)
    return DispatchResult(
        status="ran", capability=cap.name, result=result, invalidates=invalidates,
        followups=list(followups or []),
    )


# ---- PROPOSE → write Proposal row -----------------------------------------

_ACTOR_TO_SOURCE = {
    Actor.CHAT: "chat",
    Actor.USER_BUTTON: "button",
    Actor.CRON: "cron",
    Actor.INTERNAL: "chat",  # internal re-dispatch inherits chat source
}


def _commit_proposal(
    cap: Capability,
    args: dict[str, Any],
    result: dict[str, Any],
    ctx: DispatchContext,
) -> DispatchResult:
    """PROPOSE is a write — it creates one or more Proposal rows on disk.

    `cap.preview(result)` (or the raw result when no preview) shapes what the
    surfaces render. It may return:
      • a dict  → ONE proposal (the common case, unchanged behaviour), or
      • a list  → N proposals, one Proposal row per unit. Each unit is
                  `{preview, capability?, args?}` (capability/args default to
                  this cap's). A single expensive run (e.g. one LLM extraction)
                  thus fans out into per-slice proposals the author accepts
                  independently — accept-by-id needs no special handling.

    The row(s) are the single source of truth for all three rendering surfaces
    and the accept/reject endpoints.
    """
    shaped = cap.preview(result) if cap.preview else result
    if isinstance(shaped, list):
        return _commit_multi_proposals(cap, args, shaped, ctx)
    return _commit_single_proposal(cap, args, shaped, ctx)


def _proposal_payload(capability: str, args: dict[str, Any], preview: Any) -> dict[str, Any]:
    return {
        "capability": capability,
        "args": dict(args),
        "requires_confirmation": True,
        "preview": preview,
    }


def _create_proposal_row(
    cap_name: str,
    args: dict[str, Any],
    preview: Any,
    ctx: DispatchContext,
) -> tuple[Any, dict[str, Any]]:
    from actions.capabilities.stamps import stamp_base
    from actions.models import Proposal  # late import to avoid circular

    payload = _proposal_payload(cap_name, args, preview)
    row = Proposal.objects.create(
        # SA-209: what the target looks like NOW, so accept can tell if the
        # author changed it in the meantime.
        base=stamp_base(ctx, cap_name, preview, args),
        project_id=ctx.project_id,
        thread_id=ctx.thread_id if ctx.thread_id else None,
        source=_ACTOR_TO_SOURCE.get(ctx.actor, "chat"),
        page=ctx.page or "",
        capability=cap_name,
        args=dict(args),
        proposal=payload,
    )
    return row, payload


def _commit_single_proposal(
    cap: Capability,
    args: dict[str, Any],
    preview: Any,
    ctx: DispatchContext,
) -> DispatchResult:
    row, payload = _create_proposal_row(cap.name, args, preview, ctx)

    # AI_ONLY capabilities only show a human-in-loop card when the AI (CHAT)
    # proposes. For any other actor (button/cron) the trigger IS the intent, so
    # apply immediately via the accept path instead of leaving the row pending.
    if cap.propose_when is ProposeWhen.AI_ONLY and ctx.actor is not Actor.CHAT:
        if cap.accept:
            return _auto_apply_proposal(cap, row, ctx)
        logger.warning(
            "dispatch AUTO-APPLY skipped (no accept) capability=%s actor=%s "
            "— leaving proposal pending", cap.name, ctx.actor.value,
        )

    logger.info(
        "dispatch PROPOSE capability=%s actor=%s proposal_id=%s",
        cap.name, ctx.actor.value, row.pk,
    )
    entry = {
        "proposal_id": row.pk, "capability": cap.name,
        "args": dict(args), "proposal": payload,
    }
    return DispatchResult(
        status="proposed", capability=cap.name, proposal=payload,
        result={"proposal_id": row.pk}, proposals=[entry],
    )


def _commit_multi_proposals(
    cap: Capability,
    args: dict[str, Any],
    units: list[dict[str, Any]],
    ctx: DispatchContext,
) -> DispatchResult:
    """Create one Proposal row per unit. Each row stays independently
    acceptable (accept-by-id), so the only extra work over the single path is
    looping the row creation + returning the full `proposals` list."""
    entries: list[dict[str, Any]] = []
    for unit in units:
        u_cap = unit.get("capability", cap.name)
        u_args = dict(unit.get("args", args))
        u_preview = unit.get("preview", unit)
        row, payload = _create_proposal_row(u_cap, u_args, u_preview, ctx)
        entries.append({
            "proposal_id": row.pk, "capability": u_cap,
            "args": u_args, "proposal": payload,
        })

    logger.info(
        "dispatch PROPOSE-MULTI capability=%s actor=%s n=%d ids=%s",
        cap.name, ctx.actor.value, len(entries),
        [e["proposal_id"] for e in entries],
    )
    first = entries[0] if entries else None
    return DispatchResult(
        status="proposed", capability=cap.name,
        proposal=first["proposal"] if first else None,
        result={"proposal_id": first["proposal_id"]} if first else {},
        proposals=entries,
    )


def _auto_apply_proposal(
    cap: Capability,
    row: Any,
    ctx: DispatchContext,
) -> DispatchResult:
    """Apply an AI_ONLY proposal immediately on behalf of a non-AI actor.

    Dispatches the cap's `accept` WRITE capability as INTERNAL — the exact path
    proposal-accept uses — then flips the row to APPLIED so it never surfaces as
    pending. The row is created first (by the caller) precisely so the accept cap
    can read the stashed preview by id: no recompute, no double LLM cost. The
    nested write's `invalidates` propagate up so TanStack still auto-refetches.
    """
    from actions.models import Proposal  # late import to avoid circular

    nested = dispatch(
        cap.accept, {"proposal_id": str(row.pk)}, Actor.INTERNAL, ctx.scope,
    )
    if nested.status != "ran":
        # Accept failed — mark the row FAILED and surface the error rather than
        # silently leaving a half-applied write or a stale pending card.
        row.status = Proposal.STATUS_FAILED
        row.save(update_fields=["status", "updated_at"])
        logger.info(
            "dispatch AUTO-APPLY FAILED capability=%s actor=%s proposal_id=%s "
            "nested_status=%s", cap.name, ctx.actor.value, row.pk, nested.status,
        )
        return DispatchResult(
            status="error", capability=cap.name,
            error=nested.error or f"auto-apply failed ({nested.status})",
            http_status=nested.http_status,
        )

    row.status = Proposal.STATUS_APPLIED
    row.save(update_fields=["status", "updated_at"])
    logger.info(
        "dispatch AUTO-APPLY capability=%s actor=%s proposal_id=%s",
        cap.name, ctx.actor.value, row.pk,
    )
    # The accept's result comes from `gather_from_proposal`, which carries the raw
    # Proposal ORM row under "proposal" for internal commits to flip status. That
    # object is NOT JSON-serializable, and unlike the chat accept path (which
    # summarises before responding) this result is returned straight to the HTTP
    # facade — so a user form edit that auto-applies 500s on render. Strip the
    # internal row before handing the result back across the boundary.
    clean = nested.result
    if isinstance(clean, dict) and "proposal" in clean:
        clean = {k: v for k, v in clean.items() if k != "proposal"}
        clean.setdefault("proposal_id", row.pk)
    return DispatchResult(
        status="ran", capability=cap.name, result=clean,
        invalidates=nested.invalidates,
    )


# ---- Shared bookkeeping for WRITE route -----------------------------------


def _commit_and_bookkeep(
    cap: Capability,
    ctx: DispatchContext,
    result: dict[str, Any],
) -> list[str]:
    """Commit a WRITE + bump domain versions under the project's write lock.

    The lock is the Project row itself: `SELECT … FOR UPDATE` inside
    `transaction.atomic()`. Two writes to the same project therefore run one
    after the other — the second waits until the first commits — while writes
    to different projects never block each other. The commit reads whatever
    state it needs fresh from the DB inside the lock.

    The expensive gather/execute already ran UNLOCKED, so no LLM call is ever
    held inside the lock. Keep it that way: only the commit goes in here.
    Nested writes (e.g. accept_proposal → per-type accept) re-take the same
    row lock on the same connection, which Postgres allows.
    """
    if ctx.project_id is None:
        if cap.commit is not None:
            cap.commit(ctx, result)
        return _bookkeep_write(cap, ctx, result)

    from django.db import transaction
    from projects.models import Project

    with transaction.atomic():
        # Take the lock (the row itself is not needed).
        Project.objects.select_for_update().only("pk").get(pk=ctx.project_id)
        if cap.commit is not None:
            cap.commit(ctx, result)
        return _bookkeep_write(cap, ctx, result)


def _bookkeep_write(
    cap: Capability,
    ctx: DispatchContext,
    result: dict[str, Any],
) -> list[str]:
    """Bump the invalidated domains' versions. Returns the invalidated
    domains."""
    invalidates = invalidates_for(cap.name)
    if invalidates and ctx.project_id is not None:
        domain_versions.bump(ctx.project_id, invalidates)
    return invalidates
