"""Live-update stream: tell every open tab "these parts of the story changed".

How it works (one SSE stream per open tab):

1. Every write records "domain X changed now" in the database
   (`ProjectDomainVersion`, via `domain_versions.bump()`), in the same
   transaction as the write itself.
2. While a tab is connected, this view re-reads the project's versions every
   `_POLL_SECONDS` (one small indexed query) and sends the domains whose
   version moved since the last look.
3. Each event carries the full `versions` map. When the stream drops or hits
   its time limit, the tab reconnects with `?since=<that map>` and the first
   poll replays anything it missed in between.

Because the database is the source of truth, a write handled by one server
process (or one Vercel function instance) reaches a tab connected to any other.

The stream ends by itself after `_MAX_SECONDS` (below Vercel's 300 s function
limit); the frontend reconnects (`subscribeStaleness` in
`frontend/src/app/modules/chat/streamClient.ts`).

Events:
  {"type": "snapshot",    "versions": {...}}               first event, always
  {"type": "invalidates", "data": [domains], "versions": {...}}
"""
from __future__ import annotations

import json
import time

from django.db import connection
from django.http import StreamingHttpResponse
from projects.scoping import owned_project_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from actions.domain_versions import versions_for

# How often a connected stream re-reads the project's versions.
_POLL_SECONDS = 1.5
# Send an SSE comment at least this often so proxies don't kill an idle stream.
_KEEPALIVE_SECONDS = 15
# End the stream cleanly before Vercel's 300 s max function duration.
_MAX_SECONDS = 240


def _parse_since(raw: str | None) -> dict[str, str] | None:
    """The `since` query param: a JSON map {domain: version}. None if absent or bad."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    return {str(k): str(v) for k, v in data.items()}


def changed_domains(old: dict[str, str], new: dict[str, str]) -> list[str]:
    """Domains whose version differs between two maps (added, moved or removed)."""
    return sorted(d for d in old.keys() | new.keys() if old.get(d) != new.get(d))


def _close_db_connection() -> None:
    # One stream holds ONE connection for its life (at most `_MAX_SECONDS`) and
    # gives it back when it ends. Why not reconnect each poll: with
    # CONN_MAX_AGE=0 that is a new TLS + auth handshake every 1.5 s per tab.
    # Holding is cheap in prod, where DATABASE_URL is Neon's pooled (pgbouncer,
    # transaction mode) endpoint: an idle client connection there takes no real
    # Postgres backend, and the pooler allows thousands of clients. Locally
    # (direct Docker Postgres, 100 slots) it costs one slot per open tab.
    # (Inside a test transaction the connection must stay open.)
    if not connection.in_atomic_block:
        connection.close()


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def stream_events(project_id: int, since: dict[str, str] | None):
    """Yield SSE chunks for one connection until `_MAX_SECONDS` have passed."""
    try:
        yield from _poll(project_id, since)
    finally:
        _close_db_connection()


def _poll(project_id: int, since: dict[str, str] | None):
    started = time.monotonic()
    last_sent = started
    current = versions_for(project_id)
    yield _sse({"type": "snapshot", "versions": current})
    if since is not None:
        missed = changed_domains(since, current)
        if missed:
            yield _sse({"type": "invalidates", "data": missed, "versions": current})
    while True:
        time.sleep(_POLL_SECONDS)
        now = time.monotonic()
        if now - started >= _MAX_SECONDS:
            return  # the client reconnects with `since`
        latest = versions_for(project_id)
        moved = changed_domains(current, latest)
        current = latest
        if moved:
            last_sent = now
            yield _sse({"type": "invalidates", "data": moved, "versions": current})
        elif now - last_sent >= _KEEPALIVE_SECONDS:
            last_sent = now
            yield ": keepalive\n\n"


class StalenessStreamView(APIView):
    """GET — SSE stream of changed domains for this project.

    `?since=<json versions map>` resumes after a reconnect. The frontend
    subscribes once per project (ProjectShell) and pipes each list into the
    same `handleDispatchInvalidates` the dispatch response path uses."""

    permission_classes = [IsAuthenticated]

    def get(self, request, project_pk):
        owned_project_or_404(request, project_pk)  # ownership
        since = _parse_since(request.query_params.get("since"))
        resp = StreamingHttpResponse(
            stream_events(int(project_pk), since), content_type="text/event-stream",
        )
        resp["Cache-Control"] = "no-cache"
        resp["X-Accel-Buffering"] = "no"
        return resp
