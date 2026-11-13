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

    def test_execute_step_that_wraps_it_in_a_502_still_gives_503_and_one_warning(self):
        # Title generation (like most execute steps) catches every exception
        # and re-raises a 502 CapabilityError. "No AI key" must still reach the
        # author as the calm 503, logged as one warning line with no traceback.
        from projects.capabilities.execute_titles import execute_generate_title
        registry.register(Capability(
            name="_wraps_llm", description="t", route=Route.READ,
            execute=execute_generate_title, uses_ai=True,
        ))
        with mock.patch.dict(os.environ, NO_KEYS), \
                self.assertLogs("writerverse.consistency", level="WARNING") as logs:
            res = dispatch("_wraps_llm", {"description": "a dragon"}, Actor.USER_BUTTON,
                           ProjectScope(None))
        self.assertEqual(res.http_status, 503)
        self.assertEqual(res.code, "ai_not_configured")
        failed = [r for r in logs.records if "generate-title FAILED" in r.getMessage()]
        self.assertEqual([r.levelname for r in failed], ["WARNING"])
        self.assertIsNone(failed[0].exc_info)
