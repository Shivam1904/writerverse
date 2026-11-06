"""AI config fails loudly, never falls back (SA-236 missing key, SA-256 unknown role).

Offline: no test builds a real client or calls an LLM.
"""
import inspect
import os
import re
import tempfile
from pathlib import Path
from unittest import mock

import yaml
from django.test import SimpleTestCase, override_settings

from ai_engine import llm_utils
from ai_engine.config import AIConfig, AIConfigError, get_ai_config
from ai_engine.llm_utils import create_llm

BACKEND = Path(__file__).resolve().parents[2]
REAL_YML = BACKEND / "ai_engine" / "config" / "providers.yml"
NO_KEYS = {"OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": ""}
FAKE_KEYS = {"OPENAI_API_KEY": "sk-test", "ANTHROPIC_API_KEY": "sk-ant-test"}


def _config_from(data: dict) -> AIConfig:
    """AIConfig built from a temp providers.yml (real file untouched)."""
    tmp = tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False)
    with tmp:
        yaml.safe_dump(data, tmp)
    try:
        return AIConfig(Path(tmp.name))  # reads the file once, at init
    finally:
        os.unlink(tmp.name)


def _real_data() -> dict:
    return yaml.safe_load(REAL_YML.read_text())


class UnknownRoleTests(SimpleTestCase):
    def test_unknown_role_raises_naming_the_role(self):
        with self.assertRaisesRegex(AIConfigError, "'drafft'"):
            get_ai_config().get_model_for_role("drafft")

    def test_create_llm_unknown_role_never_builds_a_client(self):
        with mock.patch("langchain_openai.ChatOpenAI") as chat, \
                mock.patch.dict(os.environ, FAKE_KEYS):
            with self.assertRaisesRegex(AIConfigError, "Unknown AI role 'drafft'"):
                create_llm("drafft")
        chat.assert_not_called()

    def test_role_pointing_at_unlisted_model_raises(self):
        data = _real_data()
        data["roles"]["small"]["model"] = "gpt-nope"
        with self.assertRaisesRegex(AIConfigError, "gpt-nope"):
            _config_from(data).get_model_for_role("small")

    def test_unknown_role_has_no_profile_fallback(self):
        with self.assertRaises(AIConfigError):
            get_ai_config().get_profile_for_role("drafft")

    def test_missing_providers_yml_raises(self):
        with self.assertRaises(AIConfigError):
            AIConfig(Path("/nonexistent/providers.yml"))


class MissingKeyTests(SimpleTestCase):
    def test_create_llm_without_key_raises_naming_the_env_var(self):
        with mock.patch("langchain_openai.ChatOpenAI") as chat, \
                mock.patch.dict(os.environ, NO_KEYS):
            with self.assertRaisesRegex(AIConfigError, "OPENAI_API_KEY"):
                create_llm("small")
        chat.assert_not_called()

    def test_key_is_read_at_call_time_not_import_time(self):
        with mock.patch("langchain_openai.ChatOpenAI") as chat:
            with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-first"}):
                create_llm("small")
            with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-second"}):
                create_llm("small")
        keys = [c.kwargs["api_key"] for c in chat.call_args_list]
        self.assertEqual(keys, ["sk-first", "sk-second"])


class ClientLimitsTests(SimpleTestCase):
    """wrt-88: every client gets the model's timeout, output cap and a bounded
    retry count, so a stuck call can't hold a request for ~600 s × 3."""

    def _built_with(self, role: str, data: dict | None = None, **kwargs) -> dict:
        cfg = _config_from(data) if data else get_ai_config()
        with mock.patch("langchain_openai.ChatOpenAI") as openai_chat, \
                mock.patch("langchain_anthropic.ChatAnthropic") as anthropic_chat, \
                mock.patch.object(llm_utils, "get_ai_config", return_value=cfg), \
                mock.patch.dict(os.environ, FAKE_KEYS):
            create_llm(role, **kwargs)
        chat = openai_chat if openai_chat.called else anthropic_chat
        return chat.call_args.kwargs

    def test_openai_client_gets_timeout_output_cap_and_one_retry(self):
        model_cfg = get_ai_config().get_model_for_role("expert")
        built = self._built_with("expert")
        self.assertEqual(built["timeout"], model_cfg["timeout"])
        self.assertEqual(built["max_tokens"], model_cfg["max_tokens"])
        self.assertEqual(built["max_retries"], llm_utils.DEFAULT_MAX_RETRIES)

    def test_anthropic_client_gets_the_same_limits(self):
        data = _real_data()
        data["roles"]["draft"] = {"provider": "anthropic", "model": "claude-sonnet-4-6"}
        built = self._built_with("draft", data)
        self.assertEqual(built["timeout"], 120)
        self.assertEqual(built["max_tokens"], 16000)
        self.assertEqual(built["max_retries"], llm_utils.DEFAULT_MAX_RETRIES)

    def test_model_may_set_its_own_retries_and_caller_kwargs_win(self):
        data = _real_data()
        data["providers"]["openai"]["models"]["gpt-5.4-nano"]["max_retries"] = 0
        built = self._built_with("small", data, timeout=5)
        self.assertEqual(built["max_retries"], 0)
        self.assertEqual(built["timeout"], 5)

    def test_role_whose_model_has_no_timeout_is_refused(self):
        data = _real_data()
        del data["providers"]["openai"]["models"]["gpt-5.4-nano"]["timeout"]
        with self.assertRaisesRegex(AIConfigError, "timeout"):
            _config_from(data).get_model_for_role("small")
        problems = _config_from(data).validate()
        self.assertTrue(any("timeout" in p for p in problems), problems)

    def test_every_listed_model_sets_both_limits(self):
        for provider in _real_data()["providers"].values():
            for name, model in provider["models"].items():
                self.assertTrue(model.get("timeout") and model.get("max_tokens"), name)


class ValidateTests(SimpleTestCase):
    def test_real_providers_yml_is_valid(self):
        self.assertEqual(get_ai_config().validate(), [])

    def test_missing_keys_are_not_config_errors(self):
        with mock.patch.dict(os.environ, NO_KEYS):
            self.assertEqual(get_ai_config().validate(), [])


class KeyAvailabilityTests(SimpleTestCase):
    """The app runs with no AI keys or one provider's key (open-source forks)."""

    def test_no_keys_means_ai_unavailable_with_one_warning(self):
        with mock.patch.dict(os.environ, NO_KEYS):
            cfg = get_ai_config()
            self.assertFalse(cfg.ai_available())
            warnings = cfg.key_warnings()
        self.assertEqual(len(warnings), 1)
        self.assertIn("No AI provider key is set", warnings[0])

    def test_openai_key_alone_runs_everything(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "ANTHROPIC_API_KEY": ""}):
            cfg = get_ai_config()
            self.assertTrue(all(cfg.role_available(r) for r in cfg.roles()))
            self.assertEqual(cfg.key_warnings(), [])

    def test_anthropic_key_alone_runs_text_roles_but_not_portraits(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "sk-ant-test"}):
            cfg = get_ai_config()
            self.assertTrue(all(cfg.role_available(r) for r in cfg.roles()))
            self.assertFalse(cfg.images_available())
            warnings = cfg.key_warnings()
        self.assertEqual(len(warnings), 1)
        self.assertIn("portraits", warnings[0])

    def test_create_llm_without_any_key_raises_ai_not_configured(self):
        from ai_engine.config import AI_NOT_CONFIGURED_CODE, AINotConfiguredError
        with mock.patch.dict(os.environ, NO_KEYS):
            with self.assertRaises(AINotConfiguredError) as ctx:
                create_llm("small")
        self.assertEqual(ctx.exception.code, AI_NOT_CONFIGURED_CODE)
        self.assertEqual(ctx.exception.public_status, 503)

    def test_portrait_without_key_raises_ai_not_configured(self):
        from ai_engine.config import AINotConfiguredError
        from ai_engine.image_gen import generate_portrait_png
        with mock.patch.dict(os.environ, NO_KEYS):
            with self.assertRaises(AINotConfiguredError):
                generate_portrait_png("a tall knight")

    def test_drf_handler_answers_503_with_stable_code(self):
        from common.errors import custom_exception_handler

        from ai_engine.config import AINotConfiguredError
        resp = custom_exception_handler(AINotConfiguredError("no key"), {})
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.data["code"], "ai_not_configured")

    def test_unpriced_model_reported(self):
        data = _real_data()
        data["providers"]["openai"]["models"]["gpt-free"] = {"max_tokens": 10}
        data["roles"]["small"]["model"] = "gpt-free"
        problems = _config_from(data).validate()
        self.assertTrue(any("gpt-free" in p for p in problems), problems)

    def test_role_without_profile_reported(self):
        data = _real_data()
        del data["profiles"]["expert"]
        problems = _config_from(data).validate()
        self.assertTrue(any("'expert'" in p and "profile" in p for p in problems), problems)


class SystemCheckTests(SimpleTestCase):
    def _run(self):
        from projects.checks import ai_config_valid
        return ai_config_valid(None)

    @override_settings(AI_ENABLED=True, RUNNING_TESTS=False)
    def test_missing_keys_only_warn_when_ai_enabled(self):
        with mock.patch.dict(os.environ, NO_KEYS):
            found = self._run()
        self.assertTrue(found)
        self.assertEqual({e.id for e in found}, {"writerverse.W002"})
        self.assertFalse(any(e.is_serious() for e in found))

    @override_settings(AI_ENABLED=True, RUNNING_TESTS=False)
    def test_one_key_passes_the_check(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "ANTHROPIC_API_KEY": ""}):
            self.assertEqual(self._run(), [])

    @override_settings(AI_ENABLED=False, RUNNING_TESTS=False)
    def test_ai_disabled_skips_key_presence(self):
        with mock.patch.dict(os.environ, NO_KEYS):
            self.assertEqual(self._run(), [])

    @override_settings(AI_ENABLED=True, RUNNING_TESTS=True)
    def test_test_runner_skips_key_presence(self):
        with mock.patch.dict(os.environ, NO_KEYS):
            self.assertEqual(self._run(), [])

    @override_settings(AI_ENABLED=False)
    def test_bad_role_fails_even_with_ai_disabled(self):
        data = _real_data()
        data["roles"]["small"]["model"] = "gpt-nope"
        with mock.patch("ai_engine.config.get_ai_config", return_value=_config_from(data)):
            errors = self._run()
        self.assertTrue(any("gpt-nope" in e.msg for e in errors))


# Literal role names in code: create_llm("x"), role="x", and the "x" fallback
# in _ROLES.get("pass", "x"). A typo here would only fail at call time.
_ROLE_PATTERNS = (
    re.compile(r"""create_llm\(\s*['"]([\w-]+)['"]"""),
    re.compile(r"""\brole\s*=\s*['"]([\w-]+)['"]"""),
    re.compile(r"""_ROLES\.get\(\s*['"][\w-]+['"]\s*,\s*['"]([\w-]+)['"]"""),
    re.compile(r"""DEFAULT_ROLE\s*=\s*['"]([\w-]+)['"]"""),
)


def _roles_used_in_code() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(BACKEND).as_posix()
        if "/tests/" in f"/{rel}" or "/migrations/" in rel or ".venv" in rel:
            continue
        text = path.read_text()
        for pattern in _ROLE_PATTERNS:
            for role in pattern.findall(text):
                found.setdefault(role, set()).add(rel)
    return found


class RolesUsedInCodeExistTests(SimpleTestCase):
    def setUp(self):
        self.known = set(get_ai_config().roles())

    def test_literal_roles_in_code_exist(self):
        used = _roles_used_in_code()
        self.assertGreater(len(used), 0, "role scan found nothing — pattern broke?")
        unknown = {r: sorted(files) for r, files in used.items() if r not in self.known}
        self.assertEqual(unknown, {}, "role names used in code but missing from providers.yml")

    def test_function_default_roles_exist(self):
        for fn in (llm_utils.create_llm, llm_utils.ask_json):
            self.assertIn(inspect.signature(fn).parameters["role"].default, self.known)

    def test_engine_pass_roles_exist(self):
        from gauges.engine._config import _ROLES as gauge_roles
        from outline.engine.config import _ROLES as outline_roles
        roles = {*gauge_roles.values(), *outline_roles.values()}
        self.assertEqual({r for r in roles if r not in self.known}, set())

    def test_chat_tier_roles_exist(self):
        from night_eyes.routing import TIER_TO_ROLE
        self.assertEqual({r for r in TIER_TO_ROLE.values() if r not in self.known}, set())


def _request():
    import httpx
    return httpx.Request("POST", "https://api.example.test/v1/chat")


def _status_error(cls, code: int):
    import httpx
    return cls("boom", response=httpx.Response(code, request=_request()), body=None)


def _failing_chat(error: Exception):
    """Stand-in for the main model: every call raises `error`."""
    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    class _Failing(FakeListChatModel):
        def _call(self, *args, **kwargs):
            raise error

    return _Failing(responses=["never"])


class FallbackChainTests(SimpleTestCase):
    """wrt-71: each role is an ordered list of provider/model pairs. When the
    main model is down, refuses the key or rate-limits us, the call moves on
    to the next pair; other errors still surface."""

    def _invoke(self, error: Exception) -> str:
        from langchain_core.language_models.fake_chat_models import FakeListChatModel

        backup = FakeListChatModel(responses=["from the backup"])
        with mock.patch("langchain_openai.ChatOpenAI", return_value=_failing_chat(error)), \
                mock.patch("langchain_anthropic.ChatAnthropic", return_value=backup), \
                mock.patch.dict(os.environ, FAKE_KEYS):
            return create_llm("small").invoke("hi").content

    def test_every_role_has_a_backup_on_another_provider(self):
        for role in get_ai_config().roles():
            chain = get_ai_config().get_models_for_role(role)
            self.assertGreater(len(chain), 1, role)
            self.assertNotEqual(chain[0]["provider"], chain[1]["provider"], role)

    def test_connection_error_falls_back(self):
        import openai
        self.assertEqual(self._invoke(openai.APIConnectionError(request=_request())), "from the backup")

    def test_refused_key_rate_limit_and_outage_fall_back(self):
        import openai
        for cls, code in ((openai.AuthenticationError, 401), (openai.RateLimitError, 429),
                          (openai.InternalServerError, 503)):
            with self.subTest(code=code):
                self.assertEqual(self._invoke(_status_error(cls, code)), "from the backup")

    def test_bad_request_does_not_fall_back(self):
        import openai
        with self.assertRaises(openai.BadRequestError):
            self._invoke(_status_error(openai.BadRequestError, 400))

    def test_backup_without_key_is_left_out(self):
        with mock.patch("langchain_openai.ChatOpenAI") as openai_chat, \
                mock.patch("langchain_anthropic.ChatAnthropic") as anthropic_chat, \
                mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "ANTHROPIC_API_KEY": ""}):
            llm = create_llm("small")
        anthropic_chat.assert_not_called()
        self.assertIs(llm, openai_chat.return_value)

    def test_main_without_key_uses_the_backup(self):
        with mock.patch("langchain_openai.ChatOpenAI") as openai_chat, \
                mock.patch("langchain_anthropic.ChatAnthropic") as anthropic_chat, \
                mock.patch.dict(os.environ, {"OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "sk-ant-test"}):
            llm = create_llm("small")
        openai_chat.assert_not_called()
        self.assertIs(llm, anthropic_chat.return_value)

    def test_bind_tools_reaches_every_model_in_the_chain(self):
        from langchain_core.runnables import RunnableWithFallbacks
        from langchain_core.tools import tool

        @tool
        def ping(x: str) -> str:
            """Ping."""
            return x

        with mock.patch.dict(os.environ, FAKE_KEYS):  # real clients, no call made
            llm = create_llm("draft", stream_usage=True, model_kwargs={"parallel_tool_calls": False})
            bound = llm.bind_tools([ping])
        self.assertIsInstance(bound, RunnableWithFallbacks)
        for runnable in (bound.runnable, *bound.fallbacks):
            names = [t.get("function", t)["name"] for t in runnable.kwargs["tools"]]
            self.assertEqual(names, ["ping"])

    def test_unlisted_fallback_model_is_refused(self):
        data = _real_data()
        data["roles"]["small"]["fallbacks"] = [{"provider": "anthropic", "model": "claude-nope"}]
        with self.assertRaisesRegex(AIConfigError, "claude-nope"):
            _config_from(data).get_models_for_role("small")
        problems = _config_from(data).validate()
        self.assertTrue(any("claude-nope" in p for p in problems), problems)

    def test_backup_key_is_optional_at_startup(self):
        # A missing backup key is no problem: create_llm leaves it out.
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "ANTHROPIC_API_KEY": ""}):
            self.assertEqual(get_ai_config().key_warnings(), [])
