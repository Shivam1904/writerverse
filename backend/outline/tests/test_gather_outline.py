"""Unit tests for outline/capabilities/gather/outline.py — merge gather logic.

Tests the data loading for merge capability. No LLM; DB mocked.
"""
import unittest
from unittest.mock import patch

from actions.capabilities.spec import CapabilityError, DispatchContext
from django.test import TestCase

from outline.capabilities.gather.outline import gather_merge


class GatherMergeTests(TestCase):
    """Tests for gather_merge — loads rough thread + grand outline."""

    def setUp(self):
        self.ctx = DispatchContext(project_id=1, actor="user_button")

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_basic(self, mock_load_outline, mock_load_threads):
        mock_load_threads.return_value = [
            {"id": "ro-1", "title": "Thread 1", "items": []},
            {"id": "ro-2", "title": "Thread 2", "items": []},
        ]
        mock_load_outline.return_value = {"acts": [{"id": "ac-1"}]}

        args = {"thread_id": "ro-1"}
        result = gather_merge(self.ctx, args)

        self.assertEqual(result["rough_id"], "ro-1")
        self.assertEqual(result["rough"]["id"], "ro-1")
        self.assertEqual(result["rough"]["title"], "Thread 1")
        self.assertEqual(result["grand"], {"acts": [{"id": "ac-1"}]})

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_rough_id_fallback(self, mock_load_outline, mock_load_threads):
        """Supports legacy 'rough_id' arg name."""
        mock_load_threads.return_value = [{"id": "ro-1", "items": []}]
        mock_load_outline.return_value = {"acts": []}

        args = {"rough_id": "ro-1"}
        result = gather_merge(self.ctx, args)

        self.assertEqual(result["rough_id"], "ro-1")

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_missing_thread_id_raises(self, mock_load_outline, mock_load_threads):
        mock_load_threads.return_value = [{"id": "ro-1"}]
        mock_load_outline.return_value = {"acts": []}

        with self.assertRaises(CapabilityError) as cm:
            gather_merge(self.ctx, {})
        self.assertIn("thread_id is required", str(cm.exception))

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_thread_not_found_raises(self, mock_load_outline, mock_load_threads):
        mock_load_threads.return_value = [{"id": "ro-1", "items": []}]
        mock_load_outline.return_value = {"acts": []}

        with self.assertRaises(CapabilityError) as cm:
            gather_merge(self.ctx, {"thread_id": "ro-999"})
        self.assertIn("rough outline ro-999 not found", str(cm.exception))

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_no_grand_outline_raises(self, mock_load_outline, mock_load_threads):
        mock_load_threads.return_value = [{"id": "ro-1", "items": []}]
        mock_load_outline.return_value = None  # no grand outline

        with self.assertRaises(CapabilityError) as cm:
            gather_merge(self.ctx, {"thread_id": "ro-1"})
        self.assertIn("no grand outline", str(cm.exception))

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_non_dict_grand_raises(self, mock_load_outline, mock_load_threads):
        mock_load_threads.return_value = [{"id": "ro-1", "items": []}]
        mock_load_outline.return_value = "not-a-dict"

        with self.assertRaises(CapabilityError) as cm:
            gather_merge(self.ctx, {"thread_id": "ro-1"})
        self.assertIn("no grand outline", str(cm.exception))

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_non_dict_rough_skipped(self, mock_load_outline, mock_load_threads):
        """Non-dict items in threads list are skipped."""
        mock_load_threads.return_value = [
            "not-a-dict",
            {"id": "ro-1", "items": []},
        ]
        mock_load_outline.return_value = {"acts": []}

        result = gather_merge(self.ctx, {"thread_id": "ro-1"})
        self.assertEqual(result["rough"]["id"], "ro-1")

    @patch("outline.store.load_threads")
    @patch("outline.capabilities.gather.outline.load_outline")
    def test_gather_merge_rough_without_id_skipped(self, mock_load_outline, mock_load_threads):
        """Rough dict without 'id' is skipped."""
        mock_load_threads.return_value = [
            {"title": "No ID"},
            {"id": "ro-1", "items": []},
        ]
        mock_load_outline.return_value = {"acts": []}

        result = gather_merge(self.ctx, {"thread_id": "ro-1"})
        self.assertEqual(result["rough"]["id"], "ro-1")


if __name__ == "__main__":
    unittest.main()
