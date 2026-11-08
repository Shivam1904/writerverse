"""The lens bank is two reads (SA-261): the static shared catalogue and the
author's small presets list.

Before, one `get_gauge_bank` call shipped ~136 KB (the whole catalogue, each
lens twice: once flattened, once inside its raw `eyes` blob) and loaded every
gauge analysis + data point just to return the presets. It was refetched on
every `gauges` restale, which every World edit triggers."""
import json
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from projects.models import Project

from gauges.readers import get_gauge_catalogue, get_gauge_presets
from gauges.store import save_gauges

# The catalogue was ~136 KB with `eyes` and the per-type copies; ~65 KB without.
# The cap leaves room for new lenses but catches the duplicate blob coming back.
CATALOGUE_MAX_BYTES = 90_000


class GaugeCatalogueTests(SimpleTestCase):
    def test_catalogue_is_small(self):
        size = len(json.dumps(get_gauge_catalogue()))
        self.assertLess(size, CATALOGUE_MAX_BYTES)

    def test_lenses_carry_the_flat_fields_not_the_eyes_blob(self):
        cat = get_gauge_catalogue()
        lenses = [lens for t in cat["types"] for lens in t["lenses"]]
        self.assertTrue(lenses)
        for lens in lenses:
            self.assertNotIn("eyes", lens)
        # What the bank card, decide card and custom dialog read is still there.
        first = lenses[0]
        for key in ("id", "name", "question", "type_id", "scope_type", "y_items",
                    "watches", "read_as", "good", "off", "analyse_head", "rules"):
            self.assertIn(key, first)

    def test_types_are_slim_groups(self):
        for t in get_gauge_catalogue()["types"]:
            self.assertEqual(set(t), {"id", "kind_word", "lenses"})

    def test_catalogue_has_no_presets(self):
        self.assertNotIn("presets", get_gauge_catalogue())


class GaugePresetsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user = get_user_model().objects.create_user(email="bank@test.com", password="x")
        cls.project = Project.objects.create(title="B", user=user)
        save_gauges(cls.project.id, {
            "presets": {
                "p1": {"id": "p1", "name": "Mine", "type_id": "arc", "type": "arc",
                       "source": "preset", "y_items": []},
                "p2": {"id": "p2", "name": "Also mine", "type_id": "tracker",
                       "type": "tracker", "source": "preset", "y_items": []},
            },
            "bindings": [
                {"binding_id": "p1|story|the whole story",
                 "ref": {"kind": "preset", "id": "p1"},
                 "scope_type": "story", "scope_name": "the whole story"},
            ],
            "analyses": {
                "p1|story|the whole story": {
                    "verdict": "ok", "data_points": [{"tick_id": "t1", "value": 1.0}]},
            },
        })

    def test_presets_in_one_query(self):
        ctx = SimpleNamespace(project_id=self.project.id)
        with self.assertNumQueries(1):
            out = get_gauge_presets(ctx)
        self.assertEqual([p["id"] for p in out["presets"]], ["p1", "p2"])
        self.assertEqual(out["presets"][0]["name"], "Mine")

    def test_caps_are_registered(self):
        sess = ProjectScope(self.project.id)
        cat = dispatch("get_gauge_catalogue", {}, Actor.USER_BUTTON, sess)
        presets = dispatch("get_gauge_presets", {}, Actor.USER_BUTTON, sess)
        self.assertEqual(cat.status, "ran", cat.error)
        self.assertEqual(presets.status, "ran", presets.error)
        self.assertTrue(cat.result["types"])
        self.assertEqual(len(presets.result["presets"]), 2)
