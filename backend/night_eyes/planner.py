from langchain_core.tools import tool
from langgraph.types import interrupt


@tool
def ask_user(question: str, options: str = "") -> str:
    """Ask the author a short clarifying question and WAIT for their answer
    before continuing. Use this only when you need a decision that's the
    author's to make and that you cannot safely guess (which of two
    directions, a yes/no that changes what you'd do next). Prefer reading the
    existing story data over asking. Do not use this for chit-chat.

    NEVER ask the author to describe, explain, or draft something for you —
    imagine what fits this story yourself and turn it into options. ALWAYS pass
    `options`: 2-4 concrete choices YOU have drafted, which the author taps
    instead of typing (e.g. "Third-person, First-person, Omniscient", or three
    drafted loglines). Only leave `options` empty for a value they must invent
    freeform (a proper name).

    Args:
        question: The question for the author. One sentence.
        options: Comma-separated quick-pick choices (2-4) that YOU drafted.
            Strongly encouraged; omit only for a truly freeform answer.
    """
    opts = [o.strip() for o in (options or "").split(",") if o.strip()]
    # Pauses the graph exactly like a proposal does. The stream view turns the
    # `kind: "ping"` interrupt into an SSE `ping` event; the ping-answer
    # endpoint resumes with the author's reply as this call's return value.
    answer = interrupt({"kind": "ping", "question": question, "options": opts})
    return f"The author answered: {answer}"


@tool
def plan_multi_step(intent: str, steps: str) -> str:
    """Use this when the user's request requires multiple operations in sequence.
    Break the intent into ordered steps, then execute each one.

    Args:
        intent: What the user wants to accomplish overall
        steps: Comma-separated list of operations to execute in order
    """
    return (
        f"Planning: {intent}\n"
        f"Steps: {steps}\n"
        "Execute each step in order, confirming with the user between write operations."
    )
