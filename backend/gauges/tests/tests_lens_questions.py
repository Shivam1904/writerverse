"""Every lens in the bank is a question (LANGUAGE.md).

A lens = a question answered with a picture. The `question` field carries that
question; the short `name` survives only as a nickname chip. This test locks in
that every catalogue lens ships a question — a new lens added without one fails
here rather than reaching the UI as a bare noun title.
"""
from django.test import SimpleTestCase

from gauges.engine._serve import build_catalogue


class LensQuestionsTests(SimpleTestCase):
    def _lenses(self):
        cat = build_catalogue()
        return [lens for t in cat["types"] for lens in t["lenses"]]

    def test_every_lens_has_a_question(self):
        missing = [lens.get("id") for lens in self._lenses() if not (lens.get("question") or "").strip()]
        self.assertEqual(missing, [], f"lenses missing a question: {missing}")

    def test_questions_read_as_questions(self):
        # A question ends with '?' — cheap guard against a stray statement slipping in.
        not_questions = [
            lens.get("id") for lens in self._lenses()
            if (lens.get("question") or "").strip() and not lens["question"].strip().endswith("?")
        ]
        self.assertEqual(not_questions, [], f"lens questions not phrased as questions: {not_questions}")

    def test_name_survives_as_nickname(self):
        # The short name must still be present (it becomes the nickname chip).
        missing = [lens.get("id") for lens in self._lenses() if not (lens.get("name") or "").strip()]
        self.assertEqual(missing, [], f"lenses missing a name/nickname: {missing}")
