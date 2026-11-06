"""Pricing (wrt-11): every call is priced from its own input, cached-input and
output tokens by the genai-prices library, and fails CLOSED (SA-125): no
config → no AI, unpriced model → error, never $0."""
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase

from ai_engine import usage_meter as um
from ai_engine.llm_utils import create_llm

M = 1_000_000


def _cb(*calls):
    """A fake meter holding these (model, usage) calls."""
    return SimpleNamespace(calls=list(calls))


def _use(tin=0, tout=0, cached=0):
    usage = {"input_tokens": tin, "output_tokens": tout, "total_tokens": tin + tout}
    if cached:
        usage["input_token_details"] = {"cache_read": cached}
    return usage


class PriceTableTests(SimpleTestCase):
    def setUp(self):
        um._model_providers.cache_clear()
        self.addCleanup(um._model_providers.cache_clear)

    def _assert_llm_refused(self, model="gpt-4o-mini"):
        # The price check runs before the chat client is even constructed.
        cfg = {"provider": "openai", "model": model, "api_key": "x"}
        with mock.patch("ai_engine.llm_utils.get_ai_config") as gac, \
                mock.patch("langchain_openai.ChatOpenAI") as chat:
            gac.return_value.get_models_for_role.return_value = [cfg]
            with self.assertRaises(um.PricingError):
                create_llm("small")
        chat.assert_not_called()

    def test_missing_config_refuses_ai(self):
        with mock.patch("yaml.safe_load", side_effect=OSError("no such file")):
            self._assert_llm_refused()

    def test_empty_config_refuses_ai(self):
        with mock.patch("yaml.safe_load", return_value={}):
            self._assert_llm_refused()

    def test_failed_load_is_not_cached(self):
        with mock.patch("yaml.safe_load", side_effect=OSError("flaky")):
            self._assert_llm_refused()
        self.assertTrue(um._model_providers())  # real providers.yml loads on the next try

    def test_unlisted_role_model_refuses_ai(self):
        self._assert_llm_refused(model="mystery-model")

    def test_model_the_library_does_not_know_refuses_ai(self):
        with mock.patch.object(um, "_model_providers", return_value={"made-up-9": "openai"}):
            self._assert_llm_refused(model="made-up-9")

    def test_meter_itself_never_checks_prices(self):
        # dispatch wraps plain (non-AI) edits in meter() too; they must keep working.
        with mock.patch("yaml.safe_load", side_effect=OSError("no such file")):
            with um.meter() as cb:
                pass
            self.assertEqual(um.cost_usd(cb), Decimal("0"))

    def test_unpriced_model_raises_instead_of_zero(self):
        with self.assertRaises(um.PricingError):
            um.cost_usd(_cb(("mystery-model", _use(1000))))

    def test_no_usage_costs_zero(self):
        self.assertEqual(um.cost_usd(_cb()), Decimal("0"))


class PricesTests(SimpleTestCase):
    """Pins the $ per 1M tokens (input / cached input / output) of every model
    in providers.yml. If a genai-prices upgrade changes a price, this fails:
    check the provider's price page, then update the number here on purpose."""

    PRICES = {
        "gpt-5.4-nano": ("0.20", "0.02", "1.25"),
        "gpt-5.4-mini": ("0.75", "0.075", "4.50"),
        "gpt-5.4": ("2.50", "0.25", "15.00"),
        "gpt-4o-mini": ("0.15", "0.075", "0.60"),
        "gpt-4o": ("2.50", "1.25", "10.00"),
        "claude-haiku-4-5": ("1.00", "0.10", "5.00"),
        "claude-sonnet-4-6": ("3.00", "0.30", "15.00"),
        "claude-opus-4-8": ("5.00", "0.50", "25.00"),
    }

    def _per_m(self, model, **use):
        # Ten calls of 100k tokens: stays under any long-prompt rate band.
        return um.cost_usd(_cb(*[(model, _use(**use))] * 10))

    def test_every_listed_model_is_pinned(self):
        self.assertEqual(set(um._model_providers()), set(self.PRICES))

    def test_input_cached_and_output_rates(self):
        for model, (tin, cached, tout) in self.PRICES.items():
            with self.subTest(model=model):
                self.assertEqual(self._per_m(model, tin=M // 10), Decimal(tin))
                self.assertEqual(self._per_m(model, tin=M // 10, cached=M // 10), Decimal(cached))
                self.assertEqual(self._per_m(model, tout=M // 10), Decimal(tout))

    def test_a_call_mixes_its_rates(self):
        # 8k in (2k of them cached), 1k out on the draft model:
        # 6k × $0.75 + 2k × $0.075 + 1k × $4.50, per 1M.
        cost = um.cost_usd(_cb(("gpt-5.4-mini", _use(tin=8000, tout=1000, cached=2000))))
        self.assertEqual(cost, Decimal("0.00915"))

    def test_anthropic_cache_writes_split_by_ttl_are_priced(self):
        # Sonnet: cache writes cost $3.75/1M (5 min) and $6/1M (1 hour), vs $3 plain.
        def cost(**details):
            use = _use(tin=M // 10)
            use["input_token_details"] = {"cache_creation": 0, **details}
            return um.cost_usd(_cb(("claude-sonnet-4-6", use)))
        self.assertEqual(cost(ephemeral_5m_input_tokens=M // 10), Decimal("0.375"))
        self.assertEqual(cost(ephemeral_1h_input_tokens=M // 10), Decimal("0.6"))

    def test_long_prompt_rate_applies_per_call(self):
        # gpt-5.4 charges more for a very long prompt. Many normal calls in one
        # meter must not add up into that band; one huge call does.
        many = um.cost_usd(_cb(*[("gpt-5.4", _use(tin=100_000))] * 10))
        one = um.cost_usd(_cb(("gpt-5.4", _use(tin=M))))
        self.assertEqual(many, Decimal("2.50"))
        self.assertGreater(one, many)

    def test_versioned_names_are_priced(self):
        self.assertEqual(
            um.cost_usd(_cb(("gpt-5.4-mini-2026-03-17", _use(tin=M // 10)))), Decimal("0.075"))
        self.assertEqual(
            um.cost_usd(_cb(("claude-haiku-4-5-20251001", _use(tin=M // 10)))), Decimal("0.1"))


class BilledCallTests(SimpleTestCase):
    """Every LLM call built by create_llm checks an AI unit is open."""

    def _model(self):
        from langchain_core.language_models.fake_chat_models import FakeListChatModel

        from ai_engine.llm_utils import _require_unit_handler
        return FakeListChatModel(responses=["ok"], callbacks=[_require_unit_handler("fake")])

    def test_tests_run_strict(self):
        self.assertTrue(um.STRICT)  # set by usage/apps.py under tests

    def test_unbilled_call_raises_in_strict_mode(self):
        with self.assertRaises(um.UnbilledCallError):
            self._model().invoke("hi")
        with um.meter(), self.assertRaises(um.UnbilledCallError):
            self._model().invoke("hi")  # an engine's local meter is not an AI unit

    def test_billed_call_runs(self):
        from ai_engine import units
        with units.open_unit("t"):
            self.assertEqual(self._model().invoke("hi").content, "ok")

    def test_async_billed_call_runs(self):
        import asyncio

        from ai_engine import units

        async def go():
            with units.open_unit("t"):
                return (await self._model().ainvoke("hi")).content
        self.assertEqual(asyncio.run(go()), "ok")

    def test_unbilled_call_only_warns_outside_strict_mode(self):
        with mock.patch.object(um, "STRICT", False), \
                self.assertLogs("writerverse.ai_engine", "WARNING"):
            self.assertEqual(self._model().invoke("hi").content, "ok")

    def test_create_llm_attaches_the_check(self):
        with mock.patch("langchain_openai.ChatOpenAI") as chat, \
                mock.patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}):
            create_llm("small")
        self.assertEqual(len(chat.call_args.kwargs["callbacks"]), 1)


class MeterHookTests(SimpleTestCase):
    def test_many_meters_do_not_grow_the_hook_list(self):
        from langchain_core.tracers.context import _configure_hooks

        with um.meter():
            pass  # first use registers the one hook
        before = len(_configure_hooks)
        for _ in range(10_000):
            with um.meter():
                pass
        self.assertEqual(len(_configure_hooks), before)

    def test_usage_still_counted_and_nested_meter_feeds_outer(self):
        from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
        from langchain_core.messages import AIMessage

        def call():
            msg = AIMessage(content="ok", response_metadata={"model_name": "m"}, usage_metadata={"input_tokens": 3, "output_tokens": 4, "total_tokens": 7})
            m = GenericFakeChatModel(messages=iter([msg]))
            m.invoke("hi")

        with um.meter() as outer:
            call()
            with um.meter() as inner:
                call()
            call()
        self.assertEqual(um.total_tokens(inner), 7)
        self.assertEqual(um.total_tokens(outer), 21)  # outer sees the inner call too
        self.assertEqual(len(outer.calls), 3)  # each call kept on its own for pricing
        self.assertEqual(len(inner.calls), 1)
