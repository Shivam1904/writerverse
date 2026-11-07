"""Capability contract for the ConsistencyLab tool registry.

Deliberately tiny and dependency-light: enums + two dataclasses. This module does
no DB or LLM work itself — a capability's layer callables do that, given a
DispatchContext. Keeping the contract here means the registry, the dispatcher,
the prompt renderer and the chat all agree on one shape.

Each capability has a `route` (READ | WRITE | PROPOSE) and optional
`gather`/`execute`/`commit` layer callbacks.
"""
from __future__ import annotations

import enum
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


class Actor(enum.Enum):
    """Who is invoking a capability."""

    USER_BUTTON = "user_button"  # explicit click in the UI — the click is intent
    CHAT = "chat"                # the AI assistant
    INTERNAL = "internal"        # app hook, e.g. on-save
    CRON = "cron"                # scheduled job


class Route(enum.Enum):
    """The single decision axis for a capability."""

    READ = "read"        # returns data, no side effects
    WRITE = "write"      # commits to the DB
    PROPOSE = "propose"  # commits a Proposal row, stops


class ProposeWhen(enum.Enum):
    """For Route.PROPOSE capabilities: which actors get a human-in-loop
    proposal card vs. an immediate, auto-applied write.

    Only consulted when `route is Route.PROPOSE`; ignored for READ/WRITE.
    """

    ALWAYS = "always"    # every actor sees a proposal (default — current behaviour)
    AI_ONLY = "ai_only"  # only the AI (Actor.CHAT) proposes; other actors
    #                      (button/cron) auto-apply — the click/trigger is the
    #                      intent, so the accept capability runs immediately.


class CapabilityError(Exception):
    """A capability's expected, user-facing failure (bad inputs, upstream error).

    Carries an HTTP status hint so a thin view can map it back to the exact
    Response the legacy view returned. Unexpected exceptions are NOT this — they
    propagate so they surface as real 500s with a correlation id."""

    def __init__(
        self,
        message: str,
        status: int = 400,
        *,
        code: str | None = None,
        data: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.status = status
        # Optional machine-readable code + extra body fields for the client,
        # e.g. code="proposal_stale", data={"conflicts": [...]}.
        self.code = code
        self.data = data


class ProjectScope:
    """What a dispatch runs against: one project.

    Callers build one per request (`ProjectScope(project.id)`) and pass it to
    `dispatch()`. Night Eyes also hangs per-turn scratch lists on it
    (`_chat_proposals`, `_chat_invalidates`), so it is a plain mutable object.
    """

    def __init__(self, project_id: int | None):
        self.project_id = project_id

    def __repr__(self) -> str:
        return f"ProjectScope(project_id={self.project_id})"


@dataclass
class DispatchContext:
    """Everything a capability needs at run time, with no HTTP coupling."""

    actor: Actor = Actor.USER_BUTTON
    project_id: int | None = None
    # Chat context — set when dispatch is called from a chat turn.
    # Used by Route.PROPOSE to write the Proposal row with the right thread/page.
    thread_id: Any = None
    page: str = ""
    # The scope this dispatch runs against — needed by generic accept/reject
    # to call dispatch() for nested capabilities. Not used by leaf capabilities.
    scope: Any = None


GatherFn = Callable[["DispatchContext", dict[str, Any]], dict[str, Any]]
ExecuteFn = Callable[["DispatchContext", dict[str, Any]], dict[str, Any]]
CommitFn = Callable[["DispatchContext", dict[str, Any]], None]
PreviewFn = Callable[[dict[str, Any]], dict[str, Any]]
# (ctx, preview, args) -> {field_key: {"current": <value now>, "proposed": <AI value>}}
# for every field the proposal would overwrite. See capabilities/stamps.py.
StampFn = Callable[["DispatchContext", dict[str, Any], dict[str, Any]], dict[str, dict[str, Any]]]


@dataclass(frozen=True)
class Capability:
    """One registry entry — route + gather/execute/commit layers."""

    name: str
    description: str          # shown to the AI / used as the tool docstring
    args: dict[str, str] = field(default_factory=dict)

    route: Route = Route.READ
    gather: GatherFn | None = None     # (ctx, args) -> gathered dict
    execute: ExecuteFn | None = None   # (ctx, gathered) -> result dict
    commit: CommitFn | None = None     # (ctx, result) -> None

    # PROPOSE route: link to the accept capability + preview formatter.
    accept: str | None = None
    preview: PreviewFn | None = None
    # PROPOSE route: reads the CURRENT value of every field the proposal would
    # overwrite. Called when the proposal is made (stamped on Proposal.base) and
    # again on accept — a mismatch means the author changed it since, and the
    # accept returns a conflict instead of clobbering (SA-209). Additive kinds
    # (inserts/creates) use `stamps.additive`. Required when `accept` is set.
    stamp: StampFn | None = None

    # PROPOSE route only: do all actors get a proposal, or only the AI?
    # AI_ONLY means a non-chat actor (button/cron) auto-applies via `accept`
    # instead of leaving a pending Proposal row. Ignored for READ/WRITE.
    propose_when: ProposeWhen = ProposeWhen.ALWAYS

    # True only when execute calls an AI model. dispatch() asks the AI policy
    # (`usage/policy.py`) BEFORE running these and may be refused (402);
    # everything else — saves, edits, reads — is never gated. `cost` is only a label.
    # dispatch() logs (error in dev/tests, warning in prod) when a capability
    # with uses_ai=False spends LLM tokens itself.
    uses_ai: bool = False
    # What the author sees for this AI work in usage lists, e.g. "Tagged an idea".
    # Required when uses_ai (a test checks); never shown to the AI.
    label: str = ""
    pages: tuple[str, ...] = ()
    actors: tuple[Actor, ...] = (
        Actor.USER_BUTTON,
        Actor.CHAT,
        Actor.INTERNAL,
        Actor.CRON,
    )
    tool_name: str = ""

    # Chat exposure tier: "bound" tools are pre-bindable into the agent's tool
    # list (budget-ranked per turn); "toolbox" tools are chat-callable ONLY
    # after the agent loads them via find_tools. Only meaningful when
    # Actor.CHAT is in `actors`; ignored otherwise.
    chat_exposure: str = "bound"

    # True for a placeholder that does no real work yet. A stub must never be
    # reachable by Actor.CHAT: the AI would spend steps (the author pays) on a
    # tool that returns nothing (SA-222). register() enforces this.
    stub: bool = False

    @property
    def ai_name(self) -> str:
        """The name the AI sees as a tool. Falls back to `name`."""
        return self.tool_name or self.name

    def schema(self) -> dict[str, Any]:
        """The shape the AI / UI sees — name, description, args, flags."""
        return {
            "name": self.ai_name,
            "route": self.route.value,
            "description": self.description,
            "args": dict(self.args),
        }
