"""The AI policy: may this user run this AI feature, and what happens after.

The app asks the policy at two points of every piece of AI work:

- before: `check(user, feature)`. A `Refusal` stops the work before the model
  runs; the API answers `{"error": message, "code": code}` with `http_status`.
- after: `after_ai_call(...)`, once the work's tokens are recorded
  (`usage.services.settle`). A `Refusal` here does not undo the finished work;
  a chat turn shows its message, an action just logs it.

`has_own_price(feature)` says whether a feature keeps its own price when it
runs inside another piece of AI work (see `ai_engine/units.py`).

The default policy allows everything. A deployment picks another one with
settings.WRITERVERSE_AI_POLICY (a dotted path to an `AIPolicy` subclass).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.utils.module_loading import import_string

DEFAULT_POLICY = "usage.policy.AIPolicy"


@dataclass(frozen=True)
class Refusal:
    """Why AI work is refused: a machine code, a message for the author and
    the HTTP status the API answers with."""

    code: str
    message: str
    http_status: int = 402


class AIPolicy:
    """Default policy: every AI feature is allowed and nothing is priced."""

    def check(self, user: Any, feature: str) -> Refusal | None:
        return None

    def has_own_price(self, feature: str) -> bool:
        return False

    def after_ai_call(
        self, user: Any, usage: Any, feature: str, key: str, *,
        succeeded: bool, label: str = "",
    ) -> Refusal | None:
        return None


_cache: dict[str, AIPolicy] = {}


def get_policy() -> AIPolicy:
    """The configured policy, built once per dotted path (so
    `override_settings(WRITERVERSE_AI_POLICY=...)` in tests just works)."""
    path = getattr(settings, "WRITERVERSE_AI_POLICY", "") or DEFAULT_POLICY
    policy = _cache.get(path)
    if policy is None:
        policy = _cache[path] = import_string(path)()
    return policy
