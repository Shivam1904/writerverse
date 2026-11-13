"""Braindump AI annotator — chunking, merge, typed entities, and the payload.

Pure logic (no DB, no real LLM). The per-chunk LLM call (`_ask_json`) is stubbed
so we exercise chunk-splitting, overlap de-dup, pack renumbering, and the per-entity
craft-tag rollup. v2 shape: entities are typed dicts ``{kind, name}`` per phrase, and
the payload's top-level ``entities`` is the rolled-up ``[{kind, name, tags}]``.
"""
from unittest.mock import patch

from django.test import SimpleTestCase

from braindumps.ai import annotator as A


class TreeTests(SimpleTestCase):
    def test_tree_is_craft_only_no_entity_group(self):
        tree = A._render_tree()
        self.assertIn("Plot: event", tree)
        self.assertIn("Other:", tree)
        # Entity TYPES are carried by each entity's `kind` now — no type-tag group.
        self.assertNotIn("Entity:", tree)

    def test_kinds_are_rendered(self):
        kinds = A._render_kinds()
        self.assertIn("char:", kinds)
        self.assertIn("world:", kinds)


class ChunkTests(SimpleTestCase):
    def test_short_text_is_one_chunk(self):
        self.assertEqual(A._chunk("a short idea"), ["a short idea"])

    def test_long_text_splits_into_overlapping_chunks(self):
        paras = [f"P{i} " + ("x" * 600) for i in range(5)]
        chunks = A._chunk("\n\n".join(paras))
        self.assertGreater(len(chunks), 1)
        # Each chunk after the first repeats the previous chunk's last paragraph.
        for i in range(1, len(chunks)):
            first = chunks[i].split("\n\n")[0]
            last_prev = chunks[i - 1].split("\n\n")[-1]
            self.assertEqual(first, last_prev)


class MergeTests(SimpleTestCase):
    def test_dedup_overlap_and_renumber_packs(self):
        raw = [
            {"text": "John started the fire", "pack_id": "pack_1",
             "entities": [{"kind": "char", "name": "John"}], "tags": ["turning_point"], "_chunk": 0},
            {"text": "Sarah slapped him", "pack_id": "pack_1",
             "entities": [{"kind": "char", "name": "Sarah"}], "tags": ["event"], "_chunk": 0},
            # same phrase resurfaced by the overlap in the next chunk:
            {"text": "Sarah slapped him", "pack_id": "pack_1",
             "entities": [{"kind": "char", "name": "Sarah"}, {"kind": "char", "name": "John"}],
             "tags": ["emotion"], "_chunk": 1},
            {"text": "the old king watched", "pack_id": "pack_2",
             "entities": [{"kind": "char", "name": "Old King"}], "tags": ["turning_point"], "_chunk": 1},
        ]
        merged = A._merge(raw)
        # overlap duplicate dropped
        self.assertEqual([m["text"] for m in merged],
                         ["John started the fire", "Sarah slapped him", "the old king watched"])
        # dropped duplicate's tags/entities unioned into the kept copy
        sarah = next(m for m in merged if m["text"] == "Sarah slapped him")
        self.assertEqual({e["name"] for e in sarah["entities"]}, {"Sarah", "John"})
        self.assertEqual(set(sarah["tags"]), {"event", "emotion"})
        # packs renumbered continuously; same-chunk pack stays one pack
        self.assertEqual(merged[0]["pack_id"], merged[1]["pack_id"])
        self.assertEqual(merged[0]["pack_id"], "pack_1")
        self.assertEqual(merged[2]["pack_id"], "pack_2")

    def test_solo_phrases_each_get_their_own_pack(self):
        raw = [
            {"text": "one", "pack_id": "", "entities": [], "tags": ["idea"], "_chunk": 0},
            {"text": "two", "pack_id": "", "entities": [], "tags": ["question"], "_chunk": 0},
        ]
        packs = [m["pack_id"] for m in A._merge(raw)]
        self.assertEqual(len(set(packs)), 2)


class RollupTests(SimpleTestCase):
    def test_rollup_unions_each_entitys_own_tags(self):
        phrases = [
            {"text": "John is tall", "entities": [{"kind": "char", "name": "John", "tags": ["appearance"]}]},
            {"text": "John grew up poor", "entities": [{"kind": "char", "name": "John", "tags": ["backstory"]}]},
            {"text": "Pepper is reckless", "entities": [{"kind": "char", "name": "Pepper", "tags": ["flaw"]}]},
        ]
        rolled = A._rollup_entities(phrases)
        self.assertEqual(rolled, [
            {"kind": "char", "name": "John", "tags": ["appearance", "backstory"]},
            {"kind": "char", "name": "Pepper", "tags": ["flaw"]},
        ])


class PerEntityTagTests(SimpleTestCase):
    """v3: each entity keeps its own tags. Examples come from an app walk
    (2026-10-20), where the old phrase-wide tags went wrong."""

    def _run(self, text, resp, known=None):
        with patch("ai_engine.llm_utils.ask_json", return_value=resp):
            return A.annotate(text, known_entities=known)

    def test_one_persons_feeling_does_not_spread_to_the_other(self):
        out = self._run("Milo falls for Rosa the moment she moves in across the hall.", [
            {"text": "Milo falls for Rosa", "pack_id": "pack_1", "entities": [
                {"kind": "char", "name": "Milo", "tags": ["relationship", "emotion"]},
                {"kind": "char", "name": "Rosa", "tags": ["relationship"]}]},
        ])
        tags = {e["name"]: e["tags"] for e in out["entities"]}
        self.assertEqual(tags["Milo"], ["relationship", "emotion"])
        self.assertEqual(tags["Rosa"], ["relationship"])

    def test_places_keep_world_tags_only(self):
        out = self._run("Rosa is a waitress at the Blue Kettle Diner.", [
            {"text": "at the Blue Kettle Diner", "pack_id": "pack_1", "entities": [
                {"kind": "loc", "name": "Blue Kettle Diner", "tags": ["backstory", "setting"]}]},
        ])
        self.assertEqual(out["entities"], [{"kind": "loc", "name": "Blue Kettle Diner", "tags": ["setting"]}])

    def test_unknown_tags_are_dropped_and_capped(self):
        out = self._run("Otto: \"Nobody sits in my chair.\"", [
            {"text": "Nobody sits in my chair", "pack_id": "pack_1", "entities": [
                {"kind": "char", "name": "Otto",
                 "tags": ["dialogue", "made_up", "motif", "relationship", "catchphrase"]}]},
        ])
        self.assertEqual(out["entities"][0]["tags"], ["dialogue", "motif", "relationship"])
        self.assertLessEqual(len(out["entities"][0]["tags"]), A.MAX_TAGS_PER_ENTITY)

    def test_a_place_not_named_in_the_idea_is_dropped(self):
        # "Apartment" is a known place from another idea; this idea never names it.
        out = self._run("Milo falls for Rosa the moment she moves in across the hall.", [
            {"text": "she moves in across the hall", "pack_id": "pack_1", "entities": [
                {"kind": "char", "name": "Rosa", "tags": ["event"]},
                {"kind": "loc", "name": "Apartment", "tags": ["setting"]}]},
        ], known=["Apartment", "Rosa"])
        self.assertEqual([e["name"] for e in out["entities"]], ["Rosa"])
        self.assertEqual(out["phrases"][0]["tags"], ["event"])

    def test_a_short_name_must_match_a_whole_word(self):
        out = self._run("The activity starts at dawn.", [
            {"text": "The activity starts at dawn", "pack_id": "pack_1", "entities": [
                {"kind": "item", "name": "TV", "tags": ["setting"]}]},
        ], known=["TV"])
        self.assertEqual(out["entities"], [])

    def test_a_named_storyline_stays_even_if_its_name_is_coined(self):
        out = self._run("They rob the bank at midnight.", [
            {"text": "They rob the bank at midnight", "pack_id": "pack_1", "entities": [
                {"kind": "plot", "name": "The Heist", "tags": ["event"]}]},
        ])
        self.assertEqual(out["entities"], [{"kind": "plot", "name": "The Heist", "tags": ["event"]}])

    def test_a_person_referred_to_by_pronoun_stays(self):
        out = self._run("She hates the attic.", [
            {"text": "She hates the attic", "pack_id": "pack_1", "entities": [
                {"kind": "char", "name": "Ada", "tags": ["emotion"]}]},
        ], known=["Ada"])
        self.assertEqual([e["name"] for e in out["entities"]], ["Ada"])

    def test_old_answer_shape_still_works(self):
        # Tags on the phrase (v2 shape): handed to entities that came without their own.
        out = self._run("Bram keeps Rosa's TV.", [
            {"text": "Bram keeps Rosa's TV", "pack_id": "pack_1",
             "entities": [{"kind": "char", "name": "Bram"}], "tags": ["event"]},
        ])
        self.assertEqual(out["entities"], [{"kind": "char", "name": "Bram", "tags": ["event"]}])

    def test_prompt_asks_for_tags_per_entity(self):
        captured = {}

        def fake(prompt, role=None, tag=None, **_kw):
            captured["prompt"] = prompt
            return []
        with patch("ai_engine.llm_utils.ask_json", side_effect=fake):
            A.annotate("some idea")
        self.assertIn("Give EACH entity its own `tags`", captured["prompt"])
        self.assertIn("a LASTING physical trait", captured["prompt"])


class AnnotateTests(SimpleTestCase):
    def test_single_chunk_payload(self):
        resp = [{"text": "John lit the fire", "pack_id": "pack_1",
                 "entities": [{"kind": "char", "name": "John"}], "tags": ["turning_point", "emotion"]}]
        with patch("ai_engine.llm_utils.ask_json", return_value=resp):
            out = A.annotate("John lit the fire")
        self.assertEqual(out["status"], "ok")
        self.assertEqual(out["version"], A.VERSION)
        self.assertEqual(len(out["phrases"]), 1)
        self.assertEqual(set(out["tags"]), {"turning_point", "emotion"})
        self.assertEqual(out["entities"],
                         [{"kind": "char", "name": "John", "tags": ["turning_point", "emotion"]}])
        self.assertFalse(out["meta"]["chunked"])
        self.assertEqual(out["meta"]["chunk_count"], 1)

    def test_chunked_merges_across_calls(self):
        # Force >1 chunk; stub returns the SAME phrase every call → overlap dups
        # that merge must collapse to one.
        big = "\n\n".join(f"P{i} " + ("x" * 600) for i in range(5))
        resp = [{"text": "a shared phrase", "pack_id": "pack_1",
                 "entities": [{"kind": "char", "name": "Ann"}], "tags": ["event"]}]
        with patch("ai_engine.llm_utils.ask_json", return_value=resp) as m:
            out = A.annotate(big)
        self.assertGreater(m.call_count, 1)            # actually chunked
        self.assertTrue(out["meta"]["chunked"])
        self.assertEqual(len(out["phrases"]), 1)       # dedup across chunks
        self.assertEqual(out["tags"], ["event"])
        self.assertEqual(out["entities"], [{"kind": "char", "name": "Ann", "tags": ["event"]}])

    def test_empty_text_is_ok_empty(self):
        out = A.annotate("   ")
        self.assertEqual(out["status"], "ok")
        self.assertEqual(out["phrases"], [])
        self.assertEqual(out["entities"], [])
        self.assertEqual(out["meta"]["chunk_count"], 0)

    def test_engine_error_returns_failed_payload(self):
        with patch("ai_engine.llm_utils.ask_json", side_effect=RuntimeError("no api key")):
            out = A.annotate("some idea text")
        self.assertEqual(out["status"], "failed")
        self.assertEqual(out["phrases"], [])
        self.assertIn("error", out)
        self.assertNotIn("error_code", out)  # a real error: the UI offers Try again

    def test_no_ai_key_records_the_reason_and_logs_one_warning(self):
        from ai_engine.config import AI_NOT_CONFIGURED_MESSAGE, AINotConfiguredError
        with patch("ai_engine.llm_utils.ask_json", side_effect=AINotConfiguredError("no key")), \
                self.assertLogs("writerverse.consistency", level="WARNING") as logs:
            out = A.annotate("some idea text")
        self.assertEqual(out["status"], "failed")
        self.assertEqual(out["error_code"], "ai_not_configured")
        self.assertEqual(out["error_message"], AI_NOT_CONFIGURED_MESSAGE)
        self.assertEqual([r.levelname for r in logs.records], ["WARNING"])
        self.assertIsNone(logs.records[0].exc_info)


class ParseFailureTests(SimpleTestCase):
    def test_unparseable_json_is_failed_not_ok_empty(self):
        class _Resp:
            content = "not json at all"

        class _LLM:
            def invoke(self, prompt):
                return _Resp()

        with patch("ai_engine.llm_utils.create_llm", return_value=_LLM()):
            out = A.annotate("some idea text")
        self.assertEqual(out["status"], "failed")
        self.assertIn("invalid JSON", out["error"])

    def test_valid_empty_list_is_still_ok(self):
        with patch("ai_engine.llm_utils.ask_json", return_value=[]):
            out = A.annotate("some idea text")
        self.assertEqual(out["status"], "ok")


class GenericNounPromptTests(SimpleTestCase):
    def test_prompt_tells_model_to_skip_everyday_props(self):
        captured = {}
        def fake(prompt, role=None, tag=None, **_kw):
            captured["prompt"] = prompt
            return []
        with patch("ai_engine.llm_utils.ask_json", side_effect=fake):
            A.annotate("Mira refuses to drink fresh water from a cup")
        self.assertIn("Skip generic everyday nouns", captured["prompt"])
        self.assertIn("a cup", captured["prompt"])
        self.assertIn("never an everyday prop", captured["prompt"])


class KnownEntityTests(SimpleTestCase):
    def test_known_entities_canonicalise_output(self):
        # The model returns a casing/space variant; it collapses to the known name.
        resp = [{"text": "tony builds a suit", "pack_id": "pack_1",
                 "entities": [{"kind": "char", "name": "tony  stark"}], "tags": ["backstory"]}]
        with patch("ai_engine.llm_utils.ask_json", return_value=resp):
            out = A.annotate("tony builds a suit", known_entities=["Tony Stark"])
        self.assertEqual(out["entities"],
                         [{"kind": "char", "name": "Tony Stark", "tags": ["backstory"]}])
        self.assertEqual([e["name"] for e in out["phrases"][0]["entities"]], ["Tony Stark"])

    def test_known_entities_appear_in_prompt(self):
        captured = {}
        def fake(prompt, role=None, tag=None, **_kw):
            captured["prompt"] = prompt
            return []
        with patch("ai_engine.llm_utils.ask_json", side_effect=fake):
            A.annotate("some text", known_entities=["Tony Stark", "Iron Man"])
        self.assertIn("Known entities", captured["prompt"])
        self.assertIn("Tony Stark", captured["prompt"])

    def test_no_known_entities_no_block(self):
        captured = {}
        def fake(prompt, role=None, tag=None, **_kw):
            captured["prompt"] = prompt
            return []
        with patch("ai_engine.llm_utils.ask_json", side_effect=fake):
            A.annotate("some text")
        self.assertNotIn("Known entities", captured["prompt"])
