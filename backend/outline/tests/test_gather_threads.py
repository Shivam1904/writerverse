"""Unit tests for outline/capabilities/gather/threads.py — pure gather logic.

Tests the data shaping for generate_thread and user_wishes_rough capabilities.
No LLM calls; DB only for Project lookup (mocked where possible).
"""
import unittest
from unittest.mock import patch

from actions.capabilities.spec import CapabilityError, DispatchContext
from django.test import TestCase

from outline.capabilities.gather.threads import (
    _clean_texts,
    gather_generate_thread,
    gather_generate_thread_from_description,
    gather_user_wishes_rough,
)


class CleanTextsTests(unittest.TestCase):
    """Tests for the internal _clean_texts helper."""

    def test_clean_texts_basic(self):
        result = _clean_texts(["  hello  ", "world", ""])
        self.assertEqual(result, ["hello", "world"])

    def test_clean_texts_non_strings(self):
        result = _clean_texts([123, None, "  test  "])
        self.assertEqual(result, ["123", "None", "test"])

    def test_clean_texts_empty_input(self):
        self.assertEqual(_clean_texts([]), [])
        self.assertEqual(_clean_texts(None), [])
        self.assertEqual(_clean_texts(["", "   "]), [])

    def test_clean_texts_whitespace_only(self):
        self.assertEqual(_clean_texts(["   ", "\t", "\n"]), [])


class GatherGenerateThreadTests(TestCase):
    """Tests for gather_generate_thread — main thread generation gather."""

    def setUp(self):
        self.ctx = DispatchContext(project_id=1, actor="user_button")

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_generate_thread_basic(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {
            "synopsis": "A hero's journey",
            "title": "My Story",
        }
        mock_load_threads.return_value = [
            {"id": "ro-1", "title": "Existing Thread", "items": []}
        ]

        args = {
            "braindumps": ["Focus braindump 1", "Focus braindump 2"],
            "all_braindumps": ["Focus braindump 1", "Other braindump"],
            "scope_type": "character",
            "scope_name": "Hero",
        }
        result = gather_generate_thread(self.ctx, args)

        self.assertEqual(result["braindumps"], ["Focus braindump 1", "Focus braindump 2"])
        self.assertEqual(result["all_braindumps"], ["Focus braindump 1", "Other braindump", "Focus braindump 2"])
        self.assertEqual(result["synopsis"], "A hero's journey")
        self.assertEqual(result["title"], "My Story")
        self.assertEqual(result["existing_threads"], [{"id": "ro-1", "title": "Existing Thread", "items": []}])
        self.assertEqual(result["scope_type"], "character")
        self.assertEqual(result["scope_name"], "Hero")

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_generate_thread_no_all_braindumps_fallback(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {
            "synopsis": "Synopsis",
            "title": "Title",
        }
        mock_load_threads.return_value = []

        args = {"braindumps": ["Only focus"]}
        result = gather_generate_thread(self.ctx, args)

        # all_braindumps falls back to focus, then unioned (no duplicates)
        self.assertEqual(result["all_braindumps"], ["Only focus"])

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_generate_thread_all_braindumps_union(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {"synopsis": "", "title": ""}
        mock_load_threads.return_value = []

        args = {
            "braindumps": ["Focus 1", "Focus 2"],
            "all_braindumps": ["Focus 1", "Context 1"],
        }
        result = gather_generate_thread(self.ctx, args)

        # focus items not in all_braindumps are appended
        self.assertEqual(result["all_braindumps"], ["Focus 1", "Context 1", "Focus 2"])

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_generate_thread_missing_project(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = None
        mock_load_threads.return_value = []

        args = {"braindumps": ["test"]}
        result = gather_generate_thread(self.ctx, args)

        self.assertEqual(result["synopsis"], "")
        self.assertEqual(result["title"], "")

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_generate_thread_empty_braindumps_raises(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {"synopsis": "", "title": ""}
        mock_load_threads.return_value = []

        with self.assertRaises(CapabilityError) as cm:
            gather_generate_thread(self.ctx, {"braindumps": []})
        self.assertIn("at least one braindump is required", str(cm.exception))

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_generate_thread_whitespace_only_braindumps_raises(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {"synopsis": "", "title": ""}
        mock_load_threads.return_value = []

        with self.assertRaises(CapabilityError):
            gather_generate_thread(self.ctx, {"braindumps": ["   ", "\t"]})


class GatherGenerateThreadFromDescriptionTests(TestCase):
    """Tests for gather_generate_thread_from_description — description-based gather."""

    def setUp(self):
        self.ctx = DispatchContext(project_id=1, actor="user_button")

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_from_description_basic(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {
            "synopsis": "Synopsis text",
            "title": "Story Title",
        }
        mock_load_threads.return_value = [{"id": "ro-1"}]

        args = {"description": "A new thread about the villain's origin"}
        result = gather_generate_thread_from_description(self.ctx, args)

        self.assertEqual(result["braindumps"], ["A new thread about the villain's origin"])
        self.assertEqual(result["all_braindumps"], ["A new thread about the villain's origin"])
        self.assertEqual(result["synopsis"], "Synopsis text")
        self.assertEqual(result["title"], "Story Title")
        self.assertEqual(result["existing_threads"], [{"id": "ro-1"}])

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_from_description_empty_raises(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {"synopsis": "", "title": ""}
        mock_load_threads.return_value = []

        with self.assertRaises(CapabilityError) as cm:
            gather_generate_thread_from_description(self.ctx, {"description": ""})
        self.assertIn("a description is required", str(cm.exception))

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.load_threads")
    def test_gather_from_description_whitespace_raises(self, mock_load_threads, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {"synopsis": "", "title": ""}
        mock_load_threads.return_value = []

        with self.assertRaises(CapabilityError):
            gather_generate_thread_from_description(self.ctx, {"description": "   "})


class GatherUserWishesRoughTests(TestCase):
    """Tests for gather_user_wishes_rough — rough outline gather."""

    def setUp(self):
        self.ctx = DispatchContext(project_id=1, actor="user_button")

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.all_braindump_texts")
    def test_gather_user_wishes_rough_with_synopsis(self, mock_all_braindumps, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {
            "synopsis": "The synopsis",
            "title": "Title",
        }
        mock_all_braindumps.return_value = ["Braindump 1", "Braindump 2"]

        result = gather_user_wishes_rough(self.ctx, {})

        self.assertEqual(result["synopsis"], "The synopsis")
        self.assertEqual(result["title"], "Title")
        self.assertEqual(result["braindumps"], ["Braindump 1", "Braindump 2"])

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.all_braindump_texts")
    def test_gather_user_wishes_rough_no_synopsis_has_braindumps(self, mock_all_braindumps, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {
            "synopsis": "",
            "title": "Title",
        }
        mock_all_braindumps.return_value = ["Braindump 1"]

        result = gather_user_wishes_rough(self.ctx, {})

        self.assertEqual(result["synopsis"], "")
        self.assertEqual(result["braindumps"], ["Braindump 1"])

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.all_braindump_texts")
    def test_gather_user_wishes_rough_neither_raises(self, mock_all_braindumps, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = {
            "synopsis": "",
            "title": "Title",
        }
        mock_all_braindumps.return_value = []

        with self.assertRaises(CapabilityError) as cm:
            gather_user_wishes_rough(self.ctx, {})
        self.assertIn("no synopsis or braindumps to generate from", str(cm.exception))

    @patch("outline.capabilities.gather.threads.Project.objects.filter")
    @patch("outline.capabilities.gather.threads.all_braindump_texts")
    def test_gather_user_wishes_rough_missing_project(self, mock_all_braindumps, mock_filter):
        mock_filter.return_value.values.return_value.first.return_value = None
        mock_all_braindumps.return_value = ["Braindump"]

        result = gather_user_wishes_rough(self.ctx, {})
        self.assertEqual(result["synopsis"], "")
        self.assertEqual(result["title"], "")
        self.assertEqual(result["braindumps"], ["Braindump"])


if __name__ == "__main__":
    unittest.main()
