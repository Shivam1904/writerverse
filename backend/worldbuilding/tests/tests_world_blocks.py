"""World blocks (generic World-page sections) — reader + writer capabilities.

A block = a heading whose items are the worldbuilding rows TAGGED with it
(``Worldbuilding.tags``, the same list the World page groups by). Known headings
(Locations, …) are always offered; author-added headings persist as
``WorldBlock`` rows. See worldbuilding/block_readers.py.

Capabilities are exercised through ``dispatch()`` directly (the convention in
tests_consistency_tables.py) — the same gather→commit→bookkeep path the HTTP
facade runs, without the HTTP-auth round-trip.
"""
from __future__ import annotations

from unittest import TestCase as PlainTestCase

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from projects.models import Project

from worldbuilding.block_readers import _merge_blocks, block_key
from worldbuilding.models import WorldBlock, Worldbuilding
from worldbuilding.store import load_world_blocks


class WorldBlockMergeTest(PlainTestCase):
    """Pure merge/key logic — no DB."""

    def test_block_key_normalises(self):
        self.assertEqual(block_key("  Sacred  Sites "), "sacred sites")
        self.assertEqual(block_key("Places"), "places")
        self.assertEqual(block_key(None), "")

    def test_merge_orders_known_then_custom_then_implicit(self):
        counts = {"places": 2, "prophecies": 1}
        labels = {"places": "Places", "prophecies": "Prophecies"}
        custom = [{"name": "calendar", "label": "Calendar"}]
        blocks = _merge_blocks(counts, labels, custom)
        by_name = {b["name"]: b for b in blocks}

        # known always present, with live count folded in
        self.assertTrue(by_name["places"]["known"])
        self.assertEqual(by_name["places"]["count"], 2)
        # custom present, empty, flagged custom
        self.assertTrue(by_name["calendar"]["custom"])
        self.assertEqual(by_name["calendar"]["count"], 0)
        # implicit (a tag in use, not known/custom)
        self.assertFalse(by_name["prophecies"]["known"])
        self.assertFalse(by_name["prophecies"]["custom"])
        self.assertEqual(by_name["prophecies"]["count"], 1)

        # ordering: known precedes custom precedes implicit
        order = [b["name"] for b in blocks]
        self.assertLess(order.index("places"), order.index("calendar"))
        self.assertLess(order.index("calendar"), order.index("prophecies"))

    def test_merge_dedupes_custom_against_known(self):
        # an author-added "Places" must not double the known one
        blocks = _merge_blocks({}, {}, [{"name": "Places"}])
        names = [b["name"] for b in blocks]
        self.assertEqual(names.count("places"), 1)

    def test_merge_overlays_heading_overrides(self):
        # An author override entry recolours/renames/re-hints a known block; the
        # raw overrides are exposed (null when unset) for consumers with their own
        # default (the structural sections).
        custom = [{"name": "places", "label": "Realms", "hint": "places of power",
                   "glyph": "magic", "color": "#abc"}]
        blocks = {b["name"]: b for b in _merge_blocks({}, {}, custom)}
        loc = blocks["places"]
        self.assertEqual(loc["label"], "Realms")          # override wins over known label
        self.assertEqual(loc["hint"], "places of power")  # override hint wins
        self.assertEqual(loc["glyph"], "magic")
        self.assertEqual(loc["color"], "#abc")
        self.assertEqual(loc["label_override"], "Realms")
        self.assertEqual(loc["hint_override"], "places of power")

    def test_merge_no_override_keeps_defaults_and_null_raw(self):
        blocks = {b["name"]: b for b in _merge_blocks({}, {}, [])}
        loc = blocks["places"]
        self.assertEqual(loc["label"], "Places")  # known default
        self.assertIsNone(loc["label_override"])
        self.assertIsNone(loc["hint_override"])
        self.assertIsNone(loc["glyph"])
        self.assertIsNone(loc["color"])

    def test_added_flag_marks_registered_headings(self):
        # `added` tracks "is in the registry", independent of known/custom — so a
        # known-NAMED add ("Factions") reports added=true even though custom=false.
        # This is the signal the page uses to surface an empty section.
        blocks = _merge_blocks({}, {}, [{"name": "Factions"}, {"name": "Calendar"}])
        by_name = {b["name"]: b for b in blocks}
        self.assertTrue(by_name["factions"]["added"])   # known-named, registered
        self.assertFalse(by_name["factions"]["custom"])  # …but not "custom"
        self.assertTrue(by_name["calendar"]["added"])   # custom-named, registered
        self.assertTrue(by_name["calendar"]["custom"])
        self.assertFalse(by_name["places"]["added"])  # known but NOT registered


class WorldBlockDispatchTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="wb@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.session = ProjectScope(self.project.id)

    def _run(self, capability, args=None):
        return dispatch(capability, args or {}, Actor.USER_BUTTON, self.session)

    def _blocks(self):
        return load_world_blocks(self.session)

    # ── readers ──────────────────────────────────────────────────────
    def test_get_world_blocks_offers_known_when_empty(self):
        res = self._run("get_world_blocks")
        self.assertEqual(res.status, "ran")
        by_name = {b["name"]: b for b in res.result["blocks"]}
        self.assertIn("places", by_name)
        self.assertTrue(by_name["places"]["known"])
        self.assertEqual(by_name["places"]["count"], 0)
        self.assertNotIn("locations", by_name)   # 'places' is the only places block now

    def test_tagged_item_surfaces_in_its_block(self):
        add = self._run("add_worldbuilding", {"title": "Castle", "tags": ["Places"]})
        self.assertEqual(add.status, "ran")

        block = self._run("get_world_block", {"name": "places"}).result
        self.assertEqual(block["name"], "places")
        self.assertEqual(block["count"], 1)
        self.assertEqual(block["items"][0]["title"], "Castle")
        self.assertTrue(block["items"][0]["id"])  # real DB id → editable/deletable

        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertEqual(blocks["places"]["count"], 1)

    def test_get_world_block_unknown_is_empty_not_error(self):
        block = self._run("get_world_block", {"name": "nowhere"}).result
        self.assertEqual(block["count"], 0)
        self.assertEqual(block["items"], [])

    def test_characters_is_a_synthetic_scale_block(self):
        # 'characters' resolves to the cast (Character table) so a section-source
        # lens can use the characters as its scale — but it's NOT a World section.
        from characters.models import Character
        Character.objects.create(project=self.project, name="Mara")
        Character.objects.create(project=self.project, name="Jon")
        block = self._run("get_world_block", {"name": "characters"}).result
        self.assertEqual(block["name"], "characters")
        self.assertEqual({i["title"] for i in block["items"]}, {"Mara", "Jon"})
        # synthetic — offered in the scale picker, never as a World-page section
        names = {b["name"] for b in self._run("get_world_blocks").result["blocks"]}
        self.assertNotIn("characters", names)

    def test_get_world_block_is_case_insensitive(self):
        self._run("add_worldbuilding", {"title": "Castle", "tags": ["locations"]})
        block = self._run("get_world_block", {"name": "LOCATIONS"}).result
        self.assertEqual(block["count"], 1)

    def test_implicit_tag_surfaces_as_block(self):
        self._run("add_worldbuilding", {"title": "The Oracle", "tags": ["Prophecies"]})
        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertIn("prophecies", blocks)
        self.assertFalse(blocks["prophecies"]["known"])
        self.assertEqual(blocks["prophecies"]["count"], 1)

    # ── writers ──────────────────────────────────────────────────────
    def test_add_world_block_persists_empty_custom_section(self):
        res = self._run("add_world_block", {"name": "Calendar"})
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["block"]["name"], "calendar")

        registry = self._blocks()
        self.assertTrue(any(b["name"] == "calendar" for b in registry))

        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertTrue(blocks["calendar"]["custom"])
        self.assertEqual(blocks["calendar"]["count"], 0)

    def test_add_world_block_requires_name(self):
        res = self._run("add_world_block", {"name": "  "})
        self.assertEqual(res.status, "error")

    def test_add_world_block_persists_glyph_and_color(self):
        res = self._run("add_world_block", {"name": "Magic", "glyph": "rule", "color": "#8a6fc0"})
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["block"]["glyph"], "rule")
        self.assertEqual(res.result["block"]["color"], "#8a6fc0")

        entry = next(b for b in self._blocks() if b["name"] == "magic")
        self.assertEqual(entry["glyph"], "rule")
        self.assertEqual(entry["color"], "#8a6fc0")

        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertEqual(blocks["magic"]["glyph"], "rule")
        self.assertEqual(blocks["magic"]["color"], "#8a6fc0")

    def test_re_add_updates_glyph_and_color(self):
        self._run("add_world_block", {"name": "Magic", "glyph": "rule", "color": "#8a6fc0"})
        self._run("add_world_block", {"name": "Magic", "glyph": "item", "color": "#c0556f"})
        entries = [b for b in self._blocks() if b["name"] == "magic"]
        self.assertEqual(len(entries), 1)  # still one row
        self.assertEqual(entries[0]["glyph"], "item")  # look updated in place
        self.assertEqual(entries[0]["color"], "#c0556f")

    def test_add_world_block_is_idempotent(self):
        self._run("add_world_block", {"name": "Calendar"})
        self._run("add_world_block", {"name": "  calendar "})
        registry = self._blocks()
        self.assertEqual(len([b for b in registry if b["name"] == "calendar"]), 1)

    def test_each_heading_is_its_own_row(self):
        self._run("add_world_block", {"name": "Calendar"})
        self._run("add_world_block", {"name": "Guilds"})
        self._run("update_world_block", {"name": "Guilds", "color": "#123456"})
        rows = WorldBlock.objects.filter(project=self.project)
        self.assertEqual([r.name for r in rows], ["calendar", "guilds"])  # added order
        self.assertEqual(rows.get(name="calendar").color, "")  # untouched by the edit
        self.assertEqual(rows.get(name="guilds").color, "#123456")

    def test_heading_name_unique_per_project(self):
        WorldBlock.objects.create(project=self.project, name="calendar")
        with self.assertRaises(IntegrityError), transaction.atomic():
            WorldBlock.objects.create(project=self.project, name="calendar")

    # ── update_world_block (author inline heading editing) ───────────
    def test_update_world_block_renames_label_keeps_key(self):
        self._run("add_world_block", {"name": "Calendar"})
        self._run("add_worldbuilding", {"title": "Year One", "tags": ["Calendar"]})
        res = self._run("update_world_block", {"name": "Calendar", "label": "Timeline"})
        self.assertEqual(res.status, "ran")
        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertEqual(blocks["calendar"]["label"], "Timeline")
        self.assertEqual(blocks["calendar"]["label_override"], "Timeline")
        # the underlying key is untouched, so the item stays filed under it
        self.assertEqual(blocks["calendar"]["name"], "calendar")
        self.assertEqual(blocks["calendar"]["count"], 1)

    def test_update_world_block_materialises_entry_for_known(self):
        # editing a known block with no registry entry yet creates one
        res = self._run("update_world_block",
                        {"name": "Places", "hint": "where it happens",
                         "glyph": "magic", "color": "#abc"})
        self.assertEqual(res.status, "ran")
        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertEqual(blocks["places"]["hint"], "where it happens")
        self.assertEqual(blocks["places"]["glyph"], "magic")
        self.assertEqual(blocks["places"]["color"], "#abc")

    def test_update_world_block_glyph_only_is_not_a_rename(self):
        # a glyph-only edit must NOT bake in a label_override (the structural
        # sections key their title off label_override being present).
        self._run("update_world_block", {"name": "rules", "glyph": "magic"})
        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertEqual(blocks["rules"]["glyph"], "magic")
        self.assertIsNone(blocks["rules"]["label_override"])

    def test_update_world_block_clears_override_with_empty_string(self):
        self._run("update_world_block", {"name": "Places", "label": "Realms"})
        self._run("update_world_block", {"name": "Places", "label": ""})
        blocks = {b["name"]: b for b in self._run("get_world_blocks").result["blocks"]}
        self.assertEqual(blocks["places"]["label"], "Places")  # back to default
        self.assertIsNone(blocks["places"]["label_override"])

    def test_update_world_block_requires_a_field(self):
        self.assertEqual(self._run("update_world_block", {"name": "Locations"}).status, "error")

    def test_update_world_block_requires_name(self):
        self.assertEqual(self._run("update_world_block", {"name": " ", "label": "X"}).status, "error")

    def test_update_world_block_not_chat_accessible(self):
        res = dispatch("update_world_block", {"name": "Locations", "label": "X"},
                       Actor.CHAT, self.session)
        self.assertEqual(res.status, "denied")

    # ── add_worldbuilding proposal flow (Route.PROPOSE / AI_ONLY) ─────
    def test_add_worldbuilding_button_auto_applies(self):
        # The author's own World-page add is the intent — it auto-applies and
        # hands the created row straight back (no pending proposal).
        res = self._run("add_worldbuilding", {"title": "Castle", "tags": ["Locations"]})
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["worldbuilding"]["title"], "Castle")
        self.assertEqual(Proposal.objects.get().status, Proposal.STATUS_APPLIED)
        self.assertEqual("worldbuilding", res.invalidates and res.invalidates[0])

    def test_add_worldbuilding_not_chat_accessible(self):
        # Redesign (2026-06-09): the AI no longer touches add_worldbuilding —
        # world CRUD for chat is now add_world_entity / update_world_entity.
        # Chat is denied; nothing is proposed or written. (The author's own
        # World-page add still auto-applies — see the button test above.)
        res = dispatch(
            "add_worldbuilding",
            {"title": "The Sunless Sea", "content": "A black ocean under a dead sky.",
             "tags": ["Places"]},
            Actor.CHAT, self.session,
        )
        self.assertEqual(res.status, "denied")
        self.assertEqual(Worldbuilding.objects.filter(project=self.project).count(), 0)
        self.assertEqual(Proposal.objects.count(), 0)
