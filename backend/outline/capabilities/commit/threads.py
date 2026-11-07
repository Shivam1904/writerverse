"""Commit layer — threads page (accept-time writes for generate_thread, user_wishes_rough)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import DispatchContext
from activity.store import log_step

from outline.models import PlotThread
from outline.store import create_thread, load_thread_heads, pick_thread_color


def _assign_thread_color(ctx: DispatchContext, existing: list, thread: dict) -> None:
    """Give an AI-built thread a distinct colour in place (unless it already has
    one), so generated/wished storylines don't all land on the story default.
    `existing` is the current threads' {id, color, scope} (load_thread_heads)."""
    if str(thread.get("color") or "").strip():
        return
    scope = thread.get("scope") or {}
    auto = pick_thread_color(
        ctx, existing,
        scope_type=scope.get("type"),
        scope_name=scope.get("name"),
    )
    if auto:
        thread["color"] = auto


def commit_generate_thread(ctx: DispatchContext, result: dict[str, Any]) -> None:
    preview = result.get("preview") or result
    _assign_thread_color(ctx, load_thread_heads(ctx), preview["plot_thread"])
    create_thread(ctx, preview["plot_thread"])  # appended at the bottom
    log_step(ctx, "generate_thread", preview, items_count=preview.get("items_count", 0))


def commit_user_wishes_rough(ctx: DispatchContext, result: dict[str, Any]) -> None:
    preview = result.get("preview") or result
    # Re-running "user wishes" replaces its earlier story thread.
    PlotThread.objects.filter(
        project_id=ctx.project_id, source="user_wishes", scope_type="story",
    ).delete()
    _assign_thread_color(ctx, load_thread_heads(ctx), preview["rough_outline"])
    create_thread(ctx, preview["rough_outline"])  # appended at the bottom
    log_step(ctx, "user_wishes", preview, items_count=preview.get("items_count", 0))
