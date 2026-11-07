"""A server with no AI key: an AI capability answers a calm 503
`ai_not_configured`, not a crash (open-source forks run without keys)."""
import os
from unittest import mock

from ai_engine.llm_utils import create_llm
from django.test import TestCase

from actions.capabilities import Actor, Capability, Route, dispatch, registry
from actions.capabilities.spec import ProjectScope

NO_KEYS = {"OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": ""}


def _needs_llm(ctx, args):
    create_llm("small")
    return {}


class AiNotConfiguredTests(TestCase):
    def setUp(self):
        self._snap = registry.snapshot()
        registry.register(Capability(
            name="_needs_llm", description="t", route=Route.READ,
            gather=_needs_llm, uses_ai=True,
        ))

    def tearDown(self):
        registry.restore(self._snap)

    def test_no_keys_gives_503_with_stable_code(self):
        with mock.patch.dict(os.environ, NO_KEYS):
            res = dispatch("_needs_llm", {}, Actor.USER_BUTTON, ProjectScope(None))
        self.assertEqual(res.status, "error")
        self.assertEqual(res.http_status, 503)
        self.assertEqual(res.code, "ai_not_configured")
        self.assertIn("AI is not configured on this server", res.error)
