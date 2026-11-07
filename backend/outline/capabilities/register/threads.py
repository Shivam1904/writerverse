"""Capability registrations — threads page (new-style)."""
from actions.capabilities.commit._proposals import guarded_accept
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route
from actions.capabilities.stamps import additive, stamp_user_wishes

from outline.capabilities.commit.threads import (
    commit_generate_thread,
    commit_user_wishes_rough,
)
from outline.capabilities.execute.threads import (
    execute_generate_thread,
    execute_generate_thread_from_description,
    execute_user_wishes_rough,
)
from outline.capabilities.gather.threads import (
    gather_generate_thread,
    gather_generate_thread_from_description,
    gather_user_wishes_rough,
)

# ---- generate_thread ------------------------------------------------------ #

register(Capability(
    name="generate_thread",
    label="Drafted a plot thread from ideas",
    uses_ai=True,
    description="Generate a plot thread from writer-selected braindumps.",
    route=Route.PROPOSE,
    args={
        "braindumps": "list",
        "all_braindumps": "list",
        # Optional scope to attach to the generated thread (e.g. a character-page
        # "smart thread" passes scope_type="character" + the character's name).
        # Falls back to whole-story scope when omitted.
        "scope_type": "string?",
        "scope_name": "string?",
    },
    gather=gather_generate_thread,
    execute=execute_generate_thread,
    accept="_accept_generate_thread",
    stamp=additive,  # appends a new thread
    pages=("Threads",),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON),
))

register(Capability(
    name="_accept_generate_thread",
    description="Accept a generate-thread proposal.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_generate_thread),
    pages=("Threads",),
    actors=(Actor.INTERNAL,),
))


# Sibling of generate_thread that drafts a thread from a plain-text DESCRIPTION
# (e.g. the story summary accepted from run_init_elements) instead of hand-picked
# braindumps. Dispatched as a follow-up when the story slice is accepted
# (commit_init_elements + run_followups) AND chat-reachable via the find_tools
# toolbox (agentic core).
# Reuses _accept_generate_thread — accepting it appends the same plot_thread to
# discovery.rough_outlines as the braindump-based generator does.
register(Capability(
    name="generate_thread_from_description",
    label="Drafted a plot thread",
    uses_ai=True,
    tool_name="quick_add_thread",
    description="AI-draft a plot thread from a plain-language description.",
    route=Route.PROPOSE,
    args={"description": "string"},
    gather=gather_generate_thread_from_description,
    execute=execute_generate_thread_from_description,
    accept="_accept_generate_thread",
    stamp=additive,  # appends a new thread
    pages=("Threads",),
    actors=(Actor.USER_BUTTON, Actor.CHAT),
    chat_exposure="toolbox",
))


# ---- user wishes rough ---------------------------------------------------- #

register(Capability(
    name="run_user_wishes_rough",
    label="Drafted a rough outline",
    uses_ai=True,
    description="Draft a story-scope rough outline from the synopsis + braindumps.",
    route=Route.PROPOSE,
    gather=gather_user_wishes_rough,
    execute=execute_user_wishes_rough,
    accept="_accept_user_wishes_rough",
    # Accept REPLACES the earlier user-wishes thread — stamp it.
    stamp=stamp_user_wishes,
    pages=("ConsistencyLab",),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON),
))

register(Capability(
    name="_accept_user_wishes_rough",
    description="Accept a user-wishes-rough proposal.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_user_wishes_rough),
    pages=("ConsistencyLab",),
    actors=(Actor.INTERNAL,),
))
