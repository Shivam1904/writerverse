"""Configurable gauge x-axis (axis: {walk, tick}) — AXIS.md."""
import gauges.engine as g
from django.test import SimpleTestCase

GRAND = {
    "acts": [
        {"id": "a1", "text": "Act I", "chapters": [
            {"id": "c1", "text": "Chapter 1", "scenes": [
                {"id": "s1", "text": "Arrival", "beats": [
                    {"kind": "heading", "text": "Setup"},
                    {"text": "she steps off the train"},
                    {"text": "the town is silent"},
                    {"kind": "heading", "text": "Hook"},
                    {"text": "a scream from the inn"},
                ]},
                {"id": "s2", "text": "The Inn", "beats": [
                    {"text": "she finds the body"},
                ]},
            ]},
        ]},
    ],
}


class AxisOfTests(SimpleTestCase):
    def test_default_when_absent(self):
        self.assertEqual(g._axis_of({}), ("outline", "scene"))

    def test_reads_lens_axis(self):
        self.assertEqual(
            g._axis_of({"axis": {"walk": "thread", "tick": "beat"}}),
            ("thread", "beat"),
        )


class OutlineProviderTests(SimpleTestCase):
    def test_outline_scene_matches_flatten(self):
        ticks = g.resolve_ticks({"axis": {"walk": "outline", "tick": "scene"}},
                                GRAND, [], {"type": "story", "name": "x"})
        self.assertEqual([t["id"] for t in ticks], ["s1", "s2"])
        # each tick carries the scene's beats as `text`
        self.assertIn("she steps off the train", ticks[0]["text"])

    def test_outline_beat_skips_headings(self):
        ticks = g.resolve_ticks({"axis": {"walk": "outline", "tick": "beat"}},
                                GRAND, [], {"type": "story", "name": "x"})
        texts = [t["text"] for t in ticks]
        self.assertEqual(texts, [
            "she steps off the train", "the town is silent",
            "a scream from the inn", "she finds the body",
        ])
        # no heading text leaks in as a tick
        self.assertNotIn("Setup", texts)

    def test_outline_heading_groups_beats(self):
        ticks = g.resolve_ticks({"axis": {"walk": "outline", "tick": "heading"}},
                                GRAND, [], {"type": "story", "name": "x"})
        self.assertEqual([t["label"] for t in ticks], ["Setup", "Hook"])
        self.assertIn("the town is silent", ticks[0]["text"])

    def test_outline_act_aggregates(self):
        ticks = g.resolve_ticks({"axis": {"walk": "outline", "tick": "act"}},
                                GRAND, [], {"type": "story", "name": "x"})
        self.assertEqual(len(ticks), 1)
        self.assertIn("she finds the body", ticks[0]["text"])

    def test_unknown_pair_falls_back_to_scene(self):
        ticks = g.resolve_ticks({"axis": {"walk": "nope", "tick": "nope"}},
                                GRAND, [], {"type": "story", "name": "x"})
        self.assertEqual([t["id"] for t in ticks], ["s1", "s2"])


THREADS = [
    {"id": "ro1", "title": "The Romance", "scope": {"type": "story", "name": "x"},
     "items": [
         {"id": "it1", "kind": "heading", "text": "Meet"},
         {"id": "it2", "text": "they argue at the dock"},
         {"id": "it3", "text": "a reluctant truce"},
         {"id": "it4", "kind": "heading", "text": "Fall"},
         {"id": "it5", "text": "the letter changes everything"},
     ]},
    {"id": "ro2", "title": "The Heist", "items": [{"id": "z1", "text": "case the vault"}]},
]


class ThreadProviderTests(SimpleTestCase):
    def test_thread_beat_picks_the_referenced_thread(self):
        ticks = g.resolve_ticks({"axis": {"walk": "thread", "tick": "beat"}},
                                None, THREADS, {"type": "story", "name": "x"},
                                thread_ref="ro1")
        self.assertEqual([t["text"] for t in ticks], [
            "they argue at the dock", "a reluctant truce",
            "the letter changes everything",
        ])

    def test_thread_heading_groups(self):
        ticks = g.resolve_ticks({"axis": {"walk": "thread", "tick": "heading"}},
                                None, THREADS, {"type": "story", "name": "x"},
                                thread_ref="ro1")
        self.assertEqual([t["label"] for t in ticks], ["Meet", "Fall"])
        self.assertIn("a reluctant truce", ticks[0]["text"])

    def test_missing_thread_ref_is_empty(self):
        ticks = g.resolve_ticks({"axis": {"walk": "thread", "tick": "beat"}},
                                None, THREADS, {"type": "story", "name": "x"},
                                thread_ref="nope")
        self.assertEqual(ticks, [])


# The STORY walk reads scene PROSE (scene["content"], a TipTap doc in the same
# grand_outline blob) — not the planning beats. Same scenes as GRAND, with prose.
def _doc(*paras: str) -> dict:
    return {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in paras]}


GRAND_PROSE = {
    "acts": [
        {"id": "a1", "text": "Act I", "chapters": [
            {"id": "c1", "text": "Chapter 1", "scenes": [
                {"id": "s1", "text": "Arrival",
                 "beats": [{"text": "she arrives"}],
                 "content": _doc("She stepped off the train into silence.")},
                {"id": "s2", "text": "The Inn",
                 "content": _doc("The body lay behind the bar.")},
            ]},
            {"id": "c2", "text": "Chapter 2", "scenes": [
                {"id": "s3", "text": "Aftermath", "content": _doc("Morning came grey.")},
            ]},
        ]},
    ],
}


class StoryProviderTests(SimpleTestCase):
    def test_story_scene_reads_prose_not_beats(self):
        ticks = g.resolve_ticks({"axis": {"walk": "story", "tick": "scene"}},
                                GRAND_PROSE, [], {"type": "story", "name": "x"})
        self.assertEqual([t["id"] for t in ticks], ["s1", "s2", "s3"])
        self.assertIn("stepped off the train", ticks[0]["text"])
        # the prose, not the beat ("she arrives")
        self.assertNotIn("she arrives", ticks[0]["text"])

    def test_story_chapter_aggregates_scene_prose(self):
        ticks = g.resolve_ticks({"axis": {"walk": "story", "tick": "chapter"}},
                                GRAND_PROSE, [], {"type": "story", "name": "x"})
        self.assertEqual([t["id"] for t in ticks], ["c1", "c2"])
        # chapter 1 folds both its scenes' prose; chapter 2's stays separate
        self.assertIn("stepped off the train", ticks[0]["text"])
        self.assertIn("body lay behind the bar", ticks[0]["text"])
        self.assertNotIn("Morning", ticks[0]["text"])
        self.assertIn("Morning came grey", ticks[1]["text"])

    def test_story_scene_empty_when_unwritten(self):
        grand = {"acts": [{"text": "A", "chapters": [{"text": "C", "scenes": [
            {"id": "s9", "text": "blank"}]}]}]}
        ticks = g.resolve_ticks({"axis": {"walk": "story", "tick": "scene"}},
                                grand, [], {"type": "story", "name": "x"})
        self.assertEqual(ticks[0]["id"], "s9")
        self.assertEqual(ticks[0]["text"], "")


from unittest.mock import patch as _patch


class EmptyTickTests(SimpleTestCase):
    """An empty tick (e.g. an unwritten scene on the prose walk) must NOT be
    judged — scoring it would mean judging its label (the scene heading). It's
    marked null/unread and never reaches the model."""

    def test_empty_tick_is_null_order_kept_heading_not_sent(self):
        lens = {"name": "L", "analyse_head": "", "analyse_body": ""}
        y_items = [{"value": "calm"}, {"value": "tense"}]
        ticks = [
            {"id": "s1", "label": "Act → Ch → Written", "text": "She ran, terrified."},
            {"id": "s2", "label": "Act → Ch → EmptyHeading", "text": ""},   # unwritten
            {"id": "s3", "label": "Act → Ch → Calm", "text": "They rested by the fire."},
        ]
        sent = {}

        def fake_ask(prompt, **kw):
            sent["prompt"] = prompt
            return [   # deliberately OUT of tick order
                {"tick_id": "s3", "value": "calm", "confidence": 0.8, "reasoning": "y"},
                {"tick_id": "s1", "value": "tense", "confidence": 0.9, "reasoning": "x"},
            ]

        with _patch("gauges.engine._analyse.llm_utils.ask_json", side_effect=fake_ask):
            out = g._run_gauge_state_analyse(lens, {"type": "story", "name": "x"},
                                             y_items, ticks, "syn", [])
        # data_points stay in TICK ORDER even though the model answered out of order
        # (the mini-charts plot by array index, so order must match the ticks)
        self.assertEqual([p["tick_id"] for p in out["data_points"]], ["s1", "s2", "s3"])
        pts = {p["tick_id"]: p for p in out["data_points"]}
        self.assertEqual(pts["s1"]["value"], "tense")
        self.assertIsNone(pts["s2"]["value"])              # empty scene → null
        self.assertEqual(pts["s3"]["value"], "calm")
        # the empty scene's heading never reached the model
        self.assertNotIn("EmptyHeading", sent["prompt"])
        self.assertIn("She ran", sent["prompt"])

    def test_all_empty_skips_the_model(self):
        called = []

        def fake_ask(*a, **k):
            called.append(1)
            return []

        with _patch("gauges.engine._analyse.llm_utils.ask_json", side_effect=fake_ask):
            out = g._run_gauge_state_analyse(
                {"name": "L"}, {"type": "story", "name": "x"}, [{"value": "a"}],
                [{"id": "s1", "label": "X", "text": ""}], "syn", [])
        self.assertEqual(called, [])                        # the model is never asked
        self.assertIsNone(out["data_points"][0]["value"])


class ProseWalkContextTests(SimpleTestCase):
    """The prose (story) walk judges only the scene text — synopsis + braindumps
    are stripped from its prompt so the model can't attribute outside facts to a
    scene. Every other walk keeps that story-level context."""

    def _prompt_for(self, walk):
        lens = {"name": "L", "axis": {"walk": walk, "tick": "scene"}}
        ticks = [{"id": "s1", "label": "X", "text": "She ran."}]
        sent = {}

        def fake_ask(prompt, **kw):
            sent["prompt"] = prompt
            return []

        with _patch("gauges.engine._analyse.llm_utils.ask_json", side_effect=fake_ask):
            g._run_gauge_state_analyse(lens, {"type": "story", "name": "x"},
                                       [{"value": "a"}], ticks,
                                       "SECRET_SYNOPSIS", ["SECRET_BRAINDUMP"])
        return sent["prompt"]

    def test_prose_walk_omits_synopsis_and_braindumps(self):
        prompt = self._prompt_for("story")
        self.assertNotIn("SECRET_SYNOPSIS", prompt)
        self.assertNotIn("SECRET_BRAINDUMP", prompt)
        self.assertNotIn("SYNOPSIS:", prompt)

    def test_outline_walk_keeps_context(self):
        prompt = self._prompt_for("outline")
        self.assertIn("SECRET_SYNOPSIS", prompt)
        self.assertIn("SECRET_BRAINDUMP", prompt)


class AxisDefaultFillTests(SimpleTestCase):
    def test_resolved_template_lens_has_axis(self):
        # every shipped scene_mapped lens resolves with a default axis
        lens = next(iter(g.GAUGE_LENSES_BY_ID.values()))
        self.assertIn("axis", lens)
        self.assertEqual(lens["axis"]["walk"], "outline")
        self.assertEqual(lens["axis"]["tick"], "scene")

    def test_build_preset_default_fills_axis(self):
        preset = g.build_preset("p1", {"name": "P", "type": "arc",
                                       "y_items": [{"value": "a"}]})
        self.assertEqual(preset["axis"], {"walk": "outline", "tick": "scene"})

    def test_build_preset_keeps_explicit_axis(self):
        preset = g.build_preset("p2", {"name": "P", "type": "arc",
                                       "axis": {"walk": "thread", "tick": "beat"},
                                       "y_items": [{"value": "a"}]})
        self.assertEqual(preset["axis"], {"walk": "thread", "tick": "beat"})


from unittest.mock import patch


class AnalyseTickTests(SimpleTestCase):
    def _lens(self, walk, tick):
        return {"id": "L", "name": "L", "type_id": "arc", "data_style": "scene_mapped",
                "axis": {"walk": walk, "tick": tick}, "rules": []}

    def test_scene_mapped_emits_tick_id_and_scene_alias(self):
        y_items = [{"value": "calm"}, {"value": "tense"}]
        # one returned value per OUTLINE BEAT (4 leaf beats in GRAND)
        fake = [
            {"tick_id": "s1#b1", "value": "calm"},
            {"tick_id": "s1#b2", "value": "tense"},
            {"tick_id": "s1#b4", "value": "tense"},
            {"tick_id": "s2#b0", "value": "calm"},
        ]
        with patch("gauges.engine._analyse.llm_utils.ask_json", return_value=fake):
            out = g.run_gauge_analyse(self._lens("outline", "beat"),
                                      {"type": "story", "name": "x"}, y_items,
                                      GRAND, [], "syn", [])
        pts = out["data_points"]
        self.assertTrue(all("tick_id" in p and "scene_id" in p for p in pts))
        self.assertEqual({p["tick_id"] for p in pts},
                         {"s1#b1", "s1#b2", "s1#b4", "s2#b0"})
        # scene_id mirrors tick_id for FE back-compat
        self.assertEqual(pts[0]["tick_id"], pts[0]["scene_id"])

    def test_thread_walk_uses_thread_ref(self):
        y_items = [{"value": "warm"}, {"value": "cold"}]
        fake = [{"tick_id": "it2", "value": "cold"}, {"tick_id": "it3", "value": "warm"},
                {"tick_id": "it5", "value": "warm"}]
        with patch("gauges.engine._analyse.llm_utils.ask_json", return_value=fake):
            out = g.run_gauge_analyse(self._lens("thread", "beat"),
                                      {"type": "story", "name": "x"}, y_items,
                                      None, THREADS, "syn", [], thread_ref="ro1")
        self.assertEqual({p["tick_id"] for p in out["data_points"]},
                         {"it2", "it3", "it5"})


class WalksMenuTests(SimpleTestCase):
    def test_shared_exposes_walks(self):
        walks = g.GAUGE_SHARED.get("walks")
        self.assertIsInstance(walks, dict)
        self.assertIn("outline", walks)
        self.assertIn("thread", walks)
        # thread allows heading + beat ticks (matches FE WALKS)
        self.assertEqual(set(walks["thread"]["ticks"]), {"heading", "beat"})
        self.assertEqual(walks["outline"]["default"], "scene")
        # story (prose) walk ticks at scene + chapter granularity
        self.assertEqual(set(walks["story"]["ticks"]), {"scene", "chapter"})


import gauges.binding as gb


class BindThreadRefTests(SimpleTestCase):
    """Scope and walk are INDEPENDENT. A thread walk picks a thread for the
    x-axis (the ticks) IN ADDITION to the scope (the subject the AI judges):
    "for Mara, score each item of the Romance thread"."""

    def _store(self):
        # a CHARACTER-scope lens that walks a thread — scope (the character) and
        # the thread (the x-axis) are separate picks.
        return {"presets": {"p1": {
            "id": "p1", "source": "preset", "scope_type": "character",
            "type": "arc", "data_style": "scene_mapped",
            "axis": {"walk": "thread", "tick": "beat"}, "y_items": [{"value": "a"}],
        }}}

    def test_thread_walk_requires_thread_ref(self):
        # scope given, thread missing → still invalid (thread is a separate pick)
        with self.assertRaises(ValueError):
            gb.apply_bind(self._store(), ref={"kind": "preset", "id": "p1"},
                          scope_name="Mara")

    def test_thread_walk_keeps_scope_independent(self):
        new, bid = gb.apply_bind(self._store(), ref={"kind": "preset", "id": "p1"},
                                 scope_name="Mara", thread_ref="ro1")
        binding = next(b for b in new["bindings"] if b["binding_id"] == bid)
        # the subject stays the real scope — NOT the thread's title
        self.assertEqual(binding["scope_name"], "Mara")
        self.assertEqual(binding["scope_type"], "character")
        self.assertEqual(binding["thread_ref"], "ro1")

    def test_same_scope_different_threads_are_distinct(self):
        # "Mara across Romance" and "Mara across Heist" must be two bindings,
        # so thread_ref is part of the binding identity.
        new, bid1 = gb.apply_bind(self._store(), ref={"kind": "preset", "id": "p1"},
                                  scope_name="Mara", thread_ref="ro1")
        new, bid2 = gb.apply_bind(new, ref={"kind": "preset", "id": "p1"},
                                  scope_name="Mara", thread_ref="ro2")
        self.assertNotEqual(bid1, bid2)
        self.assertEqual(len(new["bindings"]), 2)

    def test_non_thread_walk_unaffected(self):
        gauges = {"presets": {"p2": {
            "id": "p2", "source": "preset", "scope_type": "story", "type": "arc",
            "data_style": "scene_mapped", "axis": {"walk": "outline", "tick": "scene"},
            "y_items": [{"value": "a"}]}}}
        new, bid = gb.apply_bind(gauges, ref={"kind": "preset", "id": "p2"})
        self.assertTrue(bid)  # no thread_ref needed

    def test_update_binding_allows_thread_ref(self):
        new, bid = gb.apply_bind(self._store(), ref={"kind": "preset", "id": "p1"},
                                 scope_name="Mara", thread_ref="ro1")
        out = gb.apply_update_binding(new, binding_id=bid, patch={"thread_ref": "ro2"})
        binding = next(b for b in out["bindings"] if b["binding_id"] == bid)
        self.assertEqual(binding["thread_ref"], "ro2")


class BuildBoardTicksTests(SimpleTestCase):
    def test_each_chart_carries_its_axis_and_ticks(self):
        presets = {"p1": {"id": "p1", "source": "preset", "type": "arc",
                          "data_style": "scene_mapped", "display": "ladder_line",
                          "axis": {"walk": "outline", "tick": "beat"},
                          "y_items": [{"value": "a"}]}}
        bindings = [{"binding_id": "b1", "ref": {"kind": "preset", "id": "p1"},
                     "scope_type": "story", "scope_name": "x"}]
        board = g.build_board(bindings=bindings, presets=presets, analyses={},
                              grand_outline=GRAND, threads=[])
        chart = board["charts"][0]
        self.assertEqual(chart["axis"], {"walk": "outline", "tick": "beat"})
        # beat walk → one tick per leaf beat
        self.assertEqual(len(chart["ticks"]), 4)
        # union scenes still emitted for back-compat
        self.assertEqual([s["id"] for s in board["scenes"]], ["s1", "s2"])

    def test_thread_walk_chart_carries_thread_label(self):
        presets = {"p1": {"id": "p1", "source": "preset", "type": "arc",
                          "data_style": "scene_mapped", "display": "ladder_line",
                          "axis": {"walk": "thread", "tick": "beat"},
                          "y_items": [{"value": "a"}]}}
        bindings = [{"binding_id": "p1|character|Mara", "ref": {"kind": "preset", "id": "p1"},
                     "scope_type": "character", "scope_name": "Mara", "thread_ref": "ro1"}]
        board = g.build_board(bindings=bindings, presets=presets, analyses={},
                              grand_outline=None, threads=THREADS)
        chart = board["charts"][0]
        self.assertEqual(chart["thread_ref"], "ro1")
        self.assertEqual(chart["thread_label"], "The Romance")  # resolved from threads


class BuildBoardHasContentTests(SimpleTestCase):
    """SA-270: `has_content` tells the UI whether there's anything to read, so it
    can say "Nothing to read yet". Never guessed from `ticks`: coverage lenses
    always send ticks=[]."""

    EMPTY = {"acts": [{"id": "a1", "text": "Act I", "chapters": [
        {"id": "c1", "text": "Chapter 1", "scenes": [{"id": "s1", "text": "Untitled", "beats": []}]}]}]}

    def _chart(self, data_style, grand):
        presets = {"p1": {"id": "p1", "source": "preset", "type": "checklist",
                          "data_style": data_style, "y_items": [{"value": "a"}]}}
        bindings = [{"binding_id": "b1", "ref": {"kind": "preset", "id": "p1"},
                     "scope_type": "story", "scope_name": "x"}]
        return g.build_board(bindings=bindings, presets=presets, analyses={},
                             grand_outline=grand, threads=[])["charts"][0]

    def test_coverage_lens_on_a_written_book_has_content(self):
        chart = self._chart("coverage", GRAND)
        self.assertEqual(chart["ticks"], [])
        self.assertTrue(chart["has_content"])

    def test_coverage_lens_on_an_empty_book_has_none(self):
        self.assertFalse(self._chart("coverage", self.EMPTY)["has_content"])
        self.assertFalse(self._chart("coverage", None)["has_content"])

    def test_scene_mapped_lens_follows_its_ticks(self):
        self.assertTrue(self._chart("scene_mapped", GRAND)["has_content"])
        self.assertFalse(self._chart("scene_mapped", self.EMPTY)["has_content"])


class UpdatePresetWipesAnalysesTests(SimpleTestCase):
    """Editing a preset's config invalidates every bound instance's analysis —
    the stored data_points were computed under the OLD config. Wipe them all
    (each lens then shows "not read yet" until the author runs it, SA-270)."""

    def _store(self):
        return {
            "presets": {"p1": {
                "id": "p1", "source": "preset", "scope_type": "character",
                "type": "arc", "data_style": "scene_mapped",
                "axis": {"walk": "outline", "tick": "scene"}, "y_items": [{"value": "a"}]}},
            "bindings": [
                {"binding_id": "p1|character|Mara", "ref": {"kind": "preset", "id": "p1"},
                 "scope_type": "character", "scope_name": "Mara"},
                {"binding_id": "p1|character|Jon", "ref": {"kind": "preset", "id": "p1"},
                 "scope_type": "character", "scope_name": "Jon"},
            ],
            "analyses": {
                "p1|character|Mara": {"data_points": [{"tick_id": "s1", "value": "a"}], "verdict": "x"},
                "p1|character|Jon": {"data_points": [{"tick_id": "s1", "value": "a"}], "verdict": "y"},
                "other|story|x": {"data_points": [], "verdict": "z"},
            },
        }

    def test_update_preset_wipes_its_bindings_analyses(self):
        out = gb.apply_update_preset(self._store(), preset_id="p1",
                                     patch={"axis": {"walk": "outline", "tick": "beat"}})
        self.assertNotIn("p1|character|Mara", out["analyses"])
        self.assertNotIn("p1|character|Jon", out["analyses"])

    def test_update_preset_leaves_other_presets_analyses(self):
        out = gb.apply_update_preset(self._store(), preset_id="p1",
                                     patch={"axis": {"walk": "outline", "tick": "beat"}})
        self.assertIn("other|story|x", out["analyses"])
