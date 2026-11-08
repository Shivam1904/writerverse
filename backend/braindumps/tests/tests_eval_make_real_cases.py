"""eval_make_real's written-down cases are well formed (offline: no AI is called)."""
from django.test import SimpleTestCase

from braindumps.management.commands.eval_make_real import (
    CASES,
    FIELDS,
    GAP_CASES,
    VARIANTS,
)


class EvalMakeRealCasesTests(SimpleTestCase):
    def test_case_ids_are_unique(self):
        ids = [c["id"] for c in CASES + GAP_CASES]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_case_names_only_real_fields(self):
        for case in CASES + GAP_CASES:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["ideas"])
                self.assertLessEqual(set(case["must_have"]), set(FIELDS))
                self.assertLessEqual(set(case["must_be_empty"]), set(FIELDS))
                # a field can't be both required and required-empty
                self.assertFalse(set(case["must_have"]) & set(case["must_be_empty"]))

    def test_today_variant_is_the_real_app(self):
        self.assertIn("today", VARIANTS)
