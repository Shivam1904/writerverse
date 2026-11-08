import asyncio
import json
import logging
import queue
import threading
import uuid

from actions.capabilities.dispatch import dispatch
from actions.capabilities.registry import all_capabilities
from actions.capabilities.registry import get as get_cap
from actions.capabilities.spec import Actor, Route
from actions.models import Proposal
from ai_engine.config import AI_NOT_CONFIGURED_MESSAGE, AINotConfiguredError
from common.throttling import AI_THROTTLES
from common.turns import turn
from django.http import Http404, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from langgraph.errors import GraphRecursionError
from projects.meta_fields import canonicalize_meta_patch
from projects.scoping import owned_project_or_404
from rest_framework import serializers
from rest_framework import status as drf_status
from rest_framework.views import APIView

from night_eyes.models import ChatThread

from .checkpointer import open_checkpointer
from .frames import get_frame
from .graph import ConsistencyChat
from .routing import resolve_role, role_to_tier

# How much of a tool's raw return payload to ship to the client as a
# thinking-step snippet. Big enough to be useful, small enough to avoid
# blowing up the SSE channel with huge JSON dumps.
_TOOL_RESULT_PREVIEW_CHARS = 1000

# What the author sees when a chat turn crashes. The raw exception is logged.
_RECURSION_ERROR_TEXT = (
    "Sorry, that took more steps than I'm allowed in one reply, so I stopped. "
    "Please try again, or break the request into smaller parts."
)
_GENERIC_ERROR_TEXT = "Sorry, something went wrong on my side. Please try again."

def _resolve_cap(name):
    """Look up a capability by its internal `name`, falling back to a scan
    for an `ai_name` alias (frame YAML now lists AI-visible tool names like
    `add_plot_thread_beat`, which are `tool_name` aliases of the registry's
    `propose_insert_beat` — a plain `get_cap` miss would mislabel those
    'direct' instead of 'propose')."""
    cap = get_cap(name)
    if cap is None:
        # First registry match on ai_name wins. Capability NAMES are unique but
        # ai_names are NOT (e.g. propose_character_edit and update_character both
        # expose ai_name "update_character") — keep frame-YAML action lists on the
        # capability that's actually chat-exposed so this stays unambiguous.
        cap = next((c for c in all_capabilities() if c.ai_name == name), None)
    return cap


def _op_type(name):
    cap = _resolve_cap(name)
    if cap is None:
        return 'direct'
    if cap.route is Route.READ:
        return 'direct'
    if cap.route is Route.PROPOSE:
        return 'propose'
    return 'direct'


logger = logging.getLogger("writerverse.consistency")


def _sse(event_type, data):
    return f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"


def _settle_chat_turn(project_pk, cost_usd, idempotency_key, tokens_in=0, tokens_out=0):
    """Settle one chat turn's AI usage for the project's owner
    (`usage.services.settle`). MUST run in the producer's worker thread AFTER
    its event loop has closed — inside a running loop the ORM raises
    SynchronousOnlyOperation; once the loop is closed the sync ORM is safe, and
    it still runs if the client disconnects. No-op when nothing was spent.
    Returns the AI policy's message when it refuses after the call (e.g. the
    author ran out of what the policy allows; the caller ends the turn on it).
    Never raises."""
    from decimal import Decimal

    from ai_engine.units import Usage
    if not project_pk:
        return None
    try:
        cost = Decimal(str(cost_usd or 0))
    except Exception:  # noqa: BLE001
        cost = Decimal("0")
    if cost <= 0 and not tokens_in and not tokens_out:
        return None
    from usage.services import owner_of, settle
    try:
        user = owner_of(project_pk)
    except Exception:  # noqa: BLE001
        logger.exception("chat turn owner lookup failed project=%s", project_pk)
        return None
    done = settle(
        user, "chat", Usage(cost, tokens_in, tokens_out), idempotency_key,
        succeeded=True, label="Night Eyes chat",
    )
    if done.refusal is not None:
        logger.warning("chat turn refused after the call project=%s: %s",
                       project_pk, done.refusal.code)
    if done.changed:
        try:
            from actions.domain_versions import bump_ai_usage
            bump_ai_usage(project_pk)
        except Exception:  # noqa: BLE001
            logger.exception("ai_usage version bump failed")
    return done.refusal.message if done.refusal is not None else None


def _project_scope(project_pk):
    """The scope every dispatch in this chat turn runs against. Tools also hang
    per-turn scratch lists on it (`_chat_proposals`, `_chat_invalidates`)."""
    from actions.capabilities.spec import ProjectScope
    return ProjectScope(project_pk)


def _touch_thread(project_pk, thread_id, page, message):
    """Load or start the chat thread for this turn. The thread id comes from
    the client, so a thread that exists in ANOTHER project is a 404: without
    this, a known thread id would resume that project's saved conversation
    (the LangGraph checkpoint is keyed by thread id alone)."""
    thread, created = ChatThread.objects.get_or_create(
        thread_id=thread_id,
        defaults={
            'project_id': project_pk,
            'page': page,
            'title': message[:80] if message else '',
        },
    )
    if thread.project_id != int(project_pk):
        raise Http404('thread not found')
    if not created:
        thread.save(update_fields=['last_message_at'])
    return thread


_EVENT_QUEUE_SENTINEL = object()


def _spawn_event_producer(chat, thread_id, message=None, resume=None, project_pk=None,
                          turn_id=None):
    """Run the agent's async stream in a worker thread; events flow back over
    a thread-safe queue so the sync SSE generator can yield them live as
    they're produced (no more "drain everything, then emit"). Returns the
    queue. The producer puts `_EVENT_QUEUE_SENTINEL` when it's done.

    The whole turn is ONE AI unit (`ai_engine/units.py`): every LLM call in
    it, chat tool calls included, adds to one meter and is settled once, under
    the unit's key. The unit is opened inside the producer, so the chat tools
    (LangChain runs them in threads that copy this context) join it instead of
    settling for themselves (SA-211).

    Settling runs in this worker thread AFTER the event loop has finished
    (plain sync code, so the ORM is safe): whether the turn succeeded, crashed
    (SA-217) or the author closed the tab mid-reply. Its outcome reaches the
    SSE generator as a synthetic `__settled__` event.

    The thread starts with an empty context, so it binds the turn's id
    (`turn_id`, or a new one) itself: logs, the usage row and LangSmith traces
    of the turn all carry it (`common/turns.py`)."""
    from ai_engine import units

    q: queue.Queue = queue.Queue()
    box: dict = {}

    async def _produce():
        try:
            with units.open_unit("chat") as unit:
                box["unit"] = unit
                async for event in chat.stream(message, thread_id, resume=resume):
                    q.put(event)
            # D31: staleness domains the turn's direct WRITE tools mutated,
            # accumulated on the shared session by the tool wrapper. Emit so the
            # acting tab's TanStack cache refetches — the chat path's fast-path
            # invalidation, mirroring the `__settled__` → project_meta hop below.
            sink = getattr(getattr(chat, "session", None), "_chat_invalidates", None)
            if sink:
                q.put({"event": "__invalidates__", "data": sorted(sink)})
            # Proposals the turn's propose-type tools created. Night Eyes no
            # longer interrupts the graph for these (so it stays in the loop and
            # summarises the edit) — instead the tool wrapper stashes the row
            # payload(s) here, and we surface them to the human as `proposal` SSE
            # events at end-of-turn, AFTER the assistant's confirmation text.
            psink = getattr(getattr(chat, "session", None), "_chat_proposals", None)
            if psink:
                q.put({"event": "__proposals__", "data": list(psink)})
                psink.clear()
        except Exception as exc:  # noqa: BLE001
            # Never show framework text (e.g. LangGraph's "Recursion limit of
            # 16 reached … set the recursion_limit config key") to the author:
            # log it, send a plain apology. SA-181.
            hit_limit = isinstance(exc, GraphRecursionError)
            if isinstance(exc, AINotConfiguredError):
                # No AI key on this server: say so plainly, no traceback.
                logger.warning("chat turn: AI not configured thread=%s: %s", thread_id, exc)
                text = AI_NOT_CONFIGURED_MESSAGE
            else:
                logger.exception("chat turn failed thread=%s", thread_id)
                text = _RECURSION_ERROR_TEXT if hit_limit else _GENERIC_ERROR_TEXT
            q.put({"event": "__error__", "data": text, "hit_limit": hit_limit})

    def _settle():
        unit = box.get("unit")
        if unit is None:
            return
        used = unit.usage()
        refused = _settle_chat_turn(
            project_pk, used.cost_usd, unit.key,
            tokens_in=used.tokens_in, tokens_out=used.tokens_out,
        )
        q.put({"event": "__settled__", "data": {"error": refused}})

    def _runner():
        with turn(turn_id):
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(_produce())
            except Exception:  # noqa: BLE001 — _produce reports its own errors
                logger.exception("chat producer crashed thread=%s", thread_id)
            finally:
                loop.close()
                try:
                    _settle()
                except Exception:  # noqa: BLE001 — settling never strands the stream
                    logger.exception("chat turn settle failed thread=%s", thread_id)
                finally:
                    q.put(_EVENT_QUEUE_SENTINEL)
                    from django.db import connections
                    connections.close_all()  # only this worker thread's connections

    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    return q


def _materialise_proposal(value, thread):
    """Load the Proposal row for an interrupt-value dict.

    The Proposal row was already created by `_commit_proposal` in dispatch.py
    — the interrupt value carries `proposal_id`. We just load and return it.
    Returns None if `value` isn't a proposal payload we recognise."""
    if not isinstance(value, dict) or value.get('kind') != 'proposal':
        return None

    existing_id = value.get('proposal_id')
    if existing_id is not None:
        try:
            return Proposal.objects.get(pk=existing_id)
        except Proposal.DoesNotExist:
            pass

    return None


def _format_tool_preview(output) -> str:
    """Trim a tool's raw output so we can ship a peek of it to the client as
    a thinking-step snippet without flooding the SSE channel. LangChain's
    `on_tool_end` typically hands us a `ToolMessage` whose `.content` is the
    actual return value — that's what the user wants to see, not the
    Pydantic repr."""
    if output is None:
        return ''
    # ToolMessage / BaseMessage and similar: prefer the .content field.
    content = getattr(output, 'content', None)
    if content is not None:
        output = content
    if isinstance(output, str):
        text = output
    else:
        try:
            text = json.dumps(output, default=str)
        except Exception:  # noqa: BLE001
            text = str(output)
    if len(text) > _TOOL_RESULT_PREVIEW_CHARS:
        return text[:_TOOL_RESULT_PREVIEW_CHARS] + '…'
    return text


def stream_chat_sse(
    chat, thread, thread_id, message=None, resume=None, invalidates=None,
    role=None, turn_id=None,
):
    """Generator of SSE strings for one chat turn (new HumanMessage OR a
    resume). Pushes events live as the agent produces them; persists each
    `__interrupt__` proposal inline before emitting its SSE so the client
    gets a real `proposal_id` to accept/reject against.

    `invalidates` (optional list of staleness domains) is emitted as an early
    SSE event for the proposal-accept path, so the frontend's TanStack bridge
    refetches the affected pages immediately — without waiting for the resume
    turn's tokens to drain. (D31)

    When `chat is None` (a button-source proposal accept — there's no thread
    to resume into), we emit `thread` + `invalidates` + `done` and skip the
    agent producer entirely.
    """
    yield _sse('thread', str(thread_id) if thread_id else '')

    if invalidates:
        yield _sse('invalidates', list(invalidates))

    if chat is None:
        # Thread-less accept — no agent turn to drain. Done.
        yield _sse('done', None)
        return

    project_pk = getattr(thread, 'project_id', None)
    # The producer settles the turn itself (one AI unit, one key).
    q = _spawn_event_producer(
        chat, thread_id, message=message, resume=resume, project_pk=project_pk,
        turn_id=turn_id,
    )

    saw_plan = False
    hit_limit = False

    while True:
        event = q.get()
        if event is _EVENT_QUEUE_SENTINEL:
            break

        kind = event.get('event')

        if kind == '__settled__':
            # The producer settled the turn; tell the navbar meter to refetch.
            refused = (event.get('data') or {}).get('error')
            yield _sse('invalidates', ['project_meta'])
            if refused:
                # The AI policy refused after the call: the LLM work is done,
                # so this ends the turn. Keep draining so already-saved
                # edits/proposals still reach the UI. The next turn is refused
                # by the pre-flight gate.
                yield _sse('error', refused)
            continue

        if kind == '__invalidates__':
            # Domains the turn's direct WRITE tools mutated — refetch the pages
            # that read them (D31). Frontend handler: NightEyes.tsx.
            domains = event.get('data') or []
            if domains:
                yield _sse('invalidates', list(domains))
            continue

        if kind == '__proposals__':
            # Proposal rows the turn's propose-type tools created (already on
            # disk — dispatch wrote them). Surface each as the same `proposal`
            # SSE event the three rendering surfaces consume; emitted after the
            # assistant's confirmation text so the card follows "I updated X".
            for entry in event.get('data') or []:
                row_id = entry.get('proposal_id')
                if row_id is None:
                    continue
                yield _sse('proposal', {
                    'proposal_id': row_id,
                    'capability': entry.get('capability'),
                    'args': entry.get('args'),
                    'proposal': entry.get('proposal'),
                })
            continue

        if kind == 'on_chat_model_stream':
            chunk = event['data']['chunk']
            if chunk.content:
                yield _sse('token', chunk.content)

        elif kind == 'on_tool_start':
            name = event.get('name', '')
            if name == 'plan_multi_step':
                saw_plan = True
            tool_input = (event.get('data') or {}).get('input') or {}
            yield _sse('tool_call', {'name': name, 'args': tool_input})

        elif kind == 'on_tool_end':
            name = event.get('name', '')
            output = (event.get('data') or {}).get('output')
            yield _sse('tool_result', {
                'name': name,
                'preview': _format_tool_preview(output),
            })

        elif kind == '__interrupt__':
            # Only `ask_user` pings interrupt the graph now — proposals surface
            # via the end-of-turn sink (`__proposals__`), so Night Eyes is never
            # paused for them. A ping is a clarifying question with no DB row;
            # the frontend answers via /ping-answer/ which resumes the graph
            # with the reply as the tool's return value.
            for value in event['data'].get('interrupts', []):
                if isinstance(value, dict) and value.get('kind') == 'ping':
                    yield _sse('ping', {
                        'question': value.get('question', ''),
                        'options': value.get('options', []) or [],
                    })

        elif kind == '__error__':
            if event.get('hit_limit'):
                hit_limit = True
            yield _sse('error', event.get('data') or _GENERIC_ERROR_TEXT)

    # Agentic-core routing state: remember what answered + whether the next
    # Auto turn should escalate (a plan started, or the turn hit the
    # recursion ceiling). Best-effort — never break the stream over it.
    if role and thread is not None:
        try:
            thread.last_role = role
            thread.escalate_next = bool(saw_plan or hit_limit)
            thread.save(update_fields=['last_role', 'escalate_next', 'last_message_at'])
        except Exception:  # noqa: BLE001
            pass
    yield _sse('done', {'tier': role_to_tier(role)} if role else None)


class ChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField()
    thread_id = serializers.UUIDField(required=False, allow_null=True)
    page = serializers.CharField(required=False, default='default')
    context = serializers.DictField(required=False, default={})
    tier = serializers.ChoiceField(
        choices=["auto", "quick", "standard", "deep"],
        required=False, default="auto",
    )


class ChatStreamView(APIView):
    throttle_classes = AI_THROTTLES  # every chat turn runs the AI

    def post(self, request, project_pk):
        owned_project_or_404(request, project_pk)
        ser = ChatRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        # Pre-flight AI policy gate (`usage/policy.py`) — refuses before the
        # stream starts, with the policy's code, message and status.
        from usage.services import gate
        refusal = gate(request.user, "chat")
        if refusal is not None:
            from rest_framework.response import Response
            return Response({"error": refusal.message, "code": refusal.code},
                            status=refusal.http_status)

        thread_id = data.get('thread_id') or uuid.uuid4()
        page = data['page']

        # One turn_id for the whole turn (common/turns.py): bound here for the
        # setup, then handed to the producer thread that runs the agent.
        with turn() as turn_id:
            session = _project_scope(project_pk)
            thread = _touch_thread(project_pk, thread_id, page, data['message'])

            role, _tier_reason = resolve_role(
                data["tier"], data["message"], page,
                last_role=thread.last_role or None,
                escalate_next=thread.escalate_next,
            )
            chat = ConsistencyChat(
                project_pk, session, page=page, context=data.get('context'),
                thread_id=thread_id, role=role,
            )

        response = StreamingHttpResponse(
            stream_chat_sse(chat, thread, thread_id, message=data['message'], role=role,
                            turn_id=turn_id),
            content_type='text/event-stream',
        )
        # Hint to reverse proxies / Django dev server: don't buffer this.
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class PingAnswerSerializer(serializers.Serializer):
    thread_id = serializers.UUIDField()
    answer = serializers.CharField()
    page = serializers.CharField(required=False, default='default')
    context = serializers.DictField(required=False, default={})


class PingAnswerView(APIView):
    """Resume a graph paused on an `ask_user` surface ping. The author's reply
    is fed back as the `interrupt()` return value (the tool's result), and the
    agent continues the turn — same resume mechanism as proposal accept, but
    the resume value is free text rather than `[PROPOSAL_ACCEPTED] …`."""

    throttle_classes = AI_THROTTLES  # resuming runs the AI

    def post(self, request, project_pk):
        owned_project_or_404(request, project_pk)
        ser = PingAnswerSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        thread_id = data['thread_id']
        page = data['page']
        with turn() as turn_id:
            session = _project_scope(project_pk)
            thread = _touch_thread(project_pk, thread_id, page, data['answer'])
            role = thread.last_role or "draft"
            chat = ConsistencyChat(
                project_pk, session, page=page, context=data.get('context'),
                thread_id=thread_id, role=role,
            )

        response = StreamingHttpResponse(
            stream_chat_sse(chat, thread, thread_id, resume=data['answer'], role=role,
                            turn_id=turn_id),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class ProposalError(Exception):
    """Raised when accept/reject can't proceed (wrong status, dispatch
    error). Carries an HTTP status hint for the view layer."""

    def __init__(self, message, http_status=400, payload=None):
        super().__init__(message)
        self.message = message
        self.http_status = http_status
        self.payload = payload or {}


def prepare_accept(project_pk, proposal_id, page=None, context=None):
    """Run the proposed capability, mark APPLIED, and return (proposal, chat,
    resume_value, invalidates) ready for `stream_chat_sse`. Raises
    ProposalError on bad state.

    Filters on `project_id` (not the thread) so button- and cron-source
    proposals — which have `thread_id=None` — can be accepted
    too. `chat`/`resume_value` are ALWAYS None now: Night Eyes treated the edit
    as done when it proposed (it never sees the propose/accept distinction), so
    accepting is a pure human-side action — run + apply + refetch, no agent
    resume turn. `stream_chat_sse` just emits `invalidates` + `done`."""
    proposal = Proposal.objects.get(
        pk=proposal_id, project_id=project_pk,
    )
    if proposal.status != Proposal.STATUS_PROPOSED:
        raise ProposalError(
            f'proposal is {proposal.status}, not PROPOSED',
            http_status=drf_status.HTTP_409_CONFLICT,
        )

    session = _project_scope(project_pk)

    from actions.capabilities import registry as cap_registry
    cap = cap_registry.get(proposal.capability)
    if cap is None or not cap.accept:
        raise ProposalError(
            f'capability {proposal.capability} has no accept path',
            http_status=drf_status.HTTP_400_BAD_REQUEST,
        )
    dispatch_name = cap.accept
    dispatch_args: dict = {'proposal_id': str(proposal.pk)}
    dispatch_actor = Actor.INTERNAL

    try:
        result = dispatch(
            dispatch_name, dispatch_args, dispatch_actor, session,
        )
    except Exception as exc:  # noqa: BLE001
        proposal.status = Proposal.STATUS_FAILED
        proposal.save(update_fields=['status', 'updated_at'])
        raise ProposalError(
            str(exc),
            http_status=drf_status.HTTP_400_BAD_REQUEST,
            payload={'capability': proposal.capability},
        ) from exc
    if result.status == 'error' and result.code in ('proposal_stale', 'proposal_not_pending'):
        # SA-209: nothing was written; the proposal stays open for the author.
        raise ProposalError(
            result.error or 'conflict', http_status=result.http_status or 409,
            payload={'capability': proposal.capability, 'code': result.code,
                     **(result.error_data or {})},
        )
    if result.status == 'error':
        proposal.status = Proposal.STATUS_FAILED
        proposal.save(update_fields=['status', 'updated_at'])
        raise ProposalError(
            result.error or 'capability error',
            http_status=result.http_status or drf_status.HTTP_400_BAD_REQUEST,
            payload={'capability': proposal.capability},
        )

    proposal.status = Proposal.STATUS_APPLIED
    proposal.save(update_fields=['status', 'updated_at'])

    # No agent resume turn (see docstring). D31 — still surface the staleness
    # domains the accept bumped so the SSE generator emits an early
    # `invalidates` event for the frontend's TanStack auto-refetch bridge.
    return proposal, None, None, list(result.invalidates or [])


def prepare_reject(project_pk, proposal_id, page=None, context=None):
    """Mark proposal REJECTED. Returns (proposal, None, None, []) for
    `stream_chat_sse`. Reject never mutates anything (invalidates is []) and,
    like accept, never resumes an agent turn — Night Eyes already treated the
    edit as done, so a rejection is a pure human-side action it isn't told
    about (it re-reads current state on its next turn, per its prompt rule)."""
    proposal = Proposal.objects.get(
        pk=proposal_id, project_id=project_pk,
    )
    if proposal.status != Proposal.STATUS_PROPOSED:
        raise ProposalError(
            f'proposal is {proposal.status}, not PROPOSED',
            http_status=drf_status.HTTP_409_CONFLICT,
        )
    proposal.status = Proposal.STATUS_REJECTED
    proposal.save(update_fields=['status', 'updated_at'])
    return proposal, None, None, []


# ---- Test helpers ------------------------------------------------------ #
# The live SSE stream uses a thread+queue producer (see `stream_chat_sse`).
# Tests want to drive a turn synchronously and assert on the raw event log;
# these helpers do that without spinning up an HTTP client.

def _drain_sync(chat, thread_id, message=None, resume=None):
    loop = asyncio.new_event_loop()

    async def _go():
        out = []
        async for ev in chat.stream(message, thread_id, resume=resume):
            out.append(ev)
        return out

    try:
        return loop.run_until_complete(_go())
    finally:
        loop.close()


def _materialise_all(events, thread):
    rows = []
    for event in events:
        if event.get('event') != '__interrupt__':
            continue
        for value in event['data'].get('interrupts', []):
            row = _materialise_proposal(value, thread)
            if row is not None:
                rows.append(row)
    return rows


def accept_proposal(project_pk, proposal_id, page=None, context=None):
    """Test-only: synchronous version of the accept flow. Returns
    (proposal, events, new_rows). For thread-less (button/cron)
    proposals there's no chat to drain — events stays empty."""
    proposal, chat, resume_value, _invalidates = prepare_accept(
        project_pk, proposal_id, page=page, context=context,
    )
    if chat is None or proposal.thread_id is None:
        return proposal, [], []
    events = _drain_sync(chat, proposal.thread_id, resume=resume_value)
    new_rows = _materialise_all(events, proposal.thread_id)
    return proposal, events, new_rows


def reject_proposal(project_pk, proposal_id, page=None, context=None):
    """Test-only: synchronous version of the reject flow."""
    proposal, chat, resume_value, _invalidates = prepare_reject(
        project_pk, proposal_id, page=page, context=context,
    )
    if chat is None or proposal.thread_id is None:
        return proposal, [], []
    events = _drain_sync(chat, proposal.thread_id, resume=resume_value)
    new_rows = _materialise_all(events, proposal.thread_id)
    return proposal, events, new_rows


def materialise_proposals(events, thread):
    """Test-only legacy name. Inline materialisation happens in the SSE
    generator now; this is the bulk version the smoke test uses to seed
    rows from a sync-drained event list."""
    return _materialise_all(events, thread)


class ThreadListView(APIView):
    def get(self, request, project_pk):
        owned_project_or_404(request, project_pk)
        threads = ChatThread.objects.filter(project_id=project_pk).values(
            'thread_id', 'title', 'page', 'last_message_at',
        )
        return JsonResponse({
            'threads': [
                {
                    'thread_id': str(t['thread_id']),
                    'title': t['title'] or 'New conversation',
                    'page': t['page'],
                    'last_message_at': t['last_message_at'].isoformat(),
                }
                for t in threads
            ],
        })


def _message_text(content) -> str:
    """Coerce a LangChain message `content` (str, or a provider's list of
    content blocks) into plain display text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get('type') == 'text':
                parts.append(block.get('text', ''))
        return ''.join(parts)
    return '' if content is None else str(content)


def _messages_to_turns(raw) -> list:
    """Group a thread's flat LangChain message list (Human / AI / Tool /
    System, in order) into the frontend's turn shape — one entry per user OR
    assistant turn, assistant turns carrying their tool steps as `events`. This
    mirrors how the live SSE stream builds a single assistant message that
    accumulates `tool_call` / `tool_result` events plus the final text.

    System messages (the injected [STALE] warnings) are internal and dropped.
    Proposals are intentionally NOT reconstructed here — pending ones rehydrate
    via the global proposal store; resolved ones aren't re-threaded into history.
    """
    turns: list = []
    asst: dict | None = None  # {'content': str, 'events': list}

    def flush():
        nonlocal asst
        if asst is not None and (asst['content'] or asst['events']):
            turns.append({
                'id': f'a-{len(turns)}',
                'role': 'assistant',
                'content': asst['content'],
                'status': 'complete',
                'events': asst['events'],
            })
        asst = None

    for m in raw or []:
        mtype = getattr(m, 'type', None)
        if mtype == 'human':
            flush()
            turns.append({
                'id': f'u-{len(turns)}',
                'role': 'user',
                'content': _message_text(getattr(m, 'content', '')),
                'status': 'complete',
                'events': [],
            })
        elif mtype == 'ai':
            if asst is None:
                asst = {'content': '', 'events': []}
            text = _message_text(getattr(m, 'content', ''))
            if text:
                asst['content'] = (
                    f"{asst['content']}\n\n{text}" if asst['content'] else text
                )
            for tc in (getattr(m, 'tool_calls', None) or []):
                asst['events'].append({
                    'kind': 'tool_call',
                    'data': {
                        'name': tc.get('name', ''),
                        'args': tc.get('args', {}) or {},
                    },
                })
        elif mtype == 'tool':
            if asst is None:
                asst = {'content': '', 'events': []}
            asst['events'].append({
                'kind': 'tool_result',
                'data': {
                    'name': getattr(m, 'name', '') or '',
                    'preview': _format_tool_preview(m),
                },
            })
        # 'system' and anything unrecognised: skip

    flush()
    return turns


def _load_thread_messages(thread_id) -> list:
    """Read a thread's persisted messages from the LangGraph checkpointer.
    Runs the async checkpoint read in a throwaway event loop (same bridge the
    test helpers use). Returns the raw LangChain message list, or [] if the
    thread has no checkpoint yet or the read fails (graceful — the conversation
    just opens empty and can be continued)."""
    loop = asyncio.new_event_loop()

    async def _go():
        async with open_checkpointer() as saver:
            config = {'configurable': {'thread_id': str(thread_id)}}
            tup = await saver.aget_tuple(config)
            if not tup or not tup.checkpoint:
                return []
            return tup.checkpoint.get('channel_values', {}).get('messages') or []

    try:
        return loop.run_until_complete(_go())
    except Exception:  # noqa: BLE001
        logger.exception('failed to load checkpoint for thread %s', thread_id)
        return []
    finally:
        loop.close()


class ThreadMessagesView(APIView):
    """GET /projects/<pk>/threads/<thread_id>/messages/ — the full transcript
    of one past conversation, shaped for the frontend chat store so picking a
    thread from the history drawer reloads it into the panel."""

    def get(self, request, project_pk, thread_id):
        owned_project_or_404(request, project_pk)
        thread = get_object_or_404(
            ChatThread, thread_id=thread_id, project_id=project_pk,
        )
        raw = _load_thread_messages(thread_id)
        return JsonResponse({
            'thread_id': str(thread_id),
            'title': thread.title,
            'page': thread.page,
            'messages': _messages_to_turns(raw),
        })


def _canonical_proposal_payload(capability: str, payload: dict) -> dict:
    """Return the stored proposal payload with its meta `patch` canonicalised,
    so rows created before field-folding shipped (legacy singular genre/theme,
    free-text choice labels) still rehydrate into the shape the World form
    renders and highlights. Idempotent for fresh rows."""
    if capability != "update_project_meta" or not isinstance(payload, dict):
        return payload
    preview = payload.get("preview")
    if not isinstance(preview, dict) or not isinstance(preview.get("patch"), dict):
        return payload
    out = dict(payload)
    out["preview"] = {**preview, "patch": canonicalize_meta_patch(preview["patch"])}
    return out


class PendingProposalsView(APIView):
    """GET — list every Proposal row with status=PROPOSED for this project.
    Mirrors the shape of the SSE `proposal` event so the frontend's
    rehydration path can seed `useProposalStore` with the same payload it
    handles for live proposals. Per NIGHT_EYES.md § "Proposals and surface
    pings — UI coexistence" — proposals survive across reload because they
    live in the DB; this endpoint is how the frontend rediscovers them on
    mount."""

    def get(self, request, project_pk):
        owned_project_or_404(request, project_pk)
        rows = (
            Proposal.objects
            .filter(project_id=project_pk, status=Proposal.STATUS_PROPOSED)
            .order_by('-created_at')
            .values(
                'id', 'capability', 'args', 'proposal',
                'page', 'source', 'created_at',
            )
        )
        return JsonResponse({
            'proposals': [
                {
                    'proposal_id': r['id'],
                    'capability': r['capability'],
                    'args': r['args'] or {},
                    'proposal': _canonical_proposal_payload(
                        r['capability'], r['proposal'] or {}),
                    'page': r['page'] or '',
                    'source': r['source'],
                    'created_at': r['created_at'].isoformat(),
                }
                for r in rows
            ],
        })


class FrameView(APIView):
    def get(self, request, project_pk):
        owned_project_or_404(request, project_pk)
        page = request.query_params.get('page', 'default')
        frame = get_frame(page)

        def annotate(names):
            return [{'name': n, 'type': _op_type(n)} for n in names]

        return JsonResponse({
            'page': page,
            'reads': annotate(frame.get('reads', [])),
            'actions': annotate(frame.get('actions', [])),
            'secondary': annotate(frame.get('secondary', [])),
            'context_params': frame.get('context_params', []),
            'quick_actions': frame.get('quick_actions', []),
            'prompt': frame['prompt'],
            'suffixes': frame.get('suffixes', {}),
            'hints': frame.get('hints', {}),
        })
