"""Braindump tag taxonomy — loader, reader op, and registration (lean, no DB)."""
from actions.capabilities import registry
from django.test import SimpleTestCase

from braindumps import readers as data
from braindumps.ai import tags as bt


class TaxonomyLoaderTests(SimpleTestCase):
    def test_categories_ordered_with_colour_and_tags(self):
        cats = bt.categories_list()
        self.assertGreater(len(cats), 0)
        self.assertEqual(cats[0]["name"], "Character")  # definition order preserved
        for c in cats:
            self.assertTrue(c["color"].startswith("#"))
            self.assertIsInstance(c["tags"], list)
            self.assertTrue(c["tags"])

    def test_entity_archived_not_active(self):
        self.assertIn("Entity", bt.archived())
        self.assertNotIn("Entity", [c["name"] for c in bt.categories_list()])


class TaxonomyReaderOpTests(SimpleTestCase):
    def test_reader_op_registered(self):
        cap = registry.get("get_braindump_tag_categories")
        self.assertIsNotNone(cap)
        self.assertEqual(cap.route.name, "READ")

    def test_reader_op_shape_is_project_independent(self):
        # ctx is unused — the taxonomy is global config.
        out = data.get_braindump_tag_categories(None)
        self.assertEqual(set(out.keys()), {"categories", "archived"})
        self.assertEqual(out["categories"], bt.categories_list())
        self.assertTrue(any(g["name"] == "Entity" for g in out["archived"]))
