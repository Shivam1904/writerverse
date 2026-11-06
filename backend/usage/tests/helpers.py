"""Shared test helpers for AI work: a fake model that reports real token usage
(so the LangChain meter counts it as in production), throw-away capabilities,
and a user with a project. No paid API is called."""
from actions.capabilities import Actor, Capability, Route, registry
from django.contrib.auth import get_user_model
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from projects.models import Project

MODEL = "gpt-4o"  # $2.50 in / $10 out per 1M tokens (genai-prices)


class _Spend(BaseChatModel):
    """Fake model: every call 'spends' the given tokens on MODEL."""

    tin: int = 1000
    tout: int = 0

    @property
    def _llm_type(self) -> str:
        return "fake-spend"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = AIMessage(
            content="ok",
            usage_metadata={
                "input_tokens": self.tin, "output_tokens": self.tout,
                "total_tokens": self.tin + self.tout,
            },
            response_metadata={"model_name": MODEL},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


def spend(tin, tout=0):
    _Spend(tin=tin, tout=tout).invoke("x")


def _setup():
    User = get_user_model()
    user = User.objects.create_user(email=f"u{User.objects.count()}@t.com", password="x")
    project = Project.objects.create(title="P", user=user)
    return user, project


_NAMES: list[str] = []


def _cap(name, execute, *, route=Route.READ, actors=None):
    _NAMES.append(name)
    registry.register(Capability(
        name=name, route=route, description=name, uses_ai=True, label=f"Did {name}",
        execute=execute,
        actors=actors or (Actor.USER_BUTTON, Actor.CHAT, Actor.INTERNAL),
    ))


def _drop_caps():
    while _NAMES:
        registry._REGISTRY.pop(_NAMES.pop(), None)
