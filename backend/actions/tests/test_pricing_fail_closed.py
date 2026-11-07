"""SA-125: a broken price table refuses AI, but plain (non-AI) edits still work."""
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from ai_engine import usage_meter as um
from django.test import TestCase
from outline.tests.tests_update_outline_written import _outline_data

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope


class NonAiDispatchWithoutPricesTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from outline.store import save_outline
        from projects.models import Project
        user = get_user_model().objects.create_user(email="p@e.com", password="x")
        self.project = Project.objects.create(title="P", user=user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline_data())
        um._model_providers.cache_clear()
        self.addCleanup(um._model_providers.cache_clear)

    def test_plain_update_succeeds_when_price_table_fails(self):
        with mock.patch.object(um, "_PROVIDERS_PATH", Path("/nonexistent/providers.yml")):
            with self.assertRaises(um.PricingError):
                um.check_priced("gpt-4o-mini")  # AI really is off...
            res = dispatch("update_outline_item",
                           {"item_type": "beat", "item_id": "bt1", "written": True},
                           Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")  # ...but the plain edit still works
