"""Per-user rate limit on requests that run AI (common/throttling.py).

Free AI helpers are never charged, so this limit is what stops a script from
looping them. Only `uses_ai` actions count: saving prose or editing a
character is never limited.
"""
from unittest.mock import patch

from common.throttling import AI_THROTTLES, throttle_cache
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from night_eyes.stream import ChatStreamView, PingAnswerView
from projects.models import Project
from rest_framework.test import APIClient

from actions.capabilities import registry
from actions.capabilities.dispatch import DispatchResult

AI_CAP = "generate_title"
PLAIN_CAP = "get_project_meta"

RATES = {
    **settings.REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "ai_burst": "2/min",
        "ai_daily": "100/day",
    },
}


def _fake_dispatch(capability, *_a, **_k):
    return DispatchResult(status="ran", capability=capability, result={})


@override_settings(REST_FRAMEWORK=RATES)
@patch("actions.facade.run_followups", side_effect=lambda res, *a, **k: res)
@patch("actions.facade.dispatch", side_effect=_fake_dispatch)
class AIRateLimitTests(TestCase):
    def setUp(self):
        throttle_cache.clear()
        self.user = get_user_model().objects.create_user(email="rate@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _op(self, capability):
        return self.client.post(
            f"/api/consistency/projects/{self.project.pk}/op/{capability}/", {}, format="json",
        )

    def test_caps_are_what_the_test_assumes(self, *_):
        self.assertTrue(registry.get(AI_CAP).uses_ai)
        self.assertFalse(registry.get(PLAIN_CAP).uses_ai)

    def test_ai_action_gets_429_over_the_limit(self, *_):
        self.assertEqual(self._op(AI_CAP).status_code, 200)
        self.assertEqual(self._op(AI_CAP).status_code, 200)
        self.assertEqual(self._op(AI_CAP).status_code, 429)

    def test_non_ai_actions_are_never_limited(self, *_):
        for _ in range(5):
            self.assertEqual(self._op(PLAIN_CAP).status_code, 200)

    def test_limit_is_per_user(self, *_):
        self._op(AI_CAP)
        self._op(AI_CAP)
        other = get_user_model().objects.create_user(email="rate2@e.com", password="x")
        project = Project.objects.create(title="Q", user=other)
        client = APIClient()
        client.force_authenticate(other)
        resp = client.post(f"/api/consistency/projects/{project.pk}/op/{AI_CAP}/", {}, format="json")
        self.assertEqual(resp.status_code, 200)


class ChatIsRateLimitedTests(TestCase):
    def test_chat_and_ping_answer_use_the_ai_throttles(self):
        self.assertEqual(ChatStreamView.throttle_classes, AI_THROTTLES)
        self.assertEqual(PingAnswerView.throttle_classes, AI_THROTTLES)
