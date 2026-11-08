"""find_tools — the discovery hatch (tier 2 of budget-adaptive binding).

The pre-bound tool list is the budget-ranked `bound` subset (ranking.py).
Everything else chat may touch — bound tools cut by a small budget AND the
`toolbox` exposure tier — is reachable by loading it here first. Loaded
names live in graph state (`loaded_tools`), so the checkpointer persists
them for the rest of the thread; the dynamic model callable binds them on
the next cycle as real, schema-validated tools.
"""
import operator
from typing import Annotated

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph.types import Command

MAX_HITS = 8

# Common short words that would otherwise "match" almost every description
# (e.g. "the" is a substring of "theme", a token in half the descriptions) and
# swamp genuinely unrelated queries with false-positive hits. Kept tiny and
# generic — this is a keyword filter, not an NLP pass.
_STOP_WORDS = frozenset({
    "the", "and", "for", "are", "you", "your", "with", "from", "into", "this",
    "that", "one", "pass", "get", "not", "can", "its",
})


class NightEyesState(AgentState):
    # find_tools appends names; operator.add merges updates. Dupes are fine —
    # merge_tool_lists dedupes by tool name.
    loaded_tools: Annotated[list, operator.add]


def _score(cap, words):
    name_tokens = set(cap.ai_name.lower().split("_"))
    desc_tokens = set((cap.description or "").lower().replace("`", " ").split())
    s = 0
    for w in words:
        if w in name_tokens:
            s += 3
        if w in desc_tokens:
            s += 1
    return s


def search_toolbox(query, bound_ai_names):
    """Keyword search over every chat-callable capability not already bound
    this turn. Returns (hits, message_text) — hits capped at MAX_HITS,
    deterministic order (score desc, then name)."""
    from .ranking import chat_capabilities

    words = [
        w for w in (query or "").lower().split()
        if len(w) > 2 and w not in _STOP_WORDS
    ]
    pool = [c for c in chat_capabilities() if c.ai_name not in bound_ai_names]
    scored = sorted(
        ((_score(c, words), c) for c in pool),
        key=lambda t: (-t[0], t[1].ai_name),
    )
    hits = [c for s, c in scored if s > 0][:MAX_HITS]
    if not hits:
        return [], (
            "No matching tool exists for that. Tell the author plainly this "
            "isn't something you can do — do not improvise with other tools."
        )
    lines = [f"- {c.ai_name}: {c.description}" for c in hits]
    return hits, (
        "Loaded these tools — from your next step you can call them directly, "
        "for the rest of this conversation:\n" + "\n".join(lines)
    )


def make_find_tools(bound_ai_names):
    """Build the find_tools graph tool for this turn's bound set."""

    @tool
    def find_tools(
        query: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> Command:
        """Search for extra abilities beyond your current tools and LOAD the
        matches so you can call them. Use when the author asks for something
        none of your current tools cover — e.g. draft a plot thread from a
        description, merge a thread into the outline, place a thread beat
        into a scene, browse lenses, shape a new lens. Pass a few words
        naming the ability you need. If it reports no match, the ability
        does not exist — say so plainly instead of improvising."""
        hits, text = search_toolbox(query, bound_ai_names)
        update = {"messages": [ToolMessage(text, tool_call_id=tool_call_id)]}
        if hits:
            update["loaded_tools"] = [c.ai_name for c in hits]
        return Command(update=update)

    return find_tools


def merge_tool_lists(bound_tools, all_tools, loaded):
    """The tool list the model sees this cycle: the pre-bound set + any
    state-loaded extras, deduped by name, stable order."""
    seen = {t.name for t in bound_tools}
    extras = [t for t in all_tools if t.name in loaded and t.name not in seen]
    return list(bound_tools) + extras
