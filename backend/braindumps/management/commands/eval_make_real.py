"""Try "Make real" (the AI character draft) on written-down test stories and
score each draft against a golden answer.

CALLS THE REAL, PAID AI (about 75 small calls in all, a few cents). Never run it in
tests or CI; run it on purpose, with your own AI key:

    uv run python manage.py eval_make_real
    uv run python manage.py eval_make_real --variants today,facts --cases darcy,oren
    uv run python manage.py eval_make_real --set gaps --variants facts --repeat 2

Each case is a few ideas + one character + a golden answer:
  must_have:   {field: [what that field must say]}       (judged by an AI)
  must_be_empty: [fields that must stay empty]           (checked in code)
  must_not_say:  [things no field may say]               (judged by an AI)
A judge (role "expert") also lists every filled field the ideas don't support.

Variants are versions of the drafting instructions. "today" calls the real
`run_promote_character`; the others live only in this file, so the app is
unchanged. The ideas are tagged by the real tagger first, and the material is
picked the same way `_braindump_material_for` picks it.

Famous stories are on purpose: they check that the AI doesn't pull in what it
already knows. Only public-domain books are used (Pride and Prejudice, Sherlock
Holmes); every other story is made up.
"""

import json
import time

from ai_engine import llm_utils
from ai_engine.units import open_unit
from django.core.management.base import BaseCommand

from braindumps.ai import annotator
from braindumps.engine.generation import run_promote_character

FIELDS = ["role", "description", "want", "need", "misbelief", "external_arc",
          "internal_arc", "summary", "status", "appearance", "voice_profile", "aliases"]
STORY_FIELDS = ["role", "want", "need", "misbelief", "external_arc", "internal_arc", "status"]

AUSTEN = [  # Pride and Prejudice (public domain)
    "Darcy and Bingley are wealthy friends who rent Netherfield Park together for the season.",
    "Bingley falls for Jane Bennet the moment they dance at the Meryton ball.",
    "Jane is the eldest Bennet sister and wants a quiet, happy marriage.",
    "Darcy and Bingley ride to Longbourn to fetch Bingley's lost gloves "
    "and arrive soaked from the rain.",
    'Darcy: "She is tolerable, but not handsome enough to tempt me."',
]

OREN = [
    "Oren keeps the lighthouse on Gull Rock alone since his wife Hana drowned.",
    "Oren wants to leave the island and open a bakery in the city.",
    "Deep down Oren needs to forgive himself for the night Hana drowned.",
    "Oren believes that if he leaves, another ship will wreck and it will be his fault.",
    "Oren is tall and grey-bearded, and always wears Hana's blue scarf.",
    "Oren speaks in short, clipped sentences and never says Hana's name.",
    "A storm forces a girl named Lise to shelter in the lighthouse.",
    "Lise teaches Oren to bake bread in the lighthouse kitchen.",
    "In the end Oren hands the lighthouse keys to Lise and takes the ferry to the city.",
]

CASES = [
    {
        "id": "darcy",
        "what": "A famous novel. An errand is not a want; the famous name must not pull in the book.",
        "name": "Darcy", "ideas": AUSTEN,
        "must_have": {
            "description": ["he is wealthy",
                            "he rents Netherfield Park with Bingley for the season"],
            "voice_profile": ['his line "She is tolerable, but not handsome enough to tempt me."'],
        },
        "must_be_empty": STORY_FIELDS + ["appearance"],
        "must_not_say": [
            "that fetching Bingley's gloves is what Darcy wants or his goal",
            "a sentence copied about Darcy and Bingley together, as if it describes Darcy alone",
            "facts from the novel that no idea gives (e.g. Pemberley, Elizabeth, Wickham, "
            "Georgiana, Lady Catherine, ten thousand a year)",
        ],
    },
    {
        "id": "jane",
        "what": "A want the author DID write down must be kept; Bingley's feeling is not Jane's.",
        "name": "Jane", "ideas": AUSTEN,
        "must_have": {
            "description": ["she is the eldest Bennet sister",
                            "she dances with Bingley at the Meryton ball"],
            "want": ["a quiet, happy marriage"],
        },
        "must_be_empty": ["role", "need", "misbelief", "internal_arc", "status", "appearance"],
        "must_not_say": [
            "that Jane loves or falls for Bingley (only Bingley's feeling is given)",
            "facts from the novel that no idea gives (e.g. falling ill at Netherfield, "
            "a stay in London, marrying Bingley)",
        ],
    },
    {
        "id": "mira",
        "what": "A very early story: two ideas. Almost everything must stay empty.",
        "name": "Mira",
        "ideas": ["Mira finds a key inside her grandmother's piano.",
                  "Mira hides the key from her brother Tomas."],
        "must_have": {
            "description": ["she finds a key inside her grandmother's piano",
                            "she hides it from her brother Tomas"],
        },
        "must_be_empty": STORY_FIELDS + ["appearance", "voice_profile"],
        "must_not_say": ["why she hides the key", "what the key opens"],
    },
    {
        "id": "oren",
        "what": "A fuller story where the author wrote want, need, flaw, looks and voice. They must all be kept.",
        "name": "Oren", "ideas": OREN,
        "must_have": {
            "description": ["he keeps the lighthouse on Gull Rock alone",
                            "his wife Hana drowned"],
            "want": ["to leave the island and open a bakery in the city"],
            "need": ["to forgive himself for the night Hana drowned"],
            "misbelief": ["if he leaves, another ship will wreck and it will be his fault"],
            "appearance": ["tall", "grey beard", "wears Hana's blue scarf"],
            "voice_profile": ["short, clipped sentences", "never says Hana's name"],
            "external_arc": ["he ends by handing the keys to Lise and leaving for the city"],
        },
        "must_be_empty": ["role", "status"],
        "must_not_say": ["his age as a number", "a romance between Oren and Lise"],
    },
    {
        "id": "dev",
        "what": "Two people in every idea: Priya's facts must not leak onto Dev.",
        "name": "Dev",
        "ideas": ["Dev and Priya are rival chefs on the same street. Priya's restaurant is "
                  "always full; Dev's is empty.",
                  "Priya secretly sends customers to Dev's place."],
        "must_have": {
            "description": ["he is a chef", "Priya is his rival on the same street",
                            "his restaurant is empty"],
        },
        "must_be_empty": STORY_FIELDS + ["appearance", "voice_profile"],
        "must_not_say": ["that Dev's restaurant is full",
                         "that Dev sends customers anywhere",
                         "that Dev knows Priya is helping him"],
    },
    {
        "id": "felix",
        "what": "Mentioned once, in passing. The draft must be nearly empty.",
        "name": "Felix",
        "ideas": ["At the wedding, the bride's uncle Felix gives a long, boring toast.",
                  "The bride, Asha, runs away before the vows.",
                  "Asha's mother blames the caterer."],
        "must_have": {
            "description": ["he is the bride's uncle", "he gives a long, boring toast at the wedding"],
        },
        "must_be_empty": STORY_FIELDS + ["appearance"],
        "must_not_say": ["that Felix caused or knew about Asha running away",
                         "anything about Felix beyond the toast and being the uncle"],
    },
    {
        "id": "kai",
        "what": "An unknown story built only from moments. Driving to the airport is a moment, not a want.",
        "name": "Kai",
        "ideas": ["Kai drives his sister to the airport at 4am.",
                  "Kai complains the whole way."],
        "must_have": {
            "description": ["he drives his sister to the airport at 4am", "he complains the whole way"],
        },
        "must_be_empty": STORY_FIELDS + ["appearance"],
        "must_not_say": ["that taking his sister to the airport is what Kai wants",
                         "why he complains or how he feels about his sister"],
    },
    {
        "id": "sherlock",
        "what": "A famous book: the draft must not pull in what the AI knows about Sherlock Holmes.",
        "name": "Sherlock",
        "ideas": ["Sherlock is a detective who shares rooms at 221B Baker Street with a doctor "
                  "named Watson.",
                  "Sherlock plays the violin late at night."],
        "must_have": {
            "description": ["he is a detective", "he shares rooms at 221B Baker Street with "
                            "a doctor named Watson", "he plays the violin late at night"],
        },
        "must_be_empty": STORY_FIELDS + ["appearance", "voice_profile"],
        "must_not_say": ["a deerstalker hat, a pipe or drugs",
                         "the names Moriarty, Mycroft, Irene Adler, Mrs. Hudson or Lestrade"],
    },
]

# Round 2: messy, real-life ideas, to find what the facts-only rules miss.
GAP_CASES = [
    {
        "id": "unsure", "what": "The author is unsure: a 'maybe' must not become a fact.",
        "name": "Nell",
        "ideas": ["Nell is a waitress at a diner by the harbour.",
                  "Maybe Nell grew up on a farm up north? Not sure yet.",
                  "Nell might secretly be in debt, decide later."],
        "must_have": {"description": ["she is a waitress at a diner by the harbour"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["as a settled fact, that she grew up on a farm or up north",
                         "as a settled fact, that she is in debt"],
    },
    {
        "id": "conflict", "what": "Two ideas disagree: the draft must not quietly pick one.",
        "name": "Mira",
        "ideas": ["Mira is twelve years old.", "Mira, fifteen, climbs out of her window at night."],
        "must_have": {"description": ["she climbs out of her window at night"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["one single age (12 or 15) as settled, without noting the ideas disagree"],
    },
    {
        "id": "opinion", "what": "Other people's opinions are theirs, not facts about him.",
        "name": "Darcy",
        "ideas": ["Elizabeth thinks Darcy is proud.", "Mrs. Bennet finds Darcy rude."],
        "must_have": {"description": ["Elizabeth finds him proud (as Elizabeth's view)",
                                      "Mrs. Bennet finds him rude (as Mrs. Bennet's view)"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["as a plain fact, that Darcy is proud or rude"],
    },
    {
        "id": "negation", "what": "The author rules something out: it must stay out.",
        "name": "Darcy",
        "ideas": ["Darcy is NOT proud in my version.",
                  "Darcy reads in the library every evening."],
        "must_have": {"description": ["he reads in the library every evening"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["that Darcy is proud or arrogant"],
    },
    {
        "id": "nickname", "what": "Nicknames and 'the keeper' still refer to him.",
        "name": "Oren",
        "ideas": ["Dr. Oren Vale keeps the lighthouse.",
                  "The keeper never sleeps during storms.",
                  "Everyone on the island calls him Old Vale."],
        "must_have": {"description": ["he keeps the lighthouse", "he never sleeps during storms"],
                      "aliases": ["Old Vale"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["why he never sleeps during storms"],
    },
    {
        "id": "obvious", "what": "Obvious conclusions are fine; guessed details are not.",
        "name": "Tobin",
        "ideas": ["Tobin is an orphan.", "Tobin is eleven and has never had a birthday party."],
        "must_have": {"description": ["he is an orphan", "he has never had a birthday party"],
                      "appearance": ["age 11"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["how his parents died", "that he is lonely, sad or unloved"],
    },
    {
        "id": "says_want", "what": "He says out loud what he wants: that counts as a want.",
        "name": "Marlo",
        "ideas": ['Marlo: "One day I will win the Golden Ladle."', 'Marlo: "That\'s my stool."'],
        "must_have": {"want": ["to win the Golden Ladle"],
                      "voice_profile": ['"That\'s my stool."']},
        "must_be_empty": ["role", "need", "misbelief", "external_arc", "internal_arc", "status"],
        "must_not_say": ["why he wants the Golden Ladle"],
    },
    {
        "id": "note_to_self", "what": "An author's note to self is a plan, not a fact.",
        "name": "Kai",
        "ideas": ["Kai should feel more likeable in act two, fix later.",
                  "Kai fixes bikes in his garage."],
        "must_have": {"description": ["he fixes bikes in his garage"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["that Kai is likeable", "anything about act two as if it already happened"],
    },
    {
        "id": "stated_arc", "what": "A change the author wrote down: the arc must be filled.",
        "name": "Lise",
        "ideas": ["At first Lise is afraid of Oren.", "By the end Lise trusts Oren completely."],
        "must_have": {"internal_arc": ["she goes from being afraid of Oren to trusting him completely"]},
        "must_be_empty": ["role", "want", "need", "misbelief", "status"],
        "must_not_say": ["why she was afraid or what changed her mind"],
    },
    {
        "id": "casual", "what": "Casual typing must still be read right.",
        "name": "Nell",
        "ideas": ["nell n arjun argue abt the thermostat lol", "nell works dbl shifts this wk"],
        "must_have": {"description": ["she argues with Arjun about the thermostat",
                                      "she works double shifts this week"]},
        "must_be_empty": STORY_FIELDS,
        "must_not_say": ["why they argue or how she feels about it"],
    },
]

# ── Variant prompts (only "today" is the real app) ───────────────────────────

_FACTS_RULES = """RULES (the story is not finished; the writer is still finding it):
1. Use ONLY what these ideas say about {name}. Never use outside knowledge, even if
   the name or story is famous.
2. Every sentence is about {name}. Another person appears only as their tie to
   {name} ("rents a house with Bingley"). Never copy a sentence that is about
   several people; never give {name} what an idea says about someone else.
3. want / need / misbelief / external_arc / internal_arc / role / status: fill ONLY
   when an idea states it outright for {name} (e.g. "X wants to...", "X believes...").
   An event {name} takes part in is a moment, not a want or an arc. Do not guess
   motives, feelings or reasons.
4. appearance / voice_profile: only what an idea shows (a quoted line counts as a
   pet phrase; one line is not enough for sentence length).
5. When in doubt, leave the field out. An empty field is correct and expected."""

_FIELD_LIST = """Fields you may return (leave out every field the ideas don't give):
  • role          — protagonist | antagonist | supporting
  • description   — 1-3 sentences: who {name} is, from the ideas only
  • want, need, misbelief, external_arc, internal_arc — 1 sentence each
  • summary       — a one-line thumbnail, facts only
  • status        — their current story state
  • appearance    — object with only given slots: {{age, gender, build, hair, eyes, clothing, features}}
  • voice_profile — object with only what's evident: {{lexicon, sentence_length, taboo_words, pet_phrases}}
  • aliases       — list of {{"name": "..."}}"""


def _material_block(name, phrases, ideas):
    lines = "\n".join(
        f"- {p['text'].strip()}" + (f"  [tags: {', '.join(p['tags'])}]" if p["tags"] else "")
        for p in phrases if p["text"].strip()
    ) or "(none)"
    return f"PHRASES about {name}:\n{lines}\n\nIDEAS:\n" + ("\n\n".join(ideas) or "(none)")


def _variant_facts(name, phrases, ideas):
    prompt = f"""You are reading everything a writer's ideas say about ONE character: "{name}".
Draft their story-bible entry.

{_FACTS_RULES.format(name=name)}

{_FIELD_LIST.format(name=name)}

{_material_block(name, phrases, ideas)}

Return ONLY a JSON object (no prose, no fences) with only the fields the ideas give."""
    return llm_utils.ask_json(prompt, tag="eval_make_real_facts", expect=dict), None


def _variant_guesses(name, phrases, ideas):
    prompt = f"""You are reading everything a writer's ideas say about ONE character: "{name}".
Draft their story-bible entry.

{_FACTS_RULES.format(name=name)}

{_FIELD_LIST.format(name=name)}

SEPARATELY, you may add "guesses": an object with up to 3 of want / need / misbelief /
internal_arc that the ideas do NOT state but hint at. Each value is
{{"guess": "1 sentence", "because": "which idea hints at it"}}. Guesses are shown to the
writer as questions to think about, never saved as facts. Never put a guess in the
main fields.

{_material_block(name, phrases, ideas)}

Return ONLY a JSON object (no prose, no fences)."""
    out = llm_utils.ask_json(prompt, tag="eval_make_real_guesses", expect=dict)
    return out, out.pop("guesses", None)


def _variant_today(name, phrases, ideas):
    return run_promote_character(name, phrases, ideas)["character"], None


VARIANTS = {"today": _variant_today, "facts": _variant_facts, "guesses": _variant_guesses}

# ── Material, judging, scoring ───────────────────────────────────────────────


def _norm(s):
    return " ".join(str(s or "").split()).lower()


def _material(name, tagged):
    """Copy of capabilities.gather._braindump_material_for over in-memory ideas."""
    nn, phrases, ideas = _norm(name), [], []
    for body, ai in tagged:
        hit_any = False
        for p in ai.get("phrases") or []:
            hit = next((e for e in p.get("entities") or [] if _norm(e.get("name")) == nn), None)
            if hit is not None:
                tags = hit.get("tags") if hit.get("tags") is not None else (p.get("tags") or [])
                phrases.append({"text": p.get("text") or "", "tags": list(tags)})
                hit_any = True
        if hit_any:
            ideas.append(body)
    return phrases, ideas


def _filled(draft):
    return {f: draft[f] for f in FIELDS if draft.get(f) not in (None, "", [], {})}


def _judge(case, draft):
    rules = [{"id": f"have:{f}:{i}", "rule": f'field "{f}" says: {fact}'}
             for f, facts in case["must_have"].items() for i, fact in enumerate(facts)]
    rules += [{"id": f"not:{i}", "rule": f"NO field says: {x}"}
              for i, x in enumerate(case["must_not_say"])]
    prompt = f"""You grade an AI's draft of a story character against a golden answer.

The writer's IDEAS (the only allowed source):
{chr(10).join('- ' + i for i in case['ideas'])}

Character: {case['name']}
DRAFT (JSON):
{json.dumps(draft, ensure_ascii=False, indent=1)}

1. For each RULE, decide pass/fail. A "says" rule passes when that field states the
   fact (same meaning, any wording). A "NO field says" rule fails if any field says it.
RULES:
{json.dumps(rules, ensure_ascii=False, indent=1)}

2. "invented": list every filled field whose content goes beyond what the ideas say
   about {case['name']} (guessed motives, feelings, arcs, outside knowledge, or facts
   about someone else). Quote the invented part.

Return ONLY JSON:
{{"results": [{{"id": "...", "pass": true, "why": "short"}}],
  "invented": [{{"field": "...", "text": "quoted part", "why": "short"}}]}}"""
    out = llm_utils.ask_json(prompt, role="expert", tag="eval_make_real_judge", expect=dict)
    by_id = {r.get("id"): r for r in out.get("results") or []}
    checks = [{"id": r["id"], "rule": r["rule"], "pass": bool(by_id.get(r["id"], {}).get("pass")),
               "why": by_id.get(r["id"], {}).get("why", "judge gave no answer")} for r in rules]
    return checks, out.get("invented") or []


def _score(case, draft):
    filled = _filled(draft)
    checks = [{"id": f"empty:{f}", "rule": f'field "{f}" stays empty', "pass": f not in filled,
               "why": "" if f not in filled else f"filled: {json.dumps(filled[f], ensure_ascii=False)[:120]}"}
              for f in case["must_be_empty"]]
    judged, invented = _judge(case, filled)
    return checks + judged, invented


class Command(BaseCommand):
    help = "Score the Make real character draft against golden answers (CALLS THE PAID AI)."

    def add_arguments(self, parser):
        parser.add_argument("--variants", default=",".join(VARIANTS))
        parser.add_argument("--cases", default="")
        parser.add_argument("--set", default="basic", choices=["basic", "gaps", "all"])
        parser.add_argument("--repeat", type=int, default=1, help="run each draft this many times")
        parser.add_argument("--out", default="", help="write every draft + score as JSON here")

    def handle(self, *args, **opts):
        variants = [v for v in opts["variants"].split(",") if v]
        wanted = {c for c in opts["cases"].split(",") if c}
        pool = {"basic": CASES, "gaps": GAP_CASES, "all": CASES + GAP_CASES}[opts["set"]]
        cases = [c for c in pool if not wanted or c["id"] in wanted]
        self.repeat = max(1, opts["repeat"])
        # An AI unit meters the calls (the app refuses unbilled AI calls);
        # nothing is charged to an author, we just print what it cost us.
        with open_unit("eval_make_real") as unit:
            report = self._run(cases, variants)
        cost = unit.usage().cost_usd
        self.stdout.write(f"\nCost: ${cost:.4f}")
        if opts["out"]:
            with open(opts["out"], "w") as fh:
                json.dump({"cost_usd": float(cost), "results": report}, fh, ensure_ascii=False, indent=1)
            self.stdout.write(f"Wrote {opts['out']}")

    def _run(self, cases, variants):
        tag_cache: dict[str, dict] = {}
        report, totals = [], {v: [0, 0, 0] for v in variants}  # passed, checks, invented
        for case in cases:
            names = sorted({case["name"]} | set(case["must_have"]))
            for body in case["ideas"]:
                if body not in tag_cache:
                    tag_cache[body] = annotator.annotate(body, known_entities=names)
            phrases, ideas = _material(case["name"], [(b, tag_cache[b]) for b in case["ideas"]])
            self.stdout.write(f"\n━━ {case['id']}: {case['what']}")
            for v in [v for v in variants for _ in range(self.repeat)]:
                t0 = time.time()
                try:
                    draft, guesses = VARIANTS[v](case["name"], phrases, ideas)
                    checks, invented = _score(case, draft)
                except Exception as exc:  # one bad reply shouldn't sink the whole run
                    self.stdout.write(self.style.ERROR(f"  [{v}] failed: {exc}"))
                    continue
                passed = sum(c["pass"] for c in checks)
                totals[v][0] += passed
                totals[v][1] += len(checks)
                totals[v][2] += len(invented)
                self.stdout.write(f"  [{v}] {passed}/{len(checks)} rules, {len(invented)} invented "
                                  f"({time.time() - t0:.0f}s)")
                for c in checks:
                    if not c["pass"]:
                        self.stdout.write(self.style.WARNING(f"     ✗ {c['rule']} — {c['why']}"))
                for i in invented:
                    self.stdout.write(f"     ✎ invented {i.get('field')}: {i.get('text')}")
                report.append({"case": case["id"], "variant": v, "draft": _filled(draft),
                               "guesses": guesses, "checks": checks, "invented": invented})
        self.stdout.write("\nTotals:")
        for v, (p, n, inv) in totals.items():
            self.stdout.write(f"  {v:8} {p}/{n} rules passed, {inv} invented fields")
        return report
