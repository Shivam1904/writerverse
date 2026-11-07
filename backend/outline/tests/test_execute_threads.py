"""Unit tests for outline/capabilities/execute/threads.py — thin engine wrappers.

Tests error handling and result validation. Engine calls mocked; no LLM.
"""
import unittest
from unittest.mock import patch

from actions.capabilities.spec import CapabilityError, DispatchContext
from django.test import SimpleTestCase

from outline.capabilities.execute.threads import (
    execute_generate_thread,
    execute_generate_thread_from_description,
    execute_user_wishes_rough,
)


class ExecuteGenerateThreadTests(SimpleTestCase):
    """Tests for execute_generate_thread."""

    def setUp(self):
        self.ctx = DispatchContext(project_id=1, actor="user_button")
        self.gathered = {
            "braindumps": ["Focus 1", "Focus 2"],
            "all_braindumps": ["Focus 1", "Focus 2", "Context 1"],
            "synopsis": "A story",
            "title": "My Story",
            "existing_threads": [],
            "scope_type": "character",
            "scope_name": "Hero",
        }

    @patch("outline.capabilities.execute.threads.run_generate_thread")
    def test_execute_generate_thread_success(self, mock_run):
        mock_run.return_value = {
            "plot_thread": {"id": "ro-1", "title": "Thread", "items": []},
            "ran_at": "2024-01-01T00:00:00",
            "usage": {"total_tokens": 100, "cost_usd": 0.01},
            "items_count": 3,
        }

        result = execute_generate_thread(self.ctx, self.gathered)

        self.assertIn("plot_thread", result)
        self.assertEqual(result["plot_thread"]["id"], "ro-1")
        self.assertEqual(result["items_count"], 3)
        mock_run.assert_called_once_with(
            ["Focus 1", "Focus 2"],
            all_braindumps=["Focus 1", "Focus 2", "Context 1"],
            synopsis="A story",
            title="My Story",
            existing_threads=[],
            scope_type="character",
            scope_name="Hero",
        )

    @patch("outline.capabilities.execute.threads.run_generate_thread")
    def test_execute_generate_thread_engine_exception(self, mock_run):
        mock_run.side_effect = RuntimeError("LLM down")

        with self.assertRaises(CapabilityError) as cm:
            execute_generate_thread(self.ctx, self.gathered)
        self.assertEqual(cm.exception.status, 502)
        self.assertIn("generate_thread failed", str(cm.exception))

    @patch("outline.capabilities.execute.threads.run_generate_thread")
    def test_execute_generate_thread_no_result(self, mock_run):
        mock_run.return_value = {}

        with self.assertRaises(CapabilityError) as cm:
            execute_generate_thread(self.ctx, self.gathered)
        self.assertEqual(cm.exception.status, 502)
        self.assertIn("engine returned no thread", str(cm.exception))

    @patch("outline.capabilities.execute.threads.run_generate_thread")
    def test_execute_generate_thread_no_plot_thread(self, mock_run):
        mock_run.return_value = {"plot_thread": None}

        with self.assertRaises(CapabilityError) as cm:
            execute_generate_thread(self.ctx, self.gathered)
        self.assertEqual(cm.exception.status, 502)


class ExecuteGenerateThreadFromDescriptionTests(SimpleTestCase):
    """Tests for execute_generate_thread_from_description — reuses same engine."""

    def setUp(self):
        self.ctx = DispatchContext(project_id=1, actor="user_button")
        self.gathered = {
            "braindumps": ["Description text"],
            "all_braindumps": ["Description text"],
            "synopsis": "Synopsis",
            "title": "Title",
            "existing_threads": [],
        }

    @patch("outline.capabilities.execute.threads.execute_generate_thread")
    def test_execute_generate_thread_from_description_delegates(self, mock_execute):
        mock_execute.return_value = {"plot_thread": {"id": "ro-1"}, "items_count": 2}

        result = execute_generate_thread_from_description(self.ctx, self.gathered)

        self.assertEqual(result, {"plot_thread": {"id": "ro-1"}, "items_count": 2})
        mock_execute.assert_called_once_with(self.ctx, self.gathered)


class ExecuteUserWishesRoughTests(SimpleTestCase):
    """Tests for execute_user_wishes_rough."""

    def setUp(self):
        self.ctx = DispatchContext(project_id=1, actor="user_button")
        self.gathered = {
            "synopsis": "The synopsis",
            "braindumps": ["Braindump 1", "Braindump 2"],
            "title": "Story Title",
        }

    @patch("outline.capabilities.execute.threads.run_user_wishes_rough")
    def test_execute_user_wishes_rough_success(self, mock_run):
        mock_run.return_value = {
            "rough_outline": {"id": "ro-1", "items": [{"id": "it-1"}]},
            "ran_at": "2024-01-01T00:00:00",
            "usage": {"total_tokens": 200, "cost_usd": 0.02},
            "items_count": 1,
        }

        result = execute_user_wishes_rough(self.ctx, self.gathered)

        self.assertIn("rough_outline", result)
        self.assertEqual(result["rough_outline"]["id"], "ro-1")
        self.assertEqual(result["items_count"], 1)
        mock_run.assert_called_once_with("The synopsis", ["Braindump 1", "Braindump 2"], title="Story Title")

    @patch("outline.capabilities.execute.threads.run_user_wishes_rough")
    def test_execute_user_wishes_rough_engine_exception(self, mock_run):
        mock_run.side_effect = ValueError("bad response")

        with self.assertRaises(CapabilityError) as cm:
            execute_user_wishes_rough(self.ctx, self.gathered)
        self.assertEqual(cm.exception.status, 502)
        self.assertIn("user_wishes failed", str(cm.exception))

    @patch("outline.capabilities.execute.threads.run_user_wishes_rough")
    def test_execute_user_wishes_rough_no_result(self, mock_run):
        mock_run.return_value = {}

        with self.assertRaises(CapabilityError) as cm:
            execute_user_wishes_rough(self.ctx, self.gathered)
        self.assertEqual(cm.exception.status, 502)
        self.assertIn("engine returned no outline", str(cm.exception))

    @patch("outline.capabilities.execute.threads.run_user_wishes_rough")
    def test_execute_user_wishes_rough_no_rough_outline(self, mock_run):
        mock_run.return_value = {"rough_outline": None}

        with self.assertRaises(CapabilityError) as cm:
            execute_user_wishes_rough(self.ctx, self.gathered)
        self.assertEqual(cm.exception.status, 502)


if __name__ == "__main__":
    unittest.main()
