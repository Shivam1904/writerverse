"""Capability registrations — generic proposal operations."""
from actions.capabilities.commit._proposals import (
    commit_accept_proposal,
    commit_reject_proposal,
)
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route

register(Capability(
    name="accept_proposal",
    description=(
        "Accept a pending proposal. Resolves the per-type accept capability and "
        "dispatches it. If the author changed the target since the proposal was "
        "made, returns 409 proposal_stale with the conflicts; force=true applies "
        "it anyway (\"Use AI's\")."
    ),
    route=Route.WRITE,
    args={"proposal_id": "string", "force": "bool?"},
    gather=gather_from_proposal,
    commit=commit_accept_proposal,
    actors=(Actor.USER_BUTTON,),
))

register(Capability(
    name="reject_proposal",
    description="Reject a pending proposal.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=commit_reject_proposal,
    actors=(Actor.USER_BUTTON,),
))
