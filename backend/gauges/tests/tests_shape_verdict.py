"""Shape-lens verdicts tell the truth (holds / wobble / needs a look).

The `rising`/`falling` rules must distinguish three states, and never show the
total-failure `off` text for an arc that actually holds:

  · a clean climb                 → HOLDS       → the lens `good` text
  · a climb with a tolerated dip  → WOBBLE      → "Holds — N dip(s) to check"
  · a genuinely flat / falling arc → NEEDS A LOOK → the lens `off` text

Two bugs this pins (both fixed 2026-07-03):
  1. One dip flipped the verdict straight to the doom `off` text ("it stays
     flat") even though the arc rose end-to-end and the rule PASSED.
  2. Counting only backward moves let a truly FLAT line pass as "climbs" — the
     net-progress guard now fails an arc that ends no higher than it started.
"""
from django.test import SimpleTestCase

from gauges.engine import GAUGE_LENSES_BY_ID
from gauges.engine._rules import _RULE_FNS, _verdict_text


class ShapeVerdictTests(SimpleTestCase):
    def _verdict(self, seq):
        lens = GAUGE_LENSES_BY_ID["does_hero_grow"]
        yi = [y["value"] for y in lens["y_items"]]
        r = _RULE_FNS["rising"]([{"value": v} for v in seq], yi)
        text = _verdict_text(
            lens, [{**o, "rule": "rising"} for o in r["offending"]],
            applied=True, ok=r["ok"],
        )
        return r["ok"], text

    def test_clean_climb_holds(self):
        ok, text = self._verdict(["unchanged", "shaken", "trying", "committing", "transformed"])
        self.assertTrue(ok)
        self.assertIn("climbs", text)  # the lens `good` text

    def test_climb_with_dip_is_a_wobble_not_a_failure(self):
        # Rises unchanged→committing with one dip — the rule PASSES; the verdict
        # must be a wobble, never the "it stays flat" doom text.
        ok, text = self._verdict(
            ["unchanged", "unchanged", "unchanged", "shaken", "trying",
             "shaken", "shaken", "shaken", "trying", "trying", "trying", "committing"]
        )
        self.assertTrue(ok)
        self.assertIn("dip", text)
        self.assertNotIn("stays flat", text)

    def test_truly_flat_fails(self):
        # A hero who never changes must NOT read as "climbs" — the net-progress
        # guard fails a line that ends where it started.
        ok, text = self._verdict(["unchanged"] * 6)
        self.assertFalse(ok)
        self.assertIn("stays flat", text)

    def test_falling_arc_fails(self):
        ok, text = self._verdict(["committing", "trying", "shaken", "unchanged", "unchanged"])
        self.assertFalse(ok)
        self.assertIn("stays flat", text)

    def test_rise_then_return_is_flat(self):
        # Net zero (ends where it started) reads as flat, not a hold.
        ok, _ = self._verdict(["unchanged", "trying", "committing", "trying", "unchanged"])
        self.assertFalse(ok)
