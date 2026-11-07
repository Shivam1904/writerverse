"""dispatch() flags a capability that spends LLM tokens with uses_ai=False:
its AI policy check was skipped. Tokens spent by a nested, honest AI capability
don't count against the plain one that dispatched it."""
from django.test import TestCase
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from actions.capabilities import Actor, Capability, Route, dispatch, registry
from actions.capabilities.spec import ProjectScope

LOGGER = "writerverse.consistency"


def _call_llm(ctx, args):
    msg = AIMessage(
        content="x", response_metadata={"model_name": "gpt-4o-mini"},
        usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
    )
    GenericFakeChatModel(messages=iter([msg])).invoke("hi")
    return {}


def _nest(ctx, args):
    dispatch("_honest_ai", {}, Actor.INTERNAL, ctx.scope)
    return {}


class UsesAiHonestyTests(TestCase):
    def setUp(self):
        self._snap = registry.snapshot()
        for name, gather, uses_ai in (
            ("_sneaky_ai", _call_llm, False),
            ("_honest_ai", _call_llm, True),
            ("_plain_nests_ai", _nest, False),
        ):
            registry.register(Capability(
                name=name, description="t", route=Route.READ,
                gather=gather, uses_ai=uses_ai,
            ))

    def tearDown(self):
        registry.restore(self._snap)

    def run_cap(self, name):
        return dispatch(name, {}, Actor.USER_BUTTON, ProjectScope(None))

    def test_undeclared_ai_is_logged_as_error(self):
        with self.assertLogs(LOGGER, "ERROR") as logs:
            res = self.run_cap("_sneaky_ai")
        self.assertEqual(res.status, "ran")
        self.assertIn("_sneaky_ai spent 15 LLM tokens", "\n".join(logs.output))

    def test_declared_ai_and_nested_ai_are_fine(self):
        for name in ("_honest_ai", "_plain_nests_ai"):
            with self.subTest(name=name), self.assertNoLogs(LOGGER, "ERROR"):
                self.assertEqual(self.run_cap(name).status, "ran")


class AiCapabilitiesHaveLabelsTests(TestCase):
    def test_every_paid_ai_capability_has_a_usage_label(self):
        # wrt-14: usage records keep `label`, the plain words, never the internal name.
        missing = [c.name for c in registry.all_capabilities() if c.uses_ai and not c.label]
        self.assertEqual(missing, [])
