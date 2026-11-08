"""load_gauges / save_gauges over the gauge tables, and the gauge capabilities
running on top of them.

save_gauges takes the whole dict (the shape the old GaugeStore blob held) and
syncs it into rows; load_gauges gives the same dict back."""
import copy
from types import SimpleNamespace
from unittest import mock

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from characters.models import Character
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from outline.models import Act, Chapter, Scene
from projects.models import Project

import gauges.capabilities.execute as exg
from gauges.capabilities.commit import (
    commit_analyse_gauge,
    commit_save_gauges,
)
from gauges.models import (
    GaugeAnalysis,
    GaugeBinding,
    GaugeCandidate,
    GaugeDataPoint,
    GaugePreset,
)
from gauges.readers import load_gauges as load_ctx
from gauges.readers import resolve_binding
from gauges.store import load_gauges, save_gauges

GAUGES = {
    "presets": {
        "hero-grow": {
            "id": "hero-grow", "name": "Does the hero grow?", "type_id": "arc",
            "type": "arc", "source": "preset", "from": "custom",
            "axis": {"walk": "outline", "tick": "scene"},
            "y_items": [{"value": "flat", "description": ""}, {"value": "grown"}],
            "rules": ["rise"], "judges": True, "glyph": None,
        },
        "odd-key": {"id": "not-the-key", "name": "", "y_items": []},
    },
    "bindings": [
        {"binding_id": "hero-grow|story|the whole story",
         "ref": {"kind": "preset", "id": "hero-grow"}, "source": "preset",
         "scope_type": "story", "scope_name": "the whole story",
         "bound_at": "2026-09-05T18:09:04.545022+00:00", "visual": "line"},
        {"binding_id": "hero-grow|pair|Mara – Tom|ro-1",
         "ref": {"kind": "preset", "id": "hero-grow"}, "source": "preset",
         "scope_type": "pair", "scope_name": "Mara – Tom", "pair": ["Mara", "Tom"],
         "thread_ref": "ro-1", "block_key": "Magic", "report_view": "list",
         "bound_at": "2026-09-05T18:09:04Z"},   # not isoformat() text → kept as is
    ],
    "suggested": [
        {"id": "pacing", "lens_id": "pacing", "scope_type": "story",
         "scope_name": "the whole story", "reason": "slow middle", "fit": 0.8},
    ],
    "invented": [{"id": "secret-lens", "name": "Secrets", "type": "checklist"}],
    "analyses": {
        "hero-grow|story|the whole story": {
            "data_points": [
                {"tick_id": "sc-1", "scene_id": "sc-1", "value": "flat",
                 "values": ["flat"], "confidence": 0.9, "reasoning": "same as ever"},
                {"tick_id": "sc-2", "scene_id": "sc-2", "value": None,
                 "values": [], "confidence": 0.0, "reasoning": ""},
            ],
            "coverage": [], "pairs": [], "rules": ["rise"], "rules_applied": ["rise"],
            "rules_deferred": [], "offending": [], "score": 1, "deferred": False,
            "partial": False, "verdict": "It grows.",
            "analysed_at": "2026-06-21T17:55:00.000000+00:00",
        },
        "hero-grow|pair|Mara – Tom|ro-1": {
            "data_points": [], "score": None, "verdict": None,
            "analysed_at": "2026-09-05T18:09:04+00:00",
        },
    },
}

ARC = {"name": "Hero Grow", "type": "arc", "scope_type": "character",
       "axis": {"walk": "outline", "tick": "scene"},
       "y_items": [{"value": "flat"}, {"value": "grown"}]}


def _writes(q):
    return [x["sql"] for x in q.captured_queries
            if x["sql"].split()[0] in ("INSERT", "UPDATE", "DELETE")]


class _Base(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email="gs@x.io", password="pw")
        self.project = Project.objects.create(user=user, title="P")
        self.pid = self.project.id
        self.ctx = SimpleNamespace(project_id=self.pid)
        self.scope = ProjectScope(self.pid)

    def make_scenes(self, *uids):
        act = Act.objects.create(project=self.project, uid="ac-1")
        ch = Chapter.objects.create(project=self.project, act=act, uid="ch-1")
        return [Scene.objects.create(project=self.project, chapter=ch, uid=u, position=i)
                for i, u in enumerate(uids)]

    def run_cap(self, name, args):
        res = dispatch(name, args, Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "ran", res.error)
        return res.result


class RoundTripTest(_Base):
    def test_round_trip_is_exact(self):
        save_gauges(self.pid, copy.deepcopy(GAUGES))
        self.assertEqual(load_gauges(self.pid), GAUGES)
        self.assertEqual(GaugePreset.objects.count(), 2)
        self.assertEqual(GaugeBinding.objects.count(), 2)
        self.assertEqual(GaugeCandidate.objects.count(), 2)
        self.assertEqual(GaugeAnalysis.objects.count(), 2)
        self.assertEqual(GaugeDataPoint.objects.count(), 2)

    def test_round_trip_is_exact_with_linked_scenes(self):
        self.make_scenes("sc-1", "sc-2")
        save_gauges(self.pid, copy.deepcopy(GAUGES))
        self.assertEqual(load_gauges(self.pid), GAUGES)

    def test_values_land_in_real_columns(self):
        sc1, _ = self.make_scenes("sc-1", "sc-2")
        save_gauges(self.pid, copy.deepcopy(GAUGES))
        b = GaugeBinding.objects.get(binding_id="hero-grow|story|the whole story")
        self.assertEqual((b.ref_kind, b.ref_id, b.scope_type), ("preset", "hero-grow", "story"))
        self.assertEqual(b.extra, {"visual": "line"})
        a = b.analysis
        self.assertEqual((a.verdict, a.analysed_at.year), ("It grows.", 2026))
        self.assertEqual(a.points.first().scene, sc1)
        self.assertNotIn("scene_id", a.points.first().extra)

    def test_resaving_unchanged_dict_writes_nothing(self):
        save_gauges(self.pid, copy.deepcopy(GAUGES))
        loaded = load_gauges(self.pid)
        with CaptureQueriesContext(connection) as q:
            save_gauges(self.pid, loaded)
        self.assertEqual(_writes(q), [])

    def test_an_edit_writes_only_its_row(self):
        save_gauges(self.pid, copy.deepcopy(GAUGES))
        g = load_gauges(self.pid)
        g["bindings"][0]["visual"] = "bars"
        with CaptureQueriesContext(connection) as q:
            save_gauges(self.pid, g)
        self.assertEqual(len(_writes(q)), 1)
        self.assertEqual(load_gauges(self.pid), g)

    def test_dropping_entries_deletes_their_rows(self):
        save_gauges(self.pid, copy.deepcopy(GAUGES))
        g = load_gauges(self.pid)
        g["bindings"] = g["bindings"][1:]   # its analysis goes with it
        g["suggested"] = []
        del g["presets"]["odd-key"]
        save_gauges(self.pid, g)
        g["analyses"].pop("hero-grow|story|the whole story")
        self.assertEqual(load_gauges(self.pid), g)
        self.assertEqual(GaugeDataPoint.objects.count(), 0)

    def test_empty_project_loads_empty_sections(self):
        self.assertEqual(load_gauges(self.pid), {"presets": {}, "bindings": [], "suggested": [],
                                                 "invented": [], "analyses": {}})


class SceneLinkTest(_Base):
    BID = "hero-grow|story|the whole story"

    def _gauges(self, n):
        g = copy.deepcopy(GAUGES)
        g["analyses"][self.BID]["data_points"] = [
            {"tick_id": f"sc-{i}", "scene_id": f"sc-{i}", "value": "flat"} for i in range(n)]
        return g

    def test_unknown_scene_uid_is_kept_as_text(self):
        self.make_scenes("sc-1")
        save_gauges(self.pid, copy.deepcopy(GAUGES))   # sc-2 has no scene row
        p = GaugeDataPoint.objects.get(tick_id="sc-2")
        self.assertIsNone(p.scene_id)
        self.assertEqual(p.extra["scene_id"], "sc-2")
        self.assertEqual(load_gauges(self.pid), GAUGES)

    def test_deleting_a_scene_deletes_its_points(self):
        scenes = self.make_scenes("sc-0", "sc-1", "sc-2")
        save_gauges(self.pid, self._gauges(3))
        scenes[1].delete()
        pts = load_gauges(self.pid)["analyses"][self.BID]["data_points"]
        self.assertEqual([p["scene_id"] for p in pts], ["sc-0", "sc-2"])

    def test_save_after_a_scene_delete_closes_the_gap(self):
        scenes = self.make_scenes("sc-0", "sc-1", "sc-2")
        save_gauges(self.pid, self._gauges(3))
        scenes[1].delete()                     # positions are now 0 and 2
        Scene.objects.create(project=self.project, chapter=scenes[0].chapter, uid="sc-1")
        save_gauges(self.pid, self._gauges(3))   # would clash on position 2 if not renumbered
        pts = GaugeDataPoint.objects.order_by("position")
        self.assertEqual([(p.position, p.scene.uid) for p in pts],
                         [(0, "sc-0"), (1, "sc-1"), (2, "sc-2")])


class CapabilityFlowTest(_Base):
    def _preset(self):
        return self.run_cap("create_preset", dict(ARC))["preset_id"]

    def test_bind_update_unbind(self):
        pid = self._preset()
        bid = self.run_cap("bind_gauge", {"ref": {"kind": "preset", "id": pid},
                                          "scope_type": "story"})["binding_id"]
        self.run_cap("set_gauge_view", {"binding_id": bid, "visual": "bars"})
        g = load_ctx(self.ctx)
        self.assertEqual([b["binding_id"] for b in g["bindings"]], [bid])
        self.assertEqual(g["bindings"][0]["visual"], "bars")
        self.run_cap("unbind_gauge", {"binding_id": bid})
        self.assertEqual(load_ctx(self.ctx)["bindings"], [])
        self.assertIn(pid, load_ctx(self.ctx)["presets"])  # the preset survives

    def test_bind_runs_no_ai(self):
        # SA-270: attaching a lens is free. Binding only writes config; the
        # analysis (and scale extract) run only when the author asks for them.
        pid = self._preset()
        with mock.patch("gauges.engine.run_gauge_analyse") as analyse, \
                mock.patch("gauges.engine.run_gauge_extract") as extract:
            bid = self.run_cap("bind_gauge", {"ref": {"kind": "preset", "id": pid},
                                              "scope_type": "story"})["binding_id"]
        analyse.assert_not_called()
        extract.assert_not_called()
        self.assertNotIn(bid, load_ctx(self.ctx).get("analyses") or {})

    def test_analyse_stores_points_and_replaces_them(self):
        pid = self._preset()
        bid = self.run_cap("bind_gauge", {"ref": {"kind": "preset", "id": pid},
                                          "scope_type": "story"})["binding_id"]
        pts = [{"tick_id": f"sc-{i}", "scene_id": f"sc-{i}", "value": "flat",
                "values": ["flat"], "confidence": 0.5, "reasoning": "r"} for i in range(5)]
        fake = {"data_points": pts, "verdict": "flat all the way", "score": 0.0,
                "ran_at": "2026-10-01T10:00:00+00:00"}
        with mock.patch("gauges.engine.run_gauge_analyse", return_value=fake), \
                mock.patch("actions.capabilities.dispatch._ai_gate", return_value=None):
            self.run_cap("analyse_gauge", {"binding_id": bid})
        a = load_ctx(self.ctx)["analyses"][bid]
        self.assertEqual(a["data_points"], pts)
        self.assertEqual(a["verdict"], "flat all the way")
        # Re-analysing replaces the points (one per tick), it never piles them up.
        commit_analyse_gauge(self.ctx, {"_binding_id": bid, "data_points": pts[:2]})
        self.assertEqual(GaugeDataPoint.objects.filter(analysis__binding__binding_id=bid).count(), 2)
        self.assertEqual(load_ctx(self.ctx)["analyses"][bid]["data_points"], pts[:2])
        self.run_cap("unbind_gauge", {"binding_id": bid})
        self.assertEqual(GaugeAnalysis.objects.count(), 0)
        self.assertEqual(GaugeDataPoint.objects.count(), 0)

    def test_suggest_accept_dismiss(self):
        suggest = exg._suggest(
            lambda *a: None,
            lambda _res: [{"lens_id": "story_skeleton", "scope_type": "story",
                           "reason": "r", "fit": 0.9}],
            "suggested")
        commit_save_gauges(self.ctx, suggest(self.ctx, {"elements": {}}))
        sug = load_ctx(self.ctx)["suggested"]
        self.assertEqual(len(sug), 1)
        sid = sug[0]["id"]
        with mock.patch.dict("gauges.engine.GAUGE_LENSES_BY_ID",
                             {"story_skeleton": dict(ARC)}):
            pid = self.run_cap("accept_suggestion", {"id": sid})["preset_id"]
        self.assertIn(pid, load_ctx(self.ctx)["presets"])
        self.run_cap("dismiss_suggestion", {"id": sid})
        self.assertEqual(load_ctx(self.ctx)["suggested"], [])


class CharacterRenameTest(_Base):
    def setUp(self):
        super().setUp()
        self.aelden = Character.objects.create(project=self.project, name="Prince Aelden",
                                               aliases=[{"name": "Al"}])
        self.preset = self.run_cap("create_preset", dict(ARC))["preset_id"]
        self.bid = self.run_cap("bind_gauge", {"ref": {"kind": "preset", "id": self.preset},
                                               "scope_type": "character",
                                               "scope_name": "Prince Aelden"})["binding_id"]
        commit_analyse_gauge(self.ctx, {"_binding_id": self.bid, "verdict": "grows"})

    def test_binding_links_the_character(self):
        self.assertEqual(GaugeBinding.objects.get(binding_id=self.bid).character, self.aelden)

    def test_rename_shows_up_and_analysis_stays_addressable(self):
        self.aelden.name = "King Aelden"
        self.aelden.save()
        g = load_ctx(self.ctx)
        self.assertEqual(g["bindings"][0]["scope_name"], "King Aelden")
        self.assertEqual(g["bindings"][0]["binding_id"], self.bid)   # the key never changes
        self.assertEqual(g["analyses"][self.bid]["verdict"], "grows")
        self.assertEqual(resolve_binding(self.ctx, self.bid)["scope"]["name"], "King Aelden")
        # Binding the same lens to the new name reuses that gauge.
        again = self.run_cap("bind_gauge", {"ref": {"kind": "preset", "id": self.preset},
                                            "scope_type": "character",
                                            "scope_name": "King Aelden"})["binding_id"]
        self.assertEqual(again, self.bid)
        self.assertEqual(GaugeBinding.objects.count(), 1)

    def test_rename_then_unchanged_save_keeps_the_link(self):
        self.aelden.name = "King Aelden"
        self.aelden.save()
        save_gauges(self.pid, load_gauges(self.pid))
        b = GaugeBinding.objects.get(binding_id=self.bid)
        self.assertEqual((b.character_id, b.scope_name), (self.aelden.id, "King Aelden"))

    def test_alias_links_too(self):
        bid = self.run_cap("bind_gauge", {"ref": {"kind": "preset", "id": self.preset},
                                          "scope_type": "character",
                                          "scope_name": "Al"})["binding_id"]
        self.assertEqual(GaugeBinding.objects.get(binding_id=bid).character, self.aelden)

    def test_hard_delete_keeps_the_last_name_as_label(self):
        self.aelden.name = "King Aelden"
        self.aelden.save()
        save_gauges(self.pid, load_gauges(self.pid))   # refreshes the stored label
        Character.all_objects.filter(pk=self.aelden.pk).delete()
        g = load_ctx(self.ctx)
        self.assertEqual(g["bindings"][0]["scope_name"], "King Aelden")
        self.assertIsNone(GaugeBinding.objects.get(binding_id=self.bid).character_id)
