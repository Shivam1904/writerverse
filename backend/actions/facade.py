"""Tier 2 — declarative resource facade over `dispatch()`.

Lets the frontend speak plain semantic HTTP (``GET /characters/``,
``PATCH /characters/<id>/``) instead of the
Operation envelope (``POST /dispatch/`` with ``{capability, args}``). A small
``ROUTES`` table maps method+path → capability; ONE resolver view builds the
args and calls the same `dispatch()` pipeline as `USER_BUTTON`. The internal
single-path dispatch model is unchanged — this is just a per-caller *adapter*.

**Wire conventions (decided 2026-05-29):**
  - ran      → ``200`` + the capability result; mutated domains in the
               ``X-Invalidates`` response header (a global axios interceptor
               feeds them to TanStack, so call sites stay blind).
  - proposed → ``202`` + the proposal envelope the proposal store consumes.
  - denied   → ``403``; unknown → ``404``; capability error → its http_status.

This facade is ADDITIVE — the existing ``/dispatch/`` endpoint and the
frontend's ``gateway.ts`` keep working; seams migrate to semantic URLs
incrementally.
"""
from __future__ import annotations

from typing import Any

from common.throttling import AI_THROTTLES
from rest_framework import status as drf_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .capabilities import Actor, dispatch, registry
from .capabilities.dispatch import run_followups
from .views import _scope


def _shape_proposals(proposals: list, page: str) -> list:
    """Stamp page/source defaults onto proposal rows the gateway will push."""
    out = []
    for p in proposals or []:
        p = dict(p)
        p.setdefault("page", page)
        p.setdefault("source", "button")
        out.append(p)
    return out


def _facade_response(res, capability: str, args: dict, page: str) -> Response:
    """Map a `DispatchResult` onto the facade's HTTP conventions."""
    if res.status == "ran":
        payload = res.result if res.result is not None else {}
        if res.proposals:
            # The write spawned a follow-up proposal (e.g. accepting the story
            # slice queued a generate_thread_from_description proposal). Ride it
            # back in the body so the gateway pushes it into the proposal store
            # (a ran/200 carries no `status: proposed`, so this is the only seam).
            payload = dict(payload) if isinstance(payload, dict) else {"result": payload}
            payload["proposals"] = _shape_proposals(res.proposals, page)
        resp = Response(payload)
        if res.invalidates:
            resp["X-Invalidates"] = ",".join(res.invalidates)
        return resp
    if res.status == "proposed":
        # The Proposal row(s) were already created by dispatch's _commit_proposal
        # (source="button", page threaded). One PROPOSE dispatch may emit several
        # rows (`res.proposals`); surface the full list so the gateway pushes one
        # store entry per row. `proposal_id`/`proposal` mirror the first for the
        # single-proposal callers/back-compat path.
        proposals = list(res.proposals or [])
        if not proposals and (res.result or {}).get("proposal_id"):
            proposals = [{
                "proposal_id": (res.result or {}).get("proposal_id"),
                "capability": capability,
                "args": args,
                "proposal": res.proposal,
            }]
        for p in proposals:
            p.setdefault("page", page)
            p.setdefault("source", "button")
        first = proposals[0] if proposals else {}
        return Response(
            {
                "status": "proposed",
                "proposal_id": first.get("proposal_id"),
                "capability": capability,
                "args": args,
                "proposal": first.get("proposal"),
                "page": page,
                "source": "button",
                "proposals": proposals,
            },
            status=drf_status.HTTP_202_ACCEPTED,
        )
    if res.status == "denied":
        return Response({"error": res.error},
                        status=drf_status.HTTP_403_FORBIDDEN)
    if res.status == "unknown":
        return Response({"error": res.error},
                        status=drf_status.HTTP_404_NOT_FOUND)
    body = {"error": res.error}
    if res.code:
        body["code"] = res.code
    if res.error_data:
        body.update(res.error_data)
    return Response(body, status=res.http_status or drf_status.HTTP_400_BAD_REQUEST)


def _route_args(client: Any, path_owned: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Build a semantic route's capability args.

    Trust rule: values from the URL path (the record id in
    ``characters/<id>/``) belong to the server. The client's body / query may
    repeat one with the same value, but a *different* value is refused (400)
    rather than silently ignored, so a confused or hostile caller learns its
    request was wrong instead of writing to a record it didn't name in the
    URL. The project, user and actor never travel in args at all: they come
    from the `ProjectScope` built by `_scope()` and the `Actor` passed to
    `dispatch()`. Returns ``(args, error)``; ``error`` is "" when fine."""
    args = {k: v for k, v in client.items() if k != "page"}
    for key, value in path_owned.items():
        if key in args and str(args[key]) != str(value):
            return {}, f"'{key}' comes from the URL and can't be changed in the request"
    args.update(path_owned)  # the URL wins, always applied last
    return args, ""


def _uses_ai(capability: str | None) -> bool:
    cap = registry.get(capability) if capability else None
    return bool(cap and cap.uses_ai)


class OperationRouteView(APIView):
    """One resolver for every semantic route. Configured per-URL via
    `as_view(methods_map=..., path_args=...)`:

      - ``methods_map``: HTTP method → capability name.
      - ``path_args``: url kwarg → capability arg name (when they differ).

    Args fed to the capability = request body (non-GET) or query params
    (GET), minus the reserved ``page`` key, then the path kwargs (remapped)
    on top. A body that names a path key with another value gets a 400
    (see `_route_args`).
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = AI_THROTTLES
    methods_map: dict[str, str] = {}
    path_args: dict[str, str] = {}

    def counts_as_ai(self, request) -> bool:
        """Only AI actions count toward the AI rate limit (common/throttling.py)."""
        return _uses_ai(self.methods_map.get(request.method))

    def _handle(self, request, project_pk, **kwargs):
        capability = self.methods_map.get(request.method)
        if not capability:
            return Response(
                {"error": f"{request.method} not allowed here"},
                status=drf_status.HTTP_405_METHOD_NOT_ALLOWED,
            )
        scope = _scope(request, project_pk)  # ownership guard

        body: dict[str, Any] = (
            request.data if isinstance(request.data, dict) else {}
        )
        client = request.query_params if request.method == "GET" else body
        args, refused = _route_args(
            client, {self.path_args.get(k, k): v for k, v in kwargs.items()},
        )
        if refused:
            return Response({"error": refused},
                            status=drf_status.HTTP_400_BAD_REQUEST)

        page = (
            request.query_params.get("page")
            or (body.get("page") if isinstance(body, dict) else "")
            or ""
        )
        res = dispatch(capability, args, Actor.USER_BUTTON, scope, page=page)
        # Run any follow-up proposals the write queued, now that dispatch() has
        # returned and the project lock is released (their LLM calls run here,
        # lock-free). They ride back to the gateway via res.proposals.
        res = run_followups(res, scope, page=page)
        return _facade_response(res, capability, args, page)

    # Bind every verb to the single handler; methods_map gates which are valid.
    get = post = patch = put = delete = _handle


class OperationGenericView(APIView):
    """Generic operation route: ``<base>/op/<capability>/`` (POST). The request
    body *is* the capability's args (minus a reserved ``page``). For reads and
    RPC-style ops that don't map to a REST resource; resource-shaped
    capabilities get semantic routes (see the characters routes above). Carries
    the same facade conventions — ran→200+X-Invalidates, proposed→202."""

    permission_classes = [IsAuthenticated]
    throttle_classes = AI_THROTTLES

    def counts_as_ai(self, request) -> bool:
        """Only AI actions count toward the AI rate limit (common/throttling.py)."""
        return _uses_ai(self.kwargs.get("capability"))

    def post(self, request, project_pk, capability):
        scope = _scope(request, project_pk)  # ownership guard
        body: dict[str, Any] = (
            request.data if isinstance(request.data, dict) else {}
        )
        page = (body.get("page") if isinstance(body, dict) else "") or ""
        args = {k: v for k, v in body.items() if k != "page"}
        res = dispatch(capability, args, Actor.USER_BUTTON, scope, page=page)
        # Run any follow-up proposals the write queued, now that dispatch() has
        # returned and the project lock is released (their LLM calls run here,
        # lock-free). They ride back to the gateway via res.proposals.
        res = run_followups(res, scope, page=page)
        return _facade_response(res, capability, args, page)


# ---- Declarative route table ---------------------------------------------- #
# Worked example: the characters resource. Add resources here as seams migrate.

def facade_urlpatterns():
    from django.urls import path

    base = "projects/<int:project_pk>/"
    return [
        path(
            base + "characters/",
            OperationRouteView.as_view(
                methods_map={"GET": "get_characters", "POST": "add_character"},
            ),
        ),
        path(
            base + "characters/<int:id>/",
            OperationRouteView.as_view(
                methods_map={"PATCH": "update_character", "DELETE": "delete_character"},
            ),
        ),
        # Generic operation route — every other capability (reads, RPC ops).
        path(
            base + "op/<str:capability>/",
            OperationGenericView.as_view(),
        ),
    ]
