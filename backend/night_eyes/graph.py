from ai_engine.llm_utils import create_llm
from asgiref.sync import sync_to_async
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.prebuilt import create_react_agent
from langgraph.types import Command

from .checkpointer import open_checkpointer
from .planner import ask_user, plan_multi_step
from .prompts import build_system_prompt


def graph_step_limit(profile_limit):
    """LangGraph `recursion_limit` for a profile's `recursion_limit`.

    The profile numbers were tuned for a graph where one tool call costs 2
    steps (agent → tools). The compaction `pre_model_hook` adds a third step
    per call, which silently cut every budget by a third (expert 16 → only 4
    tool calls; SA-181). Scaling by 1.5 gives back the same number of tool
    calls the profile was tuned for (small 3, draft 5, expert 7)."""
    return profile_limit + profile_limit // 2


def _stale_warning(thread_id, session):
    """Compare the chat thread's read_baseline against the project's current
    domain versions (`actions.domain_versions`); produce a single
    SystemMessage warning line if any baseline domain has drifted. Returns None
    if nothing to warn about. `session` is the turn's ProjectScope."""
    if not thread_id:
        return None
    from night_eyes.models import ChatThread
    try:
        thread = ChatThread.objects.get(thread_id=thread_id)
    except ChatThread.DoesNotExist:
        return None
    baseline = thread.read_baseline or {}
    if not baseline:
        return None
    from actions.domain_versions import versions_for
    project_id = getattr(session, "project_id", None) or thread.project_id
    current = versions_for(project_id)
    stale = [
        domain for domain, seen in baseline.items()
        if current.get(domain, "") and current[domain] != seen
    ]
    if not stale:
        return None
    domains = ", ".join(sorted(stale))
    return (
        f"[STALE] {domains} — these domains have changed since you last "
        "read them. Re-read before relying on prior tool results."
    )


def _dangling_tool_calls(messages):
    """tool_calls on AIMessages that never got a matching ToolMessage.

    Since 2026-06-10 chat proposals no longer `interrupt()` (the propose tool
    returns a plain success result so Night Eyes stays in the loop and confirms
    the edit), so a proposal never strands a tool_call. The remaining source is
    an **abandoned `ask_user` ping**: the graph paused on the ping's interrupt
    and the author moved on without answering, leaving its tool_call with no
    ToolMessage. Left unhealed, the next fresh turn would hand the model an
    unmatched tool_call → INVALID_CHAT_HISTORY. (`_proposal_outcome` still tags
    any healed call by the latest Proposal row for that capability — a harmless
    `[SUPERSEDED]` no-op for a ping.)
    """
    answered = {
        m.tool_call_id for m in messages
        if isinstance(m, ToolMessage) and getattr(m, "tool_call_id", None)
    }
    dangling = []
    for m in messages:
        if isinstance(m, AIMessage):
            for tc in (m.tool_calls or []):
                tc_id = tc.get("id")
                if tc_id and tc_id not in answered:
                    dangling.append(tc)
    return dangling


def _proposal_outcome(thread_id, capability):
    """Resume marker describing what the author did with the proposal whose
    interrupt left this tool_call dangling. The dangling call IS that
    proposal's interrupt, so the most recent Proposal row for (thread,
    capability) carries the outcome. Reuses the `[PROPOSAL_ACCEPTED]` /
    `[PROPOSAL_REJECTED]` markers the prompt already knows how to read."""
    from actions.models import Proposal

    row = (
        Proposal.objects
        .filter(thread_id=thread_id, capability=capability)
        .order_by("-created_at")
        .first()
    )
    if row is None:
        return (
            f"[SUPERSEDED] {capability} — the author moved on without "
            "answering. Treat it as unresolved and address their new message."
        )
    if row.status == Proposal.STATUS_APPLIED:
        return (
            f"[PROPOSAL_ACCEPTED] {capability} — the author accepted it; "
            "it is applied."
        )
    if row.status == Proposal.STATUS_REJECTED:
        return f"[PROPOSAL_REJECTED] {capability} — the author declined."
    if row.status == Proposal.STATUS_FAILED:
        return f"[ERROR] {capability} — applying the proposal failed."
    # STATUS_PROPOSED — still sitting in the author's tray, undecided.
    return (
        f"[PROPOSAL_PENDING] {capability} — still waiting in the author's "
        "proposal tray; do NOT re-issue it. Continue with their new message."
    )


def _heal_messages(messages, thread_id):
    """One synthetic ToolMessage per dangling tool_call, so the next LLM call
    sees a valid history. Returns [] when nothing is dangling (the common
    case — a normal turn with no pending proposal)."""
    dangling = _dangling_tool_calls(messages)
    if not dangling:
        return []
    return [
        ToolMessage(
            content=_proposal_outcome(thread_id, tc.get("name", "")),
            tool_call_id=tc["id"],
        )
        for tc in dangling
    ]


class ConsistencyChat:
    """Per-request agent. Tools + prompt rebuild every call from the current
    page's frame; thread state (messages, tool calls) is loaded by the
    PostgresSaver against `thread_id`. New machine, same memory."""

    def __init__(self, project_id, session, page='default', context=None,
                 thread_id=None, role='draft'):
        self.project_id = project_id
        self.session = session
        self.page = page
        # Enrich the hidden context with server-derived blocks (today: the active
        # scene's saved prose, resolved from context['scene_id']) before it feeds
        # the system prompt below. No-op off the write page / without a scene_id.
        from .context_blocks import enrich_context
        context = enrich_context(context, session)
        self.context = context
        self.thread_id = thread_id

        from ai_engine.config import get_ai_config
        self.role = role
        self.profile = get_ai_config().get_profile_for_role(role)

        # Two-tier binding (agentic core): pre-bind the budget-ranked `bound`
        # capabilities for this page; everything else chat-callable stays
        # reachable through find_tools, which loads names into graph state.
        # The ToolNode gets the FULL wrapper list so anything loaded executes;
        # the dynamic model callable (stream()) controls what the LLM sees.
        # History: CHAT_TOOL_EXPOSURE_AUDIT.md (frame-gate → bind-all → this).
        from .ranking import chat_capabilities, rank_bound_tools
        from .toolbox import make_find_tools
        from .tools import build_tools_from_caps

        bound_caps = rank_bound_tools(page, self.profile["tool_budget"])
        bound_ai_names = {c.ai_name for c in bound_caps}
        find_tools = make_find_tools(bound_ai_names)

        self.bound_tools = build_tools_from_caps(
            bound_caps, project_id, session, thread_id=thread_id, page=page,
        ) + [plan_multi_step, ask_user, find_tools]

        all_caps = chat_capabilities()
        self.all_tools = build_tools_from_caps(
            all_caps, project_id, session, thread_id=thread_id, page=page,
        ) + [plan_multi_step, ask_user, find_tools]

        bound_names = [t.name for t in self.bound_tools]
        self.tools = self.all_tools  # executor set (back-compat attribute)

        self.system_prompt = build_system_prompt(
            page, context, bound_names, variant=self.profile["prompt"],
        )

        self.llm = create_llm(
            role,
            temperature=0,
            # Emit token usage on the streamed response so the usage meter can
            # count conversational tokens (OpenAI omits usage from streams
            # unless this is set; dropped on Anthropic, which always reports
            # usage). See ai_engine/usage_meter.py.
            stream_usage=True,
            # D28: no parallel tool calls in Phase 2. Two write tools firing
            # in one step would each raise interrupt() and leave the message
            # history with unmatched tool_calls. Stricter than D28 wants
            # (it also kills parallel reads) — fine for now; Step 4 can
            # refine if parallel reads turn out to matter. (OpenAI-only
            # model_kwarg — create_llm drops it on Anthropic.)
            model_kwargs={"parallel_tool_calls": False},
        )

    async def stream(self, message, thread_id, resume=None):
        """Stream a turn. If `resume` is provided, the graph picks up from
        the last `interrupt()` call (proposal accept/reject path). Otherwise
        a new HumanMessage is appended and the agent runs from scratch."""
        prompt = ChatPromptTemplate.from_messages([
            ("system", self.system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ])

        async with open_checkpointer() as checkpointer:
            from .compaction import make_pre_model_hook
            from .toolbox import NightEyesState, merge_tool_lists

            def _select_model(state, runtime=None):
                loaded = set(state.get("loaded_tools") or [])
                return self.llm.bind_tools(
                    merge_tool_lists(self.bound_tools, self.all_tools, loaded),
                )

            graph = create_react_agent(
                _select_model, self.all_tools, prompt=prompt,
                state_schema=NightEyesState,
                pre_model_hook=make_pre_model_hook(self.profile["compact_after"]),
                checkpointer=checkpointer,
            )
            config = {
                "configurable": {"thread_id": str(thread_id)},
                # Per-profile: small models get a tighter leash, expert more
                # headroom. See the 2026-05-27 "save_scene_content" incident
                # for why this stays well under the default 25.
                "recursion_limit": graph_step_limit(self.profile["recursion_limit"]),
            }
            if resume is not None:
                graph_input = Command(resume=resume)
            else:
                # A prior chat-source proposal may have paused this graph on an
                # interrupt() whose tool_call never got its ToolMessage (the
                # live accept/reject path resolves the row via the capability
                # facade, not by resuming here). Satisfy any such dangling call
                # BEFORE this fresh turn, or the model rejects the history with
                # INVALID_CHAT_HISTORY. No-op when nothing is dangling.
                await self._heal_orphaned_interrupt(
                    graph, config, self.thread_id or thread_id,
                )
                # D31: prepend a [STALE] system message if any baseline
                # domain has drifted since the thread's last read. Skipped on
                # resume because the agent is mid-tool, not at a fresh turn.
                inputs = []
                warning = await sync_to_async(_stale_warning)(
                    self.thread_id or thread_id, self.session,
                )
                if warning:
                    inputs.append(SystemMessage(content=warning))
                inputs.append(HumanMessage(content=message))
                graph_input = {"messages": inputs}
            async for event in graph.astream_events(
                graph_input,
                config=config,
                version="v2",
            ):
                yield event

            # After the stream drains, check for a pending interrupt — the
            # tool wrapper calls interrupt() when a write needs the user's
            # confirmation. Surface it as a synthetic event the view turns
            # into an SSE `proposal`.
            state = await graph.aget_state(config)
            interrupts = []
            for task in state.tasks:
                interrupts.extend(task.interrupts)
            if interrupts:
                yield {
                    "event": "__interrupt__",
                    "data": {"interrupts": [iv.value for iv in interrupts]},
                }

    async def _heal_orphaned_interrupt(self, graph, config, thread_id):
        """Close any tool_call left dangling by a prior proposal interrupt by
        writing a synthetic ToolMessage for it. The update also clears the
        stale pending interrupt, so the new turn starts from a clean state.
        Best-effort: a state-read/update failure must never block a fresh turn,
        so the worst case is the pre-existing error rather than a new one."""
        try:
            state = await graph.aget_state(config)
        except Exception:  # noqa: BLE001
            return
        messages = (getattr(state, "values", None) or {}).get("messages") or []
        healed = await sync_to_async(_heal_messages)(messages, thread_id)
        if healed:
            await graph.aupdate_state(config, {"messages": healed})
