"""dispatch() checks args against `Capability.args` for every actor (R3).

A wrong type is a 400 for everyone, a missing required arg a 400 for the AI;
extra keys and lax values
("5" for an int, 5 for a string id) still pass, and gather sees the ORIGINAL
args, not coerced ones.
"""
from django.test import SimpleTestCase

from actions.capabilities import Actor, Capability, Route, dispatch, registry
from actions.capabilities.args import args_model
from actions.capabilities.spec import ProjectScope

_SEEN: list = []


def _gather(ctx, args):
    _SEEN.append(args)
    return {"ok": True}


ARGS = {
    "name": "string",
    "count": "int",
    "note": "string?",
    "flag": "bool?",
    "items": "list?",
    "spec": "object",
    "extra": "dict?",
    "value": "any?",
    "ratio": "float?",
}


class CapabilityArgsTests(SimpleTestCase):
    def setUp(self):
        self._snap = registry.snapshot()
        _SEEN.clear()
        self.cap = registry.register(Capability(
            name="_args_probe", description="probe", route=Route.READ,
            args=ARGS, gather=_gather,
        ))

    def tearDown(self):
        registry.restore(self._snap)

    def run_cap(self, args, actor=Actor.USER_BUTTON):
        return dispatch("_args_probe", args, actor, ProjectScope(None))

    def good(self, **over):
        return {"name": "a", "count": 1, "spec": {}, **over}

    def test_valid_args_pass_unchanged_with_extras(self):
        args = self.good(count="5", name=7, unknown="kept")
        res = self.run_cap(args)
        self.assertEqual(res.status, "ran", res.error)
        self.assertEqual(_SEEN, [args])  # original values, extras kept
        self.assertEqual(_SEEN[0]["count"], "5")

    def test_optionals_may_be_missing_or_null(self):
        res = self.run_cap(self.good(note=None, value=None))
        self.assertEqual(res.status, "ran", res.error)

    def test_missing_required_is_400_for_the_ai(self):
        res = self.run_cap({"name": "a", "spec": {}}, Actor.CHAT)
        self.assertEqual((res.status, res.http_status), ("error", 400))
        self.assertIn("'count'", res.error)
        self.assertEqual(res.code, "bad_args")
        res = self.run_cap(self.good(count=None), Actor.CHAT)
        self.assertEqual(res.http_status, 400)
        self.assertEqual(_SEEN, [])

    def test_missing_required_only_warns_for_other_actors(self):
        # Some register files declare args the frontend never sends; until
        # those specs are fixed, only the AI is held to them.
        for actor in (Actor.USER_BUTTON, Actor.INTERNAL):
            with self.subTest(actor=actor), self.assertLogs(
                "writerverse.consistency", "WARNING",
            ):
                res = self.run_cap({"name": "a", "spec": {}}, actor)
                self.assertEqual(res.status, "ran", res.error)

    def test_wrong_types_are_400(self):
        bad = {
            "count": "many", "flag": "maybe", "items": "x",
            "spec": "nope", "extra": [1], "ratio": "fast", "name": ["x"],
        }
        for key, val in bad.items():
            with self.subTest(arg=key):
                res = self.run_cap(self.good(**{key: val}))
                self.assertEqual((res.status, res.http_status), ("error", 400))
                self.assertIn(f"'{key}'", res.error)

    def test_any_takes_anything(self):
        for val in ("s", 1, [1], {"a": 1}):
            res = self.run_cap(self.good(value=val))
            self.assertEqual(res.status, "ran", res.error)

    def test_non_dict_args_are_400(self):
        res = self.run_cap(["not", "a", "dict"])
        self.assertEqual(res.http_status, 400)

    def test_model_is_cached_and_zero_arg_has_no_fields(self):
        self.assertIs(args_model(self.cap), args_model(self.cap))
        empty = Capability(name="_zero", description="z")
        self.assertEqual(args_model(empty).model_fields, {})

    def test_every_registered_spelling_is_known(self):
        from actions.capabilities.args import _TYPE_MAP
        for cap in self._snap.values():
            for arg, hint in cap.args.items():
                base = hint.rstrip("?").strip().lower()
                self.assertIn(base, _TYPE_MAP, f"{cap.name}.{arg}: {hint!r}")
