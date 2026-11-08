"""Run the idea tagger on a few written-down test ideas and check its answers.

CALLS THE REAL, PAID AI (one call per idea, about 6 calls in all). Run it only
when the user asks for that run:

    uv run python manage.py eval_tagging

The ideas come from an app walk (2026-10-20): each lists what the AI
must tag, what it must not, and names it must not add. A check is one rule;
the report prints each idea's answer and every check that failed.
"""

from ai_engine.units import open_unit
from django.core.management.base import BaseCommand

from braindumps.ai import annotator

KNOWN = ["Otto", "Milo", "Rosa", "Bram", "Northfield Institute", "Larkspur", "Apartment", "Blue Kettle Diner", "TV"]

# must:     {name: [tags it must have]}
# must_not: {name: [tags it must not have]}
# absent:   names that must not be tagged on this idea at all
CASES = [
    {
        "text": 'Otto: "Nobody sits in my chair."',
        "must": {"Otto": ["dialogue"]},
        "must_not": {"Otto": ["relationship"]},
        "absent": [],
    },
    {
        "text": "Milo and Otto go to Rosa's ex-boyfriend Bram's place to get her TV back "
                "and come home without their pants.",
        "must": {"Milo": ["event"], "Otto": ["event"]},
        "must_not": {"Milo": ["appearance"], "Otto": ["appearance"], "TV": ["goal"]},
        "absent": [],
    },
    {
        "text": "Rosa is a waitress at the Blue Kettle Diner who wants to be a singer.",
        "must": {"Rosa": ["motivation"]},
        "must_not": {"Blue Kettle Diner": ["backstory"]},
        "absent": [],
    },
    {
        "text": "Milo falls for Rosa the moment she moves in across the hall.",
        "must": {"Milo": ["relationship"]},
        "must_not": {"Rosa": ["emotion"]},
        "absent": ["Apartment"],
    },
    {
        "text": "Otto and Milo are chemists at Northfield Institute who share an apartment in Larkspur.",
        "must": {"Northfield Institute": ["setting"]},
        "must_not": {"Apartment": ["relationship"]},
        "absent": [],
    },
    {
        "text": "Ada is an orphan who sleeps in the attic of her aunt and uncle's inn.",
        "must": {"Ada": ["backstory"]},
        "must_not": {},
        "absent": [],
    },
]


def _check(case: dict, entities: list[dict]) -> list[str]:
    by_name = {e["name"].lower(): set(e.get("tags") or []) for e in entities}
    fails: list[str] = []
    for name, tags in case["must"].items():
        have = by_name.get(name.lower())
        if have is None:
            fails.append(f"{name} is missing")
            continue
        fails += [f"{name} should have '{t}'" for t in tags if t not in have]
    for name, tags in case["must_not"].items():
        have = by_name.get(name.lower(), set())
        fails += [f"{name} should not have '{t}'" for t in tags if t in have]
    fails += [f"{name} should not be tagged here" for name in case["absent"] if name.lower() in by_name]
    return fails


class Command(BaseCommand):
    help = "Run the idea tagger on written-down test ideas (CALLS THE PAID AI)."

    def handle(self, *args, **opts):
        # An AI unit meters the calls (the app refuses unbilled AI calls);
        # nothing is charged to an author, we just print what it cost us.
        with open_unit("eval_tagging") as unit:
            self._run()
        self.stdout.write(f"Cost: ${unit.usage().cost_usd:.4f}")

    def _run(self):
        total = passed = 0
        for case in CASES:
            out = annotator.annotate(case["text"], known_entities=KNOWN)
            self.stdout.write(f"\n• {case['text']}")
            if out.get("status") != "ok":
                self.stdout.write(self.style.ERROR(f"  failed: {out.get('error')}"))
                continue
            for e in out["entities"]:
                self.stdout.write(f"  {e['kind']:5} {e['name']}: {', '.join(e['tags']) or '-'}")
            fails = _check(case, out["entities"])
            checks = sum(len(v) for v in case["must"].values()) + \
                sum(len(v) for v in case["must_not"].values()) + len(case["absent"])
            total += checks
            passed += checks - len(fails)
            for f in fails:
                self.stdout.write(self.style.WARNING(f"  ✗ {f}"))
        self.stdout.write(f"\n{passed}/{total} checks passed")
