"""AI config: providers.yml (roles → provider + model) plus API keys from env.

Fails loudly, never falls back (SA-236, SA-256):
- `validate()` lists every problem with the config. The Django system check
  (projects/checks.py) runs it at startup, so `runserver` / `check` stop with
  a clear message instead of booting a server whose AI 401s later.
- `get_model_for_role()` raises `AIConfigError` for an unknown role, or a role
  whose provider/model isn't in providers.yml. There is no default model.
- A role may list `fallbacks:`, an ordered list of backup provider/model pairs
  (wrt-71). `get_models_for_role()` returns the whole chain, main model first;
  each backup is checked as strictly as the main one. Switching to a backup on
  an outage is `create_llm`'s job, not this file's.
- API keys are read when a model is built (not cached at import), from the env
  var each provider names in `api_key_env`. A server may run with no keys, or
  with one provider's key: `key_warnings()` says what can't run, and an AI
  call with no usable key raises `AINotConfiguredError` (views: HTTP 503).

Zero Django imports (this is `ai_engine`).
"""
import logging
from pathlib import Path
from typing import Any

import yaml
from decouple import config

logger = logging.getLogger(__name__)

# Every role's chat-agent profile (providers.yml `profiles:`) must set these.
PROFILE_KEYS = ("tool_budget", "prompt", "recursion_limit", "compact_after")
# Every model a role uses must set these limits (create_llm passes them to the
# client): `timeout` in seconds, `max_tokens` = the output token cap.
MODEL_LIMIT_KEYS = ("timeout", "max_tokens")


class AIConfigError(RuntimeError):
    """providers.yml or the AI env vars are wrong: an unknown role, a role
    pointing at a missing provider/model, or a missing API key."""


# What the author sees, and the stable code the frontend can read, when an AI
# feature runs on a server with no API key for it. Views answer HTTP 503.
AI_NOT_CONFIGURED_CODE = "ai_not_configured"
AI_NOT_CONFIGURED_MESSAGE = (
    "AI is not configured on this server. Everything else works; "
    "the server owner can add an AI provider key to turn AI features on."
)


class AINotConfiguredError(AIConfigError):
    """No API key is set for any model this AI call could use. Not a bug: a
    server may run with no AI keys at all. Callers turn it into HTTP 503 with
    AI_NOT_CONFIGURED_CODE."""

    code = AI_NOT_CONFIGURED_CODE
    # The answer a view gives when this escapes (common/errors.py reads these).
    public_status = 503
    public_message = AI_NOT_CONFIGURED_MESSAGE


class AIConfig:
    """Central configuration for the AI engine, loaded from providers.yml."""

    def __init__(self, config_path: Path | None = None):
        self.config_path = config_path or Path(__file__).parent / 'providers.yml'
        self._config: dict[str, Any] = self._load_config()
        self._role_mapping: dict[str, dict[str, str]] = self._config.get('roles') or {}

    def _load_config(self) -> dict[str, Any]:
        """Load providers.yml. A missing or broken file is an error, not a
        silent built-in default."""
        try:
            with open(self.config_path) as f:
                data = yaml.safe_load(f)
        except (OSError, yaml.YAMLError) as exc:
            raise AIConfigError(f"Can't load AI config {self.config_path.name}: {exc}") from exc
        if not isinstance(data, dict):
            raise AIConfigError(f"AI config {self.config_path.name} is empty or not a mapping")
        return data

    # ── roles ────────────────────────────────────────────────────────────

    def roles(self) -> list[str]:
        """Every role name defined in providers.yml."""
        return list(self._role_mapping)

    def _provider_config(self, provider: str | None) -> dict[str, Any] | None:
        return (self._config.get('providers') or {}).get(provider)

    def api_key_env(self, provider: str) -> str:
        """Name of the env var holding this provider's API key."""
        return (self._provider_config(provider) or {}).get('api_key_env') or ''

    def api_key(self, provider: str) -> str:
        """The provider's API key, read now (not cached). '' when unset."""
        env = self.api_key_env(provider)
        return (config(env, default='') or '') if env else ''

    def _base_url(self, provider: str) -> str | None:
        """Optional proxy/base URL from env, e.g. OPENAI_BASE_URL."""
        return config(f'{provider.upper()}_BASE_URL', default=None) or None

    def _role_config(self, role: str) -> dict[str, Any]:
        role_config = self._role_mapping.get(role)
        if not role_config:
            known = ", ".join(sorted(self._role_mapping)) or "none"
            raise AIConfigError(
                f"Unknown AI role {role!r}: not in providers.yml `roles:` (known: {known})"
            )
        return role_config

    def _resolve(self, role: str) -> tuple[str, str, dict[str, Any]]:
        """(provider, model, model_config) for a role's main model, or AIConfigError."""
        role_config = self._role_config(role)
        return self._resolve_pair(role, role_config.get('provider'), role_config.get('model'))

    def _resolve_chain(self, role: str) -> list[tuple[str, str, dict[str, Any]]]:
        """The role's main model, then each of its `fallbacks:` in order."""
        role_config = self._role_config(role)
        chain = [self._resolve(role)]
        fallbacks = role_config.get('fallbacks') or []
        if not isinstance(fallbacks, list):
            raise AIConfigError(f"AI role {role!r}: `fallbacks` must be a list of provider/model pairs")
        for pair in fallbacks:
            if not isinstance(pair, dict):
                raise AIConfigError(f"AI role {role!r}: each fallback needs a `provider` and a `model`")
            chain.append(self._resolve_pair(role, pair.get('provider'), pair.get('model')))
        return chain

    def _resolve_pair(
        self, role: str, provider: str | None, model_name: str | None,
    ) -> tuple[str, str, dict[str, Any]]:
        provider_config = self._provider_config(provider)
        if not provider_config:
            raise AIConfigError(
                f"AI role {role!r} uses provider {provider!r}, which isn't in providers.yml `providers:`"
            )
        if not provider_config.get('enabled', True):
            raise AIConfigError(f"AI role {role!r} uses provider {provider!r}, which is disabled")
        model_config = (provider_config.get('models') or {}).get(model_name)
        if model_config is None:
            raise AIConfigError(
                f"AI role {role!r} uses model {model_name!r}, which isn't listed under provider {provider!r}"
            )
        missing = [k for k in MODEL_LIMIT_KEYS if not model_config.get(k)]
        if missing:
            raise AIConfigError(
                f"AI role {role!r} uses model {model_name!r}, which has no {', '.join(missing)} "
                "in providers.yml (every call needs a time limit and an output cap)"
            )
        return provider, model_name, model_config

    def get_model_for_role(self, role: str) -> dict[str, Any]:
        """Model config for a role: provider, model, api_key (read now; '' if
        unset), base_url (None unless set in env) and the model's settings.
        Raises AIConfigError for an unknown or broken role — never a default."""
        return self._model_entry(*self._resolve(role))

    def get_models_for_role(self, role: str) -> list[dict[str, Any]]:
        """Like `get_model_for_role`, for the whole chain: the main model
        first, then each backup in `fallbacks:` order."""
        return [self._model_entry(*link) for link in self._resolve_chain(role)]

    def _model_entry(self, provider: str, model_name: str, model_config: dict[str, Any]) -> dict[str, Any]:
        return {
            **model_config,
            'provider': provider,
            'model': model_name,
            'api_key': self.api_key(provider),
            'api_key_env': self.api_key_env(provider),
            'base_url': self._base_url(provider),
        }

    def get_profile_for_role(self, role: str) -> dict[str, Any]:
        """Chat-agent behaviour profile for a role (providers.yml `profiles:`).
        Raises AIConfigError if the role or its profile is missing/incomplete."""
        self._resolve(role)
        profile = (self._config.get('profiles') or {}).get(role)
        missing = [k for k in PROFILE_KEYS if k not in (profile or {})]
        if missing:
            raise AIConfigError(
                f"AI role {role!r} has no complete profile in providers.yml `profiles:` "
                f"(missing: {', '.join(missing)})"
            )
        return dict(profile)

    # ── images ───────────────────────────────────────────────────────────

    def get_image_config(self) -> dict[str, Any]:
        """Image-generation config (the `images:` block) + the provider's
        `api_key` read now ('' if the env key is unset)."""
        images = dict(self._config.get('images') or {})
        images['api_key'] = self.api_key(images.get('provider') or '')
        return images

    # ── validation ───────────────────────────────────────────────────────

    def validate(self) -> list[str]:
        """Every problem with providers.yml itself, as plain messages ([] = all good).

        Checks that each role, and each of its fallbacks, resolves to an
        enabled provider + listed model that sets `timeout` + `max_tokens` and
        has a price; that each role has a complete chat profile; that the image
        block names a known provider + model; and that every provider in use
        names its `api_key_env`. Whether the keys are SET is not a config
        error: see `key_warnings()`."""
        from ai_engine.usage_meter import PricingError, check_priced

        errors: list[str] = []
        providers_in_use: set[str] = set()
        if not self._role_mapping:
            errors.append("providers.yml has no `roles:`")
        for role in self._role_mapping:
            try:
                chain = self._resolve_chain(role)
                self.get_profile_for_role(role)
                for _, model_name, _ in chain:
                    check_priced(model_name)
            except (AIConfigError, PricingError) as exc:
                errors.append(str(exc))
                continue
            providers_in_use.update(provider for provider, _, _ in chain)

        images = self._config.get('images') or {}
        image_provider = images.get('provider')
        if not self._provider_config(image_provider):
            errors.append(f"providers.yml `images:` uses unknown provider {image_provider!r}")
        else:
            providers_in_use.add(image_provider)
        if not images.get('model'):
            errors.append("providers.yml `images:` has no `model`")

        for provider in sorted(providers_in_use):
            if not self.api_key_env(provider):
                errors.append(f"Provider {provider!r} has no `api_key_env` in providers.yml")
        return errors

    # ── which AI can run with the keys set now ───────────────────────────

    def role_available(self, role: str) -> bool:
        """True when at least one model in the role's chain has its key set.
        create_llm leaves out the models without a key, so one is enough."""
        try:
            chain = self._resolve_chain(role)
        except AIConfigError:
            return False
        return any(self.api_key(provider) for provider, _, _ in chain)

    def images_available(self) -> bool:
        """True when the `images:` provider has its key set (portraits)."""
        return bool(self.get_image_config().get('api_key'))

    def ai_available(self) -> bool:
        """True when any AI role can run: at least one provider key is set."""
        return any(self.role_available(role) for role in self._role_mapping)

    def key_warnings(self) -> list[str]:
        """What can't run with the keys set now ([] = every role and portraits
        can run). Warnings, not errors: the app runs without AI keys, and an
        AI feature that can't run answers 503 `ai_not_configured`."""
        providers = self._config.get('providers') or {}
        envs = sorted({self.api_key_env(p) for p in providers} - {''})
        if not self.ai_available():
            return [
                f"No AI provider key is set ({' / '.join(envs)}). The app runs, but "
                "every AI feature answers 'AI is not configured on this server'."
            ]
        warnings = [
            f"AI role {role!r} has no model whose API key is set, so its "
            "features answer 'AI is not configured on this server'."
            for role in self._role_mapping if not self.role_available(role)
        ]
        if not self.images_available():
            provider = (self._config.get('images') or {}).get('provider') or ''
            env = self.api_key_env(provider) or 'its API key'
            warnings.append(
                f"Character portraits need {env} (provider {provider!r}); until "
                "it is set they answer 'AI is not configured on this server'."
            )
        return warnings


_ai_config: AIConfig | None = None


def get_ai_config() -> AIConfig:
    """Return singleton AIConfig instance (lazy initialization)."""
    global _ai_config
    if _ai_config is None:
        _ai_config = AIConfig()
    return _ai_config
