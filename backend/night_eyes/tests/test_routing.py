"""Unit tests for night_eyes.routing — pure, deterministic tier→role resolution.

No DB, no LLM calls. Exhaustive coverage of resolve_role rules.
"""
import unittest

from night_eyes.routing import TIER_TO_ROLE, resolve_role, role_to_tier


class TierToRoleMappingTests(unittest.TestCase):
    """Test the static TIER_TO_ROLE and inverse mappings."""

    def test_tier_to_role_mapping(self):
        self.assertEqual(TIER_TO_ROLE, {"quick": "small", "standard": "draft", "deep": "expert"})

    def test_role_to_tier_inverse(self):
        self.assertEqual(role_to_tier("small"), "quick")
        self.assertEqual(role_to_tier("draft"), "standard")
        self.assertEqual(role_to_tier("expert"), "deep")
        self.assertEqual(role_to_tier("unknown"), "standard")  # fallback


class ResolveRolePinnedTierTests(unittest.TestCase):
    """Rule 1: explicit tier pins (non-'auto') return immediately."""

    def test_pinned_quick(self):
        role, reason = resolve_role("quick", "", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "pinned:quick")

    def test_pinned_standard(self):
        role, reason = resolve_role("standard", "", "any-page")
        self.assertEqual(role, "draft")
        self.assertEqual(reason, "pinned:standard")

    def test_pinned_deep(self):
        role, reason = resolve_role("deep", "", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "pinned:deep")

    def test_unknown_tier_falls_to_auto_rules(self):
        # Unknown tier is treated as 'auto', proceeds through auto rules
        role, reason = resolve_role("QUICK", "who is it", "any-page")
        self.assertEqual(role, "small")  # short read rule matches
        self.assertEqual(reason, "quick-read")

        # But non-read short message falls to default
        role, reason = resolve_role("Deep", "short msg", "any-page")
        self.assertEqual(role, "draft")
        self.assertEqual(reason, "default")


class ResolveRoleAutoRulesTests(unittest.TestCase):
    """Rule 2-4: auto tier resolution (first match wins)."""

    # Rule 1 in docstring: escalate_next
    def test_escalate_next_wins(self):
        role, reason = resolve_role("auto", "hello", "any-page", escalate_next=True)
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "escalated")

    # Rule 2: long message or generative marker
    def test_long_message_escalates(self):
        long_msg = "x" * 601  # > LONG_MESSAGE_CHARS (600)
        role, reason = resolve_role("auto", long_msg, "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "long-input")

    def test_generative_marker_generate(self):
        role, reason = resolve_role("auto", "please generate a scene", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    def test_generative_marker_merge(self):
        role, reason = resolve_role("auto", "can you merge these threads?", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    def test_generative_marker_analyse(self):
        role, reason = resolve_role("auto", "analyse this scene for me", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    def test_generative_marker_rewrite(self):
        role, reason = resolve_role("auto", "rewrite the ending", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    def test_generative_marker_brainstorm(self):
        role, reason = resolve_role("auto", "brainstorm some ideas", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    def test_generative_marker_draft_a(self):
        role, reason = resolve_role("auto", "draft a new chapter", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    def test_generative_marker_flesh_out(self):
        role, reason = resolve_role("auto", "flesh out the middle", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    # Rule 3: short read-shaped question → small
    def test_short_read_who(self):
        role, reason = resolve_role("auto", "who is the protagonist", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_what(self):
        role, reason = resolve_role("auto", "what happens in chapter 3", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_when(self):
        role, reason = resolve_role("auto", "when does the climax occur", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_where(self):
        role, reason = resolve_role("auto", "where is the setting", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_which(self):
        role, reason = resolve_role("auto", "which character dies", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_list(self):
        role, reason = resolve_role("auto", "list all characters", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_how_many(self):
        role, reason = resolve_role("auto", "how many scenes", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_under_threshold(self):
        # Must be under SHORT_READ_CHARS (120) AND start with read word
        role, reason = resolve_role("auto", "who", "any-page")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_short_read_over_threshold_falls_through(self):
        # Over 120 chars even with read word → not quick-read
        long_read = "who " + "x" * 118  # 122 chars
        role, reason = resolve_role("auto", long_read, "any-page")
        self.assertEqual(role, "draft")  # falls to default
        self.assertEqual(reason, "default")

    def test_short_read_not_read_word_falls_through(self):
        # Under 120 chars but doesn't start with read word
        role, reason = resolve_role("auto", "tell me about the hero", "any-page")
        self.assertEqual(role, "draft")
        self.assertEqual(reason, "default")

    # Rule 4: heavy pages → expert
    def test_heavy_page_lenses(self):
        role, reason = resolve_role("auto", "short msg", "lenses")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "heavy-page")

    def test_heavy_page_charts_view(self):
        role, reason = resolve_role("auto", "short msg", "charts-view")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "heavy-page")

    def test_heavy_page_plot_threads(self):
        role, reason = resolve_role("auto", "short msg", "plot-threads")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "heavy-page")

    # Default: draft
    def test_default_fallback(self):
        role, reason = resolve_role("auto", "some normal message", "normal-page")
        self.assertEqual(role, "draft")
        self.assertEqual(reason, "default")

    def test_empty_message_default(self):
        role, reason = resolve_role("auto", "", "normal-page")
        self.assertEqual(role, "draft")
        self.assertEqual(reason, "default")

    def test_none_message_default(self):
        role, reason = resolve_role("auto", None, "normal-page")
        self.assertEqual(role, "draft")
        self.assertEqual(reason, "default")


class ResolveRolePrecedenceTests(unittest.TestCase):
    """Test that rule precedence is correct (first match wins)."""

    def test_escalate_beats_long_message(self):
        # escalate_next should win even if message is short
        role, reason = resolve_role("auto", "hi", "any-page", escalate_next=True)
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "escalated")

    def test_long_beats_generative(self):
        # Long message should win even if it has generative marker
        long_with_gen = "generate " + "x" * 600  # > 600 chars
        role, reason = resolve_role("auto", long_with_gen, "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "long-input")

    def test_generative_beats_short_read(self):
        # Generative marker should win over short read
        role, reason = resolve_role("auto", "who generate something", "any-page")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "generative-ask")

    def test_short_read_beats_heavy_page(self):
        # Short read should win over heavy page
        role, reason = resolve_role("auto", "who is it", "lenses")
        self.assertEqual(role, "small")
        self.assertEqual(reason, "quick-read")

    def test_heavy_page_beats_default(self):
        # Heavy page should win over default
        role, reason = resolve_role("auto", "some normal msg", "lenses")
        self.assertEqual(role, "expert")
        self.assertEqual(reason, "heavy-page")


if __name__ == "__main__":
    unittest.main()
