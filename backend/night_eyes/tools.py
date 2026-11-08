import logging

from actions.capabilities.args import args_model
from actions.capabilities.dispatch import dispatch, run_followups
from actions.capabilities.spec import Actor
from langchain_core.tools import StructuredTool

logger = logging.getLogger("writerverse.consistency")


def _update_read_baseline(thread_id, staleness):
    """Merge a read's `staleness: {domain: version}` into the
    ChatThread.read_baseline JSON field. Called from the tool wrapper so the
    per-thread baseline tracks the freshest version Night Eyes has actually
    observed."""
    if not thread_id or not staleness:
        return
    from night_eyes.models import ChatThread
    try:
        thread = ChatThread.objects.get(thread_id=thread_id)
    except ChatThread.DoesNotExist:
        return
    baseline = dict(thread.read_baseline or {})
    baseline.update(staleness)
    thread.read_baseline = baseline
    thread.save(update_fields=["read_baseline", "last_message_at"])


def _norm_args(args):
    """Stable signature for an args dict so a re-fired call with the same
    parameters compares equal regardless of key order / value-type quirks."""
    import json
    try:
        return json.dumps(args or {}, sort_keys=True, default=str)
    except Exception:  # noqa: BLE001
        return repr(args)


# How recently an identical call must have happened to be treated as a re-fire
# (not a deliberate later re-run). The post-accept resume fires within seconds.
_DUP_WINDOW_SECONDS = 180


def _is_recent_duplicate(thread_id, capability, args):
    """True when this EXACT (capability, args) was already submitted in this
    thread within the last few minutes and is still pending or applied.

    Guards the small chat model's habit of re-firing a tool on the accept-resume
    turn — after `[PROPOSAL_ACCEPTED]` it sometimes calls the tool again instead
    of just confirming, which would create a DUPLICATE proposal. Keyed on tool
    name + EXACT args (so a different call, or a retry after a REJECT, still goes
    through) and time-boxed (so a deliberate later re-run is not blocked)."""
    if not thread_id:
        return False
    from datetime import timedelta

    from actions.models import Proposal
    from django.utils import timezone
    try:
        cutoff = timezone.now() - timedelta(seconds=_DUP_WINDOW_SECONDS)
        recent = (
            Proposal.objects.filter(
                thread_id=thread_id,
                capability=capability,
                status__in=(Proposal.STATUS_PROPOSED, Proposal.STATUS_APPLIED),
                created_at__gte=cutoff,
            )
            .order_by("-created_at")
            .values_list("args", flat=True)[:8]
        )
        target = _norm_args(args)
        return any(_norm_args(a) == target for a in recent)
    except Exception:  # noqa: BLE001 — the guard must never break a tool call
        return False


def _wrap(cap, project_id, session, thread_id=None, page=''):
    name = cap.name  # always dispatch by internal registry name

    def tool_fn(**kwargs):
        # Idempotency guard (tool + params): if this exact call was just made in
        # this thread, don't run it again — return a "done" marker so the agent
        # finalises instead of creating a duplicate proposal. See the post-accept
        # re-fire note in CHAT_TOOL_EXPOSURE_AUDIT.md.
        if _is_recent_duplicate(thread_id, name, kwargs):
            logger.info("chat dup-guard blocked re-fire cap=%s thread=%s", name, thread_id)
            return (
                f"[ALREADY DONE] {name} with these exact details was already "
                "submitted in this conversation — not repeating it. Tell the "
                "author it's done; do not call this tool again."
            )
        # Dispatch is the failure point: a bad argument type (the LLM passing
        # `character_id="Luna"` instead of the numeric id), a DB coercion
        # error, a capability bug. If dispatch RAISES, the agent's tool_call
        # is left with no corresponding ToolMessage and LangGraph poisons the
        # whole thread (INVALID_CHAT_HISTORY) on every later turn. Catch it and
        # return a normal `[ERROR]` ToolMessage so the agent can recover (per
        # the prompt's "[ERROR] = STOP and tell the author" rule).
        try:
            result = dispatch(name, kwargs, Actor.CHAT, session,
                              thread_id=thread_id, page=page)
        except Exception as exc:  # noqa: BLE001
            return f"[ERROR] {name}: {exc}"
        if result.status == "proposed":
            # Night Eyes must NOT see the propose/accept distinction: from its
            # side every edit it makes is simply DONE — the human-in-the-loop
            # accept dance is a UI concern it never reasons about. So we do NOT
            # interrupt() here (that would pause the graph and leave NE silent,
            # no closing summary). dispatch() already wrote the Proposal row(s);
            # we stash their payloads on the shared session so the SSE generator
            # surfaces the card(s) to the human at end-of-turn (same sink pattern
            # as `_chat_invalidates` below), and hand the model a plain success
            # result so the react loop continues and it confirms the edit in
            # natural language.
            entries = result.proposals or [{
                "proposal_id": (result.result or {}).get("proposal_id"),
                "capability": name,
                "args": dict(kwargs or {}),
                "proposal": result.proposal,
            }]
            try:
                sink = getattr(session, "_chat_proposals", None)
                if sink is None:
                    sink = []
                    session._chat_proposals = sink
                sink.extend(entries)
            except Exception:  # noqa: BLE001 — surfacing bookkeeping never strands a tool_call
                logger.exception("chat proposal-surface stash failed cap=%s", name)
            # Proposal-free success result for the model: the shaped preview
            # content (what changed) so NE can summarise specifically, with NO
            # proposal/accept vocabulary leaking into its context.
            previews = [
                ((e.get("proposal") or {}).get("preview")
                 or e.get("proposal") or {"status": "ok"})
                for e in entries
            ]
            return previews[0] if len(previews) == 1 else previews
        if result.status == "denied":
            return f"[DENIED] {name}"
        if result.status == "error":
            return f"[ERROR] {result.error}"
        # Run any follow-ups the write queued (e.g. annotate_braindump after
        # add_braindump), now that dispatch() returned and its lock released —
        # same contract the HTTP facade honours, so a chat-initiated add goes
        # through the same pipeline a page/button add does. No-op when none.
        try:
            run_followups(result, session, page=page)
            # A chat-initiated WRITE can queue follow-up PROPOSALS (e.g.
            # promote_to_character → enrich_promoted_character drafts the new
            # character's fields). run_followups CREATES those rows and merges
            # them into result.proposals — but a WRITE never enters the
            # status=="proposed" branch above, so without this they're written
            # to the DB yet never surfaced to the chat: the human can't accept
            # them and the drafted work (the enriched fields) silently never
            # lands. "Make all 3 real + enrich → only 1 enriched" was exactly
            # this. Stash them on the same sink the propose-branch uses, mirroring
            # the HTTP facade, which rides res.proposals back to the gateway.
            if result.proposals:
                sink = getattr(session, "_chat_proposals", None)
                if sink is None:
                    sink = []
                    session._chat_proposals = sink
                sink.extend(result.proposals)
        except Exception:  # noqa: BLE001 — a follow-up failure must not strand the tool_call
            logger.exception("chat follow-up failed cap=%s", name)
        # D31: record the version we just saw, so the next-turn drift check
        # has an accurate baseline. Guarded separately — a baseline write
        # failure must not propagate and strand the tool_call either.
        try:
            if result.staleness:
                _update_read_baseline(thread_id, result.staleness)
        except Exception:  # noqa: BLE001
            pass
        # D31: surface this direct WRITE's mutated domains to the chat SSE so the
        # acting tab's TanStack cache refetches — the chat path's fast-path
        # invalidation, symmetric with the facade `X-Invalidates` header and the
        # accept-path `invalidates` event. Accumulate onto the shared session
        # (same instance the SSE generator holds via `chat.session`); the
        # generator drains it into one `invalidates` event at end-of-turn.
        # Without this, a chat-driven write only reaches the acting tab via the
        # cross-actor staleness stream, which it may not have open. Runs AFTER
        # run_followups so any follow-up's invalidates are included.
        try:
            if result.invalidates:
                sink = getattr(session, "_chat_invalidates", None)
                if sink is None:
                    sink = set()
                    session._chat_invalidates = sink
                sink.update(result.invalidates)
        except Exception:  # noqa: BLE001 — invalidation bookkeeping never strands a tool_call
            pass
        return result.result

    return tool_fn


def build_tools_from_caps(caps, project_id, session, thread_id=None, page=''):
    """Wrap an explicit capability list as StructuredTools (agentic core —
    the caller decides WHICH capabilities; ranking.py owns that)."""
    tools = []
    for cap in caps:
        fn = _wrap(cap, project_id, session, thread_id=thread_id, page=page)
        ai_name = cap.ai_name  # the name the LLM sees (may differ from cap.name)
        tools.append(StructuredTool.from_function(
            func=fn,
            name=ai_name,
            description=cap.description,
            args_schema=args_model(cap),
        ))
    return tools

