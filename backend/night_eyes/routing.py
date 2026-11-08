"""Per-turn model-tier resolution — the Auto heuristics (agentic core).

Pure, deterministic, no Django/LLM imports: unit-tested exhaustively in
tests.py. The request carries a user-facing `tier`; this maps it to a D3
role (providers.yml). `auto` applies the rules below, first match wins.
Constants are deliberately tunable — adjust here, tests pin the contract.
"""

# user-facing tier → providers.yml role
TIER_TO_ROLE = {"quick": "small", "standard": "draft", "deep": "expert"}
_ROLE_TO_TIER = {v: k for k, v in TIER_TO_ROLE.items()}

# Rule 2 — generative/structural asks warrant the strongest model.
GENERATIVE_MARKERS = (
    "generate", "merge", "analyse", "analyze", "rewrite", "restructure",
    "brainstorm", "plan ",
    "draft a", "draft the",  # bare "draft" is usually a noun here (the author's draft)
    "flesh out", "fill in", "weave",
)
# Rule 3 — short lookups are fine on the cheap model.
READ_STARTS = (
    "who", "what", "when", "where", "which", "list", "how many",
)
# Rule 4 — pages whose asks skew analytical/structural.
HEAVY_PAGES = {"lenses", "charts-view", "plot-threads"}

LONG_MESSAGE_CHARS = 600
SHORT_READ_CHARS = 120


def role_to_tier(role: str) -> str:
    """Inverse mapping for the SSE `done` payload ('small' → 'quick')."""
    return _ROLE_TO_TIER.get(role, "standard")


def resolve_role(tier, message, page, last_role=None, escalate_next=False):
    """Resolve the model role for this turn. Returns (role, reason).

    `tier` other than 'auto' is a manual pin. Auto rules, first match wins:
      1. escalate_next (last turn hit the recursion limit or started a
         multi-step plan) → expert.
      2. long message (also covers folded selection quotes) or a
         generative/structural marker → expert.
      3. short read-shaped question → small.
      4. heavy analysis pages → expert; otherwise draft.
    `last_role` is accepted for future stickiness rules; resume paths reuse
    it directly (stream.py) rather than through here.
    """
    if tier in TIER_TO_ROLE:
        return TIER_TO_ROLE[tier], f"pinned:{tier}"
    msg = (message or "").strip().lower()
    if escalate_next:
        return "expert", "escalated"
    if len(msg) > LONG_MESSAGE_CHARS:
        return "expert", "long-input"
    if any(m in msg for m in GENERATIVE_MARKERS):
        return "expert", "generative-ask"
    if len(msg) < SHORT_READ_CHARS and msg.startswith(READ_STARTS):
        return "small", "quick-read"
    if page in HEAVY_PAGES:
        return "expert", "heavy-page"
    return "draft", "default"
