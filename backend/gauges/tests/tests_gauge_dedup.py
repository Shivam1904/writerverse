"""Gauge store idempotency — the two uniqueness invariants.

  1. No two PRESETS for the exact same config fields. Attaching the same lens
     twice reuses the existing preset (a different walk / scale is a *different*
     preset and may coexist).
  2. No two BINDINGS for the same (preset, scope, thread) — which, because the
     walk lives in the preset's axis, means no duplicate (lens, scope, walk,
     thread).

Pure transforms over the loose `gauges` dict — no Django DB needed.
"""
from django.test import SimpleTestCase

import gauges.binding as gb


def _arc(name="Hero Grow", walk="outline", tick="scene"):
    return {
        "name": name, "type": "arc", "scope_type": "character",
        "axis": {"walk": walk, "tick": tick},
        "y_items": [{"value": "flat"}, {"value": "grown"}],
    }


class PresetDedupTests(SimpleTestCase):
    def test_identical_config_reuses_preset(self):
        g, p1 = gb.apply_create_preset({}, config=_arc())
        g, p2 = gb.apply_create_preset(g, config=_arc())
        self.assertEqual(p1, p2)
        self.assertEqual(len(g["presets"]), 1)

    def test_provenance_does_not_split_presets(self):
        # same fields, different `from` provenance → still one preset.
        g, p1 = gb.apply_create_preset({}, config={**_arc(), "from": "template:a"})
        g, p2 = gb.apply_create_preset(g, config={**_arc(), "from": "custom"})
        self.assertEqual(p1, p2)
        self.assertEqual(len(g["presets"]), 1)

    def test_different_walk_is_a_distinct_preset(self):
        g, p1 = gb.apply_create_preset({}, config=_arc(walk="outline", tick="scene"))
        g, p2 = gb.apply_create_preset(g, config=_arc(walk="chapter", tick="chapter"))
        self.assertNotEqual(p1, p2)
        self.assertEqual(len(g["presets"]), 2)


class BindingDedupTests(SimpleTestCase):
    def test_same_scope_walk_thread_reuses_binding(self):
        g, pid = gb.apply_create_preset({}, config=_arc())
        ref = {"kind": "preset", "id": pid}
        g, b1 = gb.apply_bind(g, ref=ref, scope_type="character", scope_name="Tony")
        g, b2 = gb.apply_bind(g, ref=ref, scope_type="character", scope_name="Tony")
        self.assertEqual(b1, b2)
        self.assertEqual(len(g["bindings"]), 1)

    def test_different_thread_is_a_distinct_binding(self):
        g, pid = gb.apply_create_preset({}, config=_arc(walk="thread", tick="beat"))
        ref = {"kind": "preset", "id": pid}
        g, b1 = gb.apply_bind(g, ref=ref, scope_type="character", scope_name="Tony", thread_ref="t1")
        g, b2 = gb.apply_bind(g, ref=ref, scope_type="character", scope_name="Tony", thread_ref="t2")
        self.assertNotEqual(b1, b2)
        self.assertEqual(len(g["bindings"]), 2)

    def test_full_attach_twice_yields_one_preset_one_binding(self):
        """End-to-end: attaching the same lens to the same scope twice (create_preset
        + bind each time) leaves exactly one preset and one binding."""
        g = {}
        for _ in range(2):
            g, pid = gb.apply_create_preset(g, config=_arc())
            g, _bid = gb.apply_bind(g, ref={"kind": "preset", "id": pid},
                                    scope_type="character", scope_name="Tony")
        self.assertEqual(len(g["presets"]), 1)
        self.assertEqual(len(g["bindings"]), 1)
