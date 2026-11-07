"""Capability contract, registry, dispatcher.

Pure-infra tests, no LLM. Dispatch runs against a ProjectScope for a real
Project row (the write path locks that row).
"""
from django.test import SimpleTestCase, TestCase

from actions.capabilities import (
    Actor,
    Capability,
    ProjectScope,
    Route,
    dispatch,
    registry,
)

# What the synthetic write cap committed, in order (cleared per test).
_COMMITTED: list = []


def _read_cap(name="reader", **kw):
    return Capability(
        name=name,
        route=Route.READ,
        description="reads something",
        gather=lambda ctx, args: {"value": "ok", "args": dict(args)},
        **kw,
    )


def _write_cap(name="writer", **kw):
    def _commit(ctx, result):
        _COMMITTED.append(result.get("data_points", []))

    return Capability(
        name=name,
        route=Route.WRITE,
        description="does work and writes",
        gather=lambda ctx, args: {"data_points": [1, 2], "records": [{"tag": "x"}]},
        commit=_commit,
        **kw,
    )


class RegistryTests(SimpleTestCase):
    def setUp(self):
        self._snap = registry.snapshot()
        registry.clear()

    def tearDown(self):
        registry.restore(self._snap)

    def test_register_and_get(self):
        cap = registry.register(_read_cap())
        self.assertIs(registry.get("reader"), cap)
        self.assertEqual(registry.names(), ["reader"])
        self.assertEqual(registry.all_capabilities(), [cap])

    def test_duplicate_name_raises(self):
        registry.register(_read_cap())
        with self.assertRaises(ValueError):
            registry.register(_read_cap())

    def test_get_unknown_returns_none(self):
        self.assertIsNone(registry.get("nope"))

    def test_schema_shape(self):
        cap = _write_cap(args={"chart_id": "string"})
        schema = cap.schema()
        self.assertEqual(schema["name"], "writer")
        self.assertEqual(schema["route"], "write")
        self.assertEqual(schema["args"], {"chart_id": "string"})


class DispatchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="dispatch@test.com", password="test",
        )
        cls.project = Project.objects.create(title="Test", user=user)

    def setUp(self):
        self._snap = registry.snapshot()
        registry.clear()
        _COMMITTED.clear()

    def tearDown(self):
        registry.restore(self._snap)

    def _sess(self):
        return ProjectScope(self.project.id)

    def test_unknown_capability(self):
        res = dispatch("ghost", {}, Actor.USER_BUTTON, self._sess())
        self.assertEqual(res.status, "unknown")
        self.assertIn("unknown capability", res.error)

    def test_read_runs_and_does_not_commit(self):
        registry.register(_read_cap())
        sess = self._sess()
        res = dispatch("reader", {"q": "hi"}, Actor.CHAT, sess)
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["value"], "ok")
        self.assertEqual(res.result["args"], {"q": "hi"})
        self.assertEqual(_COMMITTED, [])

    def test_write_runs_and_commits(self):
        registry.register(_write_cap())
        res = dispatch("writer", {}, Actor.USER_BUTTON, self._sess())
        self.assertEqual(res.status, "ran")
        self.assertEqual(_COMMITTED, [[1, 2]])

