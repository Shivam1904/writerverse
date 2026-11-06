"""Rate limits whose counters are shared by every server process.

DRF's throttles count requests in the "default" cache, which is per-process
memory. On Vercel each request can land on a fresh process, so the count
restarts and the limit never trips. These keep the count in the "throttle"
cache (a Postgres table) instead.
"""
from django.core.cache import caches
from django.utils.connection import ConnectionProxy
from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle

throttle_cache = ConnectionProxy(caches, 'throttle')


class SharedScopedRateThrottle(ScopedRateThrottle):
    cache = throttle_cache


class _AIRateThrottle(SimpleRateThrottle):
    """Per-user cap on requests that run AI.

    Free AI helpers are never charged, so without this a script could loop
    them and spend real money. The view decides what counts: a view may define
    ``counts_as_ai(request) -> bool`` (the action routes count only actions
    with ``uses_ai``, so saving prose is never limited); without it, every
    request to the view counts. Rates: ``ai_burst`` / ``ai_daily`` in
    REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] (env AI_RATE_BURST / AI_RATE_DAILY).
    """

    cache = throttle_cache

    def get_rate(self):
        # Read live (not the class attribute DRF binds at import), so a
        # settings override applies.
        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)

    def get_cache_key(self, request, view):
        counts = getattr(view, "counts_as_ai", None)
        if counts is not None and not counts(request):
            return None  # not an AI request: no limit
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            ident = user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AIBurstThrottle(_AIRateThrottle):
    scope = "ai_burst"


class AIDailyThrottle(_AIRateThrottle):
    scope = "ai_daily"


AI_THROTTLES = [AIBurstThrottle, AIDailyThrottle]
