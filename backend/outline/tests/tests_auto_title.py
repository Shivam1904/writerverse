"""wrt-78: adding a scene saves it and gives it an auto-title (a nested
`generate_title` dispatch) under the default AI policy, without errors. The LLM
is a fake that reports real usage, and that usage is recorded in AIUsage.
"""
from types import SimpleNamespace
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.test import TestCase
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from usage.models import AIUsage

from outline.tests.tests_add_scene_with_beats import _TITLE_FN, _outline_data


def _spending_titler(description, case="title"):
    msg = AIMessage(
        content="x", response_metadata={"model_name": "gpt-5.4-nano"},
        usage_metadata={"input_tokens": 500, "output_tokens": 20, "total_tokens": 520},
    )
    GenericFakeChatModel(messages=iter([msg])).invoke("title")
    return {"title": "Crossing the river"}


class AutoTitleTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        from outline.store import save_outline
        user = get_user_model().objects.create_user(email="f@e.com", password="x")
        self.project = Project.objects.create(title="P", user=user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline_data())
        self.scope = ProjectScope(self.project.id)

    def test_saves_titles_and_records_usage_under_the_default_policy(self):
        with patch(_TITLE_FN, side_effect=_spending_titler), \
                self.assertNoLogs("writerverse.consistency", "ERROR"):
            res = dispatch("add_scene_with_beats", {"chapter_id": "ch1", "beats": ["They reach the river"]},
                           Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "ran")
        row = AIUsage.objects.get()
        self.assertEqual((row.tokens_in, row.tokens_out), (500, 20))
