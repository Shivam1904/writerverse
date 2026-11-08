"""Count-based conversation compaction (agentic core).

Wired as create_react_agent's `pre_model_hook`: when the thread exceeds the
profile's `compact_after`, everything but the last KEEP_LAST messages is
condensed into ONE summary SystemMessage by the `small` role, destructively
(RemoveMessage(REMOVE_ALL_MESSAGES)) — one summarize call per threshold
crossing, persisted by the checkpointer. Count-based only; token counting is
a later refinement. The tail boundary walks back so an AIMessage/ToolMessage
pair is never split (a tail starting with a ToolMessage would poison the
history — INVALID_CHAT_HISTORY).
"""
from langchain_core.messages import RemoveMessage, SystemMessage, ToolMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES

KEEP_LAST = 8


def default_summarize(messages):
    """LLM summarize (small role). Billable like any chat turn — never called
    from offline tests (they inject a fake)."""
    from ai_engine.llm_utils import create_llm

    lines = []
    for m in messages:
        content = m.content if isinstance(m.content, str) else str(m.content)
        lines.append(f"{getattr(m, 'type', 'msg')}: {content[:400]}")
    prompt = (
        "Condense this story-assistant conversation into a factual summary "
        "the assistant can rely on later. Keep: decisions made, entities "
        "touched (names + ids), edits already applied, open asks. "
        "Max ~200 words.\n\n" + "\n".join(lines)
    )
    return create_llm("small").invoke(prompt).content


def make_pre_model_hook(compact_after, summarize=default_summarize):
    def hook(state):
        msgs = list(state.get("messages") or [])
        if not compact_after or compact_after <= 0 or len(msgs) <= compact_after:
            return {}
        old, tail = msgs[:-KEEP_LAST], msgs[-KEEP_LAST:]
        # Never let the tail open on a ToolMessage — pull its AIMessage
        # (and anything between) out of `old` into the tail.
        while tail and isinstance(tail[0], ToolMessage) and old:
            tail.insert(0, old.pop())
        if not old:
            return {}
        summary = summarize(old)
        return {
            "messages": [
                RemoveMessage(id=REMOVE_ALL_MESSAGES),
                SystemMessage(
                    content=f"[SUMMARY of the earlier conversation]\n{summary}",
                ),
                *tail,
            ],
        }

    return hook
