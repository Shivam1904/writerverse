"""Scene checks (SA-251): structured output, and a bad reply is "failed", never all-clear.

Canned model outputs through the `_test_result` seam; no real LLM calls.
"""
from unittest import TestCase
from unittest.mock import patch

from ai_engine.parsers import PovPurityResult

from outline.ai import scene_analysis as sa

BODY = "Mara watched the door. Tom felt a cold dread he could not name."


class PovPurityTests(TestCase):
    def _run(self, result):
        return sa.pov_purity(BODY, context={"pov_character": "Mara", "_test_result": result})

    def test_violation_is_reported(self):
        out = self._run({"violations": [
            {"quote": "Tom felt a cold dread he could not name.", "reason": "Tom's interior"},
        ]})
        self.assertEqual(out["status"], "ok")
        self.assertEqual(out["violations_count"], 1)
        self.assertEqual(
            out["violations"][0],
            '"Tom felt a cold dread he could not name." — Tom\'s interior',
        )

    def test_schema_instance_is_accepted(self):
        out = self._run(PovPurityResult(violations=[]))
        self.assertEqual((out["status"], out["violations_count"]), ("ok", 0))

    def test_old_free_text_format_is_failed_not_clean(self):
        # The SA-251 bug: "- VIOLATION: ..." matched no prefix and read as zero issues.
        out = self._run('- VIOLATION: "Tom felt a cold dread" — head-hop')
        self.assertEqual(out["status"], "failed")
        self.assertNotIn("No POV violations", out["summary"])

    def test_wrong_shape_is_failed(self):
        self.assertEqual(self._run({"issues": ["x"]})["status"], "failed")

    def test_chain_returning_none_is_failed(self):
        class _Chain:
            def invoke(self, payload):
                return None
        with patch("outline.ai.chains.check_pov_purity.build_pov_purity_chain",
                   return_value=_Chain()):
            out = sa.pov_purity(BODY, context={"pov_character": "Mara"})
        self.assertEqual(out["status"], "failed")


class SubtextAndVoiceTests(TestCase):
    def test_subtext_flags(self):
        out = sa.detect_subtext(BODY, context={"_test_result": {
            "flags": [{"quote": "I am angry at you.", "reason": "states the feeling"}],
        }})
        self.assertEqual((out["status"], out["flags_count"]), ("ok", 1))

    def test_subtext_empty_list_is_clean(self):
        out = sa.detect_subtext(BODY, context={"_test_result": {"flags": []}})
        self.assertEqual((out["status"], out["flags_count"]), ("ok", 0))

    def test_subtext_unparseable_is_failed(self):
        out = sa.detect_subtext(BODY, context={"_test_result": "ALL_CLEAR maybe?"})
        self.assertEqual(out["status"], "failed")

    def test_voice_flags_and_failure(self):
        ctx = {"character_profiles": "Tom: stoic", "_test_result": {
            "flags": [{"character": "Tom", "reason": "too chatty"}],
        }}
        out = sa.voice_consistency(BODY, context=ctx)
        self.assertEqual(out["flags"], ["Tom — too chatty"])
        ctx["_test_result"] = "1. FLAG: Tom — too chatty"
        self.assertEqual(sa.voice_consistency(BODY, context=ctx)["status"], "failed")


class HookGradeTests(TestCase):
    def test_verdict_strings_keep_ui_format(self):
        out = sa.hook_grade(BODY, context={"_test_result": {
            "opening": {"grade": "Strong", "note": "clear question"},
            "closing": {"grade": "Weak", "note": "fizzles"},
        }})
        self.assertEqual(out["opening_verdict"], "OPENING: Strong — clear question")
        self.assertEqual(out["closing_verdict"], "CLOSING: Weak — fizzles")

    def test_bad_grade_is_failed(self):
        out = sa.hook_grade(BODY, context={"_test_result": {
            "opening": {"grade": "Great", "note": ""},
            "closing": {"grade": "Weak", "note": ""},
        }})
        self.assertEqual(out["status"], "failed")


class AskJsonChecksTests(TestCase):
    """summarize_scene / resolve_nouns: unparseable JSON is failed, not an empty ok."""

    def test_summary_parse_failure_is_failed(self):
        with patch("ai_engine.llm_utils.ask_json", side_effect=ValueError("bad json")):
            self.assertEqual(sa.summarize_scene(BODY)["status"], "failed")

    def test_resolve_nouns_non_object_is_failed(self):
        with patch("ai_engine.llm_utils.ask_json", return_value=[]):
            self.assertEqual(sa.resolve_nouns(BODY)["status"], "failed")
