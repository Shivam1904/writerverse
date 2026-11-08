"""Checklist coverage + scale extraction — the two AI calls moved into gauges
from the old v3 charts engine (_run_coverage_analyse, _run_extract_scale)."""
from unittest.mock import patch

from django.test import SimpleTestCase

import gauges.engine as g
from gauges.engine import _analyse as ga

ASK = "gauges.engine._analyse.llm_utils.ask_json"
SCOPE = {"type": "story", "name": ""}
GRAND = {"acts": [{"text": "Act I", "chapters": [{"text": "Chapter 1", "scenes": [
    {"id": "s1", "text": "The heist goes wrong", "beats": [{"text": "the vault is empty"}]},
]}]}]}
THREADS = [
    {"scope": {"type": "story", "name": ""}, "template_id": "x", "title": "Main",
     "items": [{"kind": "heading", "text": "Setup"}, {"kind": "text", "text": "Mara takes the job"}]},
    {"scope": {"type": "character", "name": "Dale"}, "title": "Other",
     "items": [{"kind": "text", "text": "OTHER_SCOPE_BEAT"}]},
]


class CoverageAnalyseTests(SimpleTestCase):
    lens = {"id": "story_skeleton", "name": "Story Skeleton"}

    def test_no_y_items_skips_the_model(self):
        with patch(ASK) as ask:
            out = ga._run_coverage_analyse(self.lens, SCOPE, [], THREADS, GRAND, "syn")
        ask.assert_not_called()
        self.assertEqual(out["coverage"], [])
        self.assertEqual(out["verdict"], "no y_items to check")

    def test_prompt_reads_scope_threads_and_outline_only(self):
        sent = {}

        def fake_ask(prompt, **kw):
            sent["prompt"] = prompt
            return []

        with patch(ASK, side_effect=fake_ask):
            ga._run_coverage_analyse(self.lens, SCOPE, ["Climax"], THREADS, GRAND, "SYN")
        p = sent["prompt"]
        self.assertIn('Chart: "Story Skeleton"  (template=story_skeleton)', p)
        self.assertIn("Mara takes the job", p)          # this scope's thread
        self.assertIn("grand beat: the vault is empty", p)
        self.assertNotIn("OTHER_SCOPE_BEAT", p)          # another scope's thread
        self.assertIn("SYN", p)

    def test_aligns_answers_to_y_items_and_flags_missing(self):
        fake = [
            {"y_item": "climax", "covered": True, "evidence": "the vault", "confidence": 7},
            {"y_item": "Not asked", "covered": True},
        ]
        with patch(ASK, return_value=fake):
            out = ga._run_coverage_analyse(self.lens, SCOPE, ["Climax", "Lock-in"],
                                          THREADS, GRAND, "syn")
        cov = {c["y_item"]: c for c in out["coverage"]}
        self.assertEqual(list(cov), ["Climax", "Lock-in"])   # y_items order, extras dropped
        self.assertTrue(cov["Climax"]["covered"])            # case-insensitive match
        self.assertEqual(cov["Climax"]["confidence"], 1.0)   # clamped
        self.assertFalse(cov["Lock-in"]["covered"])          # no answer → missing
        self.assertEqual(out["missing_count"], 1)
        self.assertIn("Lock-in", out["verdict"])

    def test_checklist_lens_feeds_the_cover_all_rule(self):
        lens = {**self.lens, "type_id": "checklist", "data_style": "coverage",
                "rule": ["cover_all"]}
        y_items = [{"value": "Climax"}, {"value": "Lock-in"}]
        with patch(ASK, return_value=[{"y_item": "Climax", "covered": True}]):
            out = g.run_gauge_analyse(lens, SCOPE, y_items, GRAND, THREADS, "syn", [])
        self.assertEqual([c["y_item"] for c in out["coverage"]], ["Climax", "Lock-in"])
        self.assertEqual(out["rules_applied"], ["cover_all"])
        self.assertEqual(len(out["offending"]), 1)
        self.assertIn("Lock-in", str(out["offending"][0]))


class ExtractScaleTests(SimpleTestCase):
    lens = {"id": "whos_where", "name": "Who's Where", "data_style": "scene_mapped"}

    def test_prompt_carries_lens_scope_and_prior_labels(self):
        sent = {}

        def fake_ask(prompt, **kw):
            sent["prompt"] = prompt
            return []

        with patch(ASK, side_effect=fake_ask):
            ga._run_extract_scale(self.lens, {"type": "character", "name": "Mara"},
                                 "SYN", ["BD"], THREADS, GRAND, ["the docks"])
        p = sent["prompt"]
        self.assertIn('Chart: "Who\'s Where"  (id=whos_where, backend=trajectory)', p)
        self.assertIn('character "Mara"', p)
        self.assertIn("EXISTING LABELS", p)
        self.assertIn("the docks", p)
        self.assertIn("The heist goes wrong", p)          # outline scene label
        self.assertIn("[story/] Main: Setup", p)          # thread headings

    def test_dedupes_drops_blanks_and_clamps(self):
        fake = [
            {"value": "The docks", "source": "braindumps", "confidence": 0.9},
            {"value": "the docks", "confidence": 0.5},     # duplicate, other case
            {"value": "  ", "confidence": 0.5},            # blank
            {"value": "Inn", "confidence": "bad"},         # unparseable → 0.5
            "not a dict",
        ]
        with patch(ASK, return_value=fake):
            out = g.run_gauge_extract(self.lens, SCOPE, "syn", [], [], None)
        self.assertEqual([y["value"] for y in out["y_items"]], ["The docks", "Inn"])
        self.assertEqual(out["y_items"][1]["confidence"], 0.5)
        self.assertEqual(out["y_items"][1]["source"], "braindumps")
        self.assertIn("ran_at", out)
        self.assertIn("usage", out)
