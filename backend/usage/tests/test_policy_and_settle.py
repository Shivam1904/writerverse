"""The AI policy seam (usage/policy.py, usage/services.py).

- The default policy allows every AI feature.
- A refusing policy (settings.WRITERVERSE_AI_POLICY) stops a button action AND
  the chat pre-flight with its own status, code and message, before any model runs.
- `settle` writes one AIUsage row per piece of AI work, once per key, even
  when the work crashed (SA-217).

Fake models only; no paid API is called.
"""
import json
from decimal import Decimal

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from ai_engine.units import Usage
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from usage.models import AIUsage
from usage.policy import AIPolicy, Refusal, get_policy
from usage.services import gate, settle
from usage.tests.helpers import _cap, _drop_caps, _setup, _Spend, spend

DEFAULT = "usage.policy.AIPolicy"
REFUSING = "usage.tests.test_policy_and_settle.RefusingPolicy"
REFUSING_AFTER = "usage.tests.test_policy_and_settle.RefusingAfterPolicy"
BROKEN_AFTER = "usage.tests.test_policy_and_settle.BrokenAfterPolicy"

NO_AI = Refusal(code="no_ai_today", message="AI is resting today.", http_status=402)


class RefusingPolicy(AIPolicy):
    calls: list = []

    def check(self, user, feature):
        return NO_AI

    def after_ai_call(self, user, usage, feature, key, *, succeeded, label=""):
        RefusingPolicy.calls.append(feature)
        return None


class RefusingAfterPolicy(AIPolicy):
    def after_ai_call(self, user, usage, feature, key, *, succeeded, label=""):
        return Refusal(code="used_up", message="That was your last AI turn.")


class BrokenAfterPolicy(AIPolicy):
    def after_ai_call(self, user, usage, feature, key, *, succeeded, label=""):
        raise RuntimeError("policy store down")


@override_settings(WRITERVERSE_AI_POLICY=DEFAULT)
class DefaultPolicyTests(TestCase):
    def setUp(self):
        self.user, self.project = _setup()
        self.scope = ProjectScope(self.project.pk)

    def tearDown(self):
        _drop_caps()

    def test_default_policy_allows_everything(self):
        self.assertIs(type(get_policy()), AIPolicy)
        self.assertIsNone(gate(self.user, "chat"))
        self.assertFalse(get_policy().has_own_price("generate_character_portrait"))

    def test_one_usage_row_per_dispatch_with_its_tokens_and_label(self):
        def work(ctx, args):
            spend(1000, 100)
            spend(500, 50)
            return {"ok": 1}

        _cap("_us_work", work)
        res = dispatch("_us_work", {}, Actor.USER_BUTTON, self.scope)

        self.assertEqual(res.status, "ran")
        self.assertIn("project_meta", res.invalidates)
        row = AIUsage.objects.get(user=self.user)
        self.assertEqual((row.feature, row.label), ("_us_work", "Did _us_work"))
        self.assertEqual((row.tokens_in, row.tokens_out), (1500, 150))
        # gpt-4o: 1500 in × $2.50/1M + 150 out × $10/1M = $0.00525
        self.assertEqual(row.cost_usd, Decimal("0.0053"))
        self.assertTrue(row.metadata.get("turn_id"))

    def test_nested_dispatch_joins_the_outer_row(self):
        def inner(ctx, args):
            spend(2000)
            return {"ok": 1}

        def outer(ctx, args):
            spend(1000)
            dispatch("_us_inner", {}, Actor.INTERNAL, self.scope)
            return {"ok": 1}

        _cap("_us_inner", inner)
        _cap("_us_outer", outer)
        dispatch("_us_outer", {}, Actor.USER_BUTTON, self.scope)

        row = AIUsage.objects.get(user=self.user)
        self.assertEqual((row.feature, row.tokens_in), ("_us_outer", 3000))

    def test_crashed_dispatch_still_records_tokens_spent(self):
        def boom(ctx, args):
            spend(2000)
            raise RuntimeError("provider 500")

        _cap("_us_boom", boom)
        with self.assertRaises(RuntimeError):
            dispatch("_us_boom", {}, Actor.USER_BUTTON, self.scope)

        row = AIUsage.objects.get(user=self.user)
        self.assertEqual(row.tokens_in, 2000)

    def test_nothing_spent_writes_no_row(self):
        _cap("_us_idle", lambda ctx, args: {"ok": 1})
        dispatch("_us_idle", {}, Actor.USER_BUTTON, self.scope)
        self.assertFalse(AIUsage.objects.exists())

    def test_settle_is_idempotent(self):
        used = Usage(Decimal("0.01"), 100, 10)
        for _ in range(2):  # e.g. a retried settle after a hiccup
            done = settle(self.user, "probe", used, "key-1", succeeded=True)
            self.assertTrue(done.changed)
        self.assertEqual(AIUsage.objects.filter(idempotency_key="key-1").count(), 1)

    def test_settle_with_no_user_is_a_no_op(self):
        done = settle(None, "probe", Usage(Decimal("1"), 1, 1), "key-2", succeeded=True)
        self.assertFalse(done.changed)
        self.assertFalse(AIUsage.objects.exists())

    @override_settings(WRITERVERSE_AI_POLICY=BROKEN_AFTER)
    def test_a_broken_policy_never_fails_the_work_and_usage_is_kept(self):
        def work(ctx, args):
            spend(1000)
            return {"ok": 1}

        _cap("_us_broken", work)
        res = dispatch("_us_broken", {}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "ran")
        self.assertEqual(AIUsage.objects.get(user=self.user).tokens_in, 1000)


@override_settings(WRITERVERSE_AI_POLICY=REFUSING)
class RefusingPolicyTests(TestCase):
    def setUp(self):
        self.user, self.project = _setup()
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        RefusingPolicy.calls = []

    def tearDown(self):
        _drop_caps()

    def test_button_action_gets_the_policy_status_code_and_message(self):
        ran = []

        def work(ctx, args):
            ran.append(1)
            spend(1000)
            return {"ok": 1}

        _cap("_us_refused", work)
        resp = self.client.post(
            f"/api/consistency/projects/{self.project.id}/op/_us_refused/", {}, format="json")

        self.assertEqual(resp.status_code, 402)
        self.assertEqual(resp.json(), {"error": "AI is resting today.", "code": "no_ai_today"})
        self.assertEqual(ran, [])  # the model never ran
        self.assertFalse(AIUsage.objects.exists())

    def test_plain_actions_are_never_gated(self):
        res = dispatch("get_project_meta", {}, Actor.USER_BUTTON, ProjectScope(self.project.pk))
        self.assertEqual(res.status, "ran")

    def test_chat_pre_flight_gets_the_policy_status_code_and_message(self):
        resp = self.client.post(
            f"/api/consistency/projects/{self.project.id}/chat/", {"message": "hi"}, format="json")
        self.assertEqual(resp.status_code, 402)
        self.assertEqual(resp.json(), {"error": "AI is resting today.", "code": "no_ai_today"})

    @override_settings(WRITERVERSE_AI_POLICY="usage.tests.test_policy_and_settle.ForbiddenPolicy")
    def test_the_policy_picks_the_http_status(self):
        resp = self.client.post(
            f"/api/consistency/projects/{self.project.id}/chat/", {"message": "hi"}, format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["code"], "not_on_this_plan")


class ForbiddenPolicy(AIPolicy):
    def check(self, user, feature):
        return Refusal(code="not_on_this_plan", message="Not on this plan.", http_status=403)


class _Thread:
    def __init__(self, project_id):
        self.project_id = project_id


def _events(out):
    return [json.loads(line[6:]) for line in out.split("\n") if line.startswith("data: ")]


@override_settings(WRITERVERSE_AI_POLICY=DEFAULT)
class ChatTurnUsageTests(TransactionTestCase):
    """The real chat producer thread opens the unit and settles it."""

    def test_one_usage_row_per_chat_turn(self):
        from night_eyes.stream import stream_chat_sse

        user, project = _setup()

        class _Chat:
            session = None

            async def stream(self, message, thread_id, resume=None):
                await _Spend(tin=1000, tout=100).ainvoke("x")
                yield {"event": "on_tool_end", "name": "t", "data": {"output": "ok"}}
                await _Spend(tin=500, tout=50).ainvoke("x")

        out = "".join(stream_chat_sse(_Chat(), _Thread(project.pk), None, message="hi"))
        self.assertEqual(_events(out)[-1]["type"], "done")

        row = AIUsage.objects.get(user=user)
        self.assertEqual((row.feature, row.label), ("chat", "Night Eyes chat"))
        self.assertEqual((row.tokens_in, row.tokens_out), (1500, 150))

    def test_failed_chat_turn_still_records_tokens_spent(self):
        from night_eyes.stream import stream_chat_sse

        user, project = _setup()

        class _Chat:
            session = None

            async def stream(self, message, thread_id, resume=None):
                await _Spend(tin=2000).ainvoke("x")
                raise RuntimeError("recursion limit")
                yield  # pragma: no cover — makes this an async generator

        out = "".join(stream_chat_sse(_Chat(), _Thread(project.pk), None, message="hi"))
        self.assertIn('"type": "error"', out)
        self.assertEqual(AIUsage.objects.get(user=user).tokens_in, 2000)

    @override_settings(WRITERVERSE_AI_POLICY=REFUSING_AFTER)
    def test_a_refusal_after_the_turn_ends_it_with_the_policy_message(self):
        from night_eyes.stream import stream_chat_sse

        user, project = _setup()

        class _Chat:
            session = None

            async def stream(self, message, thread_id, resume=None):
                await _Spend(tin=1000).ainvoke("x")
                yield {"event": "on_tool_end", "name": "t", "data": {"output": "ok"}}

        events = _events("".join(
            stream_chat_sse(_Chat(), _Thread(project.pk), None, message="hi")))
        self.assertIn({"type": "error", "data": "That was your last AI turn."}, events)
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual(AIUsage.objects.filter(user=user).count(), 1)
