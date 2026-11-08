"""wrt-46: moving an act / chapter / scene / beat marks a lens outdated — but
only a lens whose walk reads what moved (order fingerprint)."""
import copy

from django.test import SimpleTestCase

import gauges.binding as gb
import gauges.engine as g

GRAND = {"acts": [
    {"id": "a1", "text": "Act I", "chapters": [
        {"id": "c1", "text": "Chapter 1", "scenes": [
            {"id": "s1", "text": "Arrival", "beats": [
                {"id": "b1", "text": "she steps off the train"},
                {"id": "b2", "text": "the town is silent"},
            ]},
            {"id": "s2", "text": "The Inn", "beats": [{"id": "b3", "text": "she finds the body"}]},
        ]},
        {"id": "c2", "text": "Chapter 2", "scenes": [
            {"id": "s3", "text": "Morning", "beats": [{"id": "b4", "text": "the sheriff comes"}]},
        ]},
    ]},
]}
THREADS = [{"id": "ro1", "title": "The Romance", "items": [
    {"id": "t1", "text": "they argue"}, {"id": "t2", "text": "a truce"}]}]

AXES = {
    "outline": {"walk": "outline", "tick": "scene"},
    "story": {"walk": "story", "tick": "scene"},
    "thread": {"walk": "thread", "tick": "beat"},
}
RAN = "2026-10-19T10:00:00.000000Z"


def _swap(items, i, j):
    items[i], items[j] = items[j], items[i]


def _board(grand, threads):
    """One scene-mapped lens per walk, each analysed against GRAND/THREADS."""
    presets, bindings, analyses = {}, [], {}
    for walk, axis in AXES.items():
        lens = {"id": walk, "source": "preset", "type": "arc", "data_style": "scene_mapped",
                "display": "ladder_line", "axis": axis, "y_items": [{"value": "a"}]}
        presets[walk] = lens
        bindings.append({"binding_id": walk, "ref": {"kind": "preset", "id": walk},
                         "scope_type": "story", "scope_name": "x",
                         "thread_ref": "ro1" if walk == "thread" else ""})
        analyses[walk] = {"analysed_at": RAN, "order_fp": g.order_fingerprint(
            lens, GRAND, THREADS, "ro1" if walk == "thread" else "")}
    board = g.build_board(bindings=bindings, presets=presets, analyses=analyses,
                          grand_outline=grand, threads=threads)
    return {c["binding_id"]: c for c in board["charts"]}


class OrderFingerprintTests(SimpleTestCase):
    def test_nothing_moved_nothing_stale(self):
        charts = _board(GRAND, THREADS)
        self.assertFalse(any(c["stale"] for c in charts.values()))
        self.assertEqual(charts["outline"]["stale_reason"], "")

    def test_moving_a_scene_marks_outline_and_story_lenses(self):
        grand = copy.deepcopy(GRAND)
        _swap(grand["acts"][0]["chapters"][0]["scenes"], 0, 1)
        charts = _board(grand, THREADS)
        self.assertTrue(charts["outline"]["stale"])
        self.assertTrue(charts["story"]["stale"])
        self.assertFalse(charts["thread"]["stale"])   # reads a thread, not the outline
        self.assertEqual(charts["outline"]["stale_reason"], "order changed since this lens ran")
        self.assertEqual(charts["outline"]["stale_ticks"], [])   # per-tick check unchanged

    def test_moving_a_chapter_marks_outline_and_story_lenses(self):
        grand = copy.deepcopy(GRAND)
        _swap(grand["acts"][0]["chapters"], 0, 1)
        charts = _board(grand, THREADS)
        self.assertTrue(charts["outline"]["stale"])
        self.assertTrue(charts["story"]["stale"])
        self.assertFalse(charts["thread"]["stale"])

    def test_dragging_a_beat_marks_only_the_outline_lens(self):
        grand = copy.deepcopy(GRAND)
        _swap(grand["acts"][0]["chapters"][0]["scenes"][0]["beats"], 0, 1)
        charts = _board(grand, THREADS)
        self.assertTrue(charts["outline"]["stale"])
        self.assertFalse(charts["story"]["stale"])    # reads prose, not beats
        self.assertFalse(charts["thread"]["stale"])

    def test_moving_a_thread_beat_marks_only_the_thread_lens(self):
        threads = copy.deepcopy(THREADS)
        _swap(threads[0]["items"], 0, 1)
        charts = _board(GRAND, threads)
        self.assertTrue(charts["thread"]["stale"])
        self.assertFalse(charts["outline"]["stale"])
        self.assertFalse(charts["story"]["stale"])

    def test_analysis_without_fingerprint_is_not_stale(self):
        grand = copy.deepcopy(GRAND)
        _swap(grand["acts"][0]["chapters"], 0, 1)
        presets = {"p": {"id": "p", "source": "preset", "type": "arc",
                         "data_style": "scene_mapped", "y_items": [{"value": "a"}]}}
        bindings = [{"binding_id": "b", "ref": {"kind": "preset", "id": "p"},
                     "scope_type": "story", "scope_name": "x"}]
        chart = g.build_board(bindings=bindings, presets=presets,
                              analyses={"b": {"analysed_at": RAN}},
                              grand_outline=grand, threads=[])["charts"][0]
        self.assertFalse(chart["stale"])

    def test_store_analysis_keeps_the_fingerprint(self):
        out = gb.store_analysis({}, binding_id="b", analysis={"ran_at": RAN, "order_fp": "abc"})
        self.assertEqual(out["analyses"]["b"]["order_fp"], "abc")
