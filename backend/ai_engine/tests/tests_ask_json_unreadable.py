"""wrt-20: an unreadable AI reply is never read as "found nothing".

`ask_json` raises UnreadableReply when the model's reply is broken JSON, or
JSON of the wrong shape, twice. Every AI check then fails (the author sees
"couldn't check") instead of reporting an empty, all-clear result. Each test
feeds a canned reply through a fake chat model; no paid API is called.
"""
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from ai_engine.llm_utils import UnreadableReply, ask_json

BROKEN = "Sorry, I can't produce that list right now."


def _llm(*replies):
    """Patch the chat model so each call answers the next canned reply (the
    last one repeats)."""
    seq = list(replies)
    llm = MagicMock()

    def invoke(prompt):
        return MagicMock(content=seq.pop(0) if len(seq) > 1 else seq[0])

    llm.invoke.side_effect = invoke
    return patch("ai_engine.llm_utils.create_llm", return_value=llm), llm


class AskJsonTests(SimpleTestCase):
    def test_broken_twice_raises_never_returns_empty(self):
        p, llm = _llm(BROKEN)
        with p, self.assertRaises(UnreadableReply):
            ask_json("x", tag="t")
        self.assertEqual(llm.invoke.call_count, 2)   # one retry, then give up

    def test_wrong_shape_twice_raises(self):
        p, _ = _llm('{"note": "no scenes found"}')
        with p, self.assertRaises(UnreadableReply):
            ask_json("x", expect=list)

    def test_retry_recovers(self):
        p, _ = _llm(BROKEN, '```json\n[{"a": 1}]\n```')
        with p:
            self.assertEqual(ask_json("x", expect=list), [{"a": 1}])

    def test_a_real_empty_answer_still_counts(self):
        p, _ = _llm("[]")
        with p:
            self.assertEqual(ask_json("x", expect=list), [])


# ---- every caller: a canned broken reply makes the check fail ---------------

SCOPE = {"type": "story", "name": "Story"}
GRAND = {"acts": [{"text": "Act I", "chapters": [{"text": "Chapter 1", "scenes": [
    {"id": "s1", "text": "The heist", "beats": [{"text": "the vault is empty"}]},
]}]}]}
THREADS = [{"scope": SCOPE, "title": "Main",
            "items": [{"kind": "text", "text": "Mara takes the job"}]}]
TICKS = [{"id": "s1", "label": "Act → Ch → Heist", "text": "She ran, terrified."}]
ELEMENTS = {"story": {"title": "T"}, "characters": [{"name": "Mara"}], "items": []}
LIST_CALLERS = {"probe", "payoff", "coverage", "extract", "suggest_custom"}


def _callers():
    from braindumps.engine import generation as bg
    from gauges.engine import _analyse as ga
    from gauges.engine import _serve as gs
    from outline.engine import generation as og

    lens = {"id": "l1", "name": "Fear", "type_id": "x"}
    return {
        # the lenses, where an empty answer used to read as "all clear"
        "probe": lambda: ga._run_gauge_state_analyse(
            lens, SCOPE, [{"value": "calm"}, {"value": "tense"}], TICKS, "syn", []),
        "payoff": lambda: ga._run_payoff_analyse(
            lens, SCOPE, THREADS, GRAND, "syn", [], []),
        "coverage": lambda: ga._run_coverage_analyse(
            lens, SCOPE, ["Climax"], THREADS, GRAND, "syn"),
        "extract": lambda: ga._run_extract_scale(
            lens, SCOPE, "syn", ["an idea"], THREADS, GRAND),
        "suggest": lambda: gs.run_suggest_gauges(ELEMENTS, "syn", []),
        "suggest_custom": lambda: gs.run_suggest_custom_gauges(ELEMENTS, "syn", ["idea"]),
        "invent": lambda: gs.run_invent_lens_from_ask("watch her fear", ELEMENTS, "syn", []),
        # outline + braindump generation
        "title": lambda: og.generate_title("a heist that goes wrong"),
        "rough": lambda: og.run_user_wishes_rough("syn", ["an idea"]),
        "thread": lambda: og.run_generate_thread(["an idea"], synopsis="syn"),
        "merge": lambda: og.run_merge_rough_into_grand(
            {"id": "ro", "items": [{"id": "ri-1", "kind": "text", "text": "beat"}]}, GRAND),
        "init": lambda: bg.run_init_elements("syn", ["an idea"]),
        "promote": lambda: bg.run_promote_character("Mara", [], ["an idea"]),
        "draft_world": lambda: bg.run_draft_world_entity("Vault", "place", [], ["an idea"]),
    }


class CallersFailOnUnreadableReplyTests(SimpleTestCase):
    def test_broken_reply_raises_in_every_caller(self):
        for name, run in _callers().items():
            with self.subTest(name), _llm(BROKEN)[0], self.assertRaises(UnreadableReply):
                run()

    def test_wrong_shape_reply_raises_in_every_caller(self):
        # an object where a list is asked for, and a list where an object is
        for name, run in _callers().items():
            wrong = '{"note": "nothing"}' if name in LIST_CALLERS else '["nothing"]'
            with self.subTest(name), _llm(wrong)[0], self.assertRaises(UnreadableReply):
                run()

    def test_probe_lens_shows_couldnt_check_not_all_clear(self):
        from actions.capabilities.spec import CapabilityError
        from gauges.capabilities.execute import execute_analyse_gauge

        g = {"binding_id": "b1", "lens": {"id": "l1", "name": "Fear", "rules": []},
             "scope": SCOPE, "y_items": [{"value": "calm"}],
             "grand_outline": GRAND, "plot_threads": THREADS,
             "synopsis": "syn", "braindumps": []}
        with _llm(BROKEN)[0], self.assertRaises(CapabilityError) as cm:
            execute_analyse_gauge(MagicMock(project_id=1), g)
        self.assertEqual(cm.exception.status, 502)
        self.assertIsInstance(cm.exception.__cause__, UnreadableReply)
