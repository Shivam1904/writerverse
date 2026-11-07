"""Capability registrations — outline and plot-thread page readers."""
from __future__ import annotations

from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route

from outline import readers

_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)


def _gather_grand_outline(ctx, args):
    # Chat (as `get_outline`) gets a lean acts → chapters → scenes skeleton; the
    # page and every other actor keep the full merged grand outline.
    # `include_prose=False` (SA-306) lets screens that never show prose skip each
    # scene's text; chat's skeleton has no prose anyway, so it ignores the flag.
    if ctx.actor is Actor.CHAT:
        return readers.get_outline_skeleton(ctx)
    return readers.get_grand_outline(ctx, include_prose=args.get("include_prose", True) is not False)


def _gather_plot_threads(ctx, args):
    # Chat writes a thread `title` (add_plot_thread), so it reads `title` back.
    # The shared reader calls it `name` (the threads page reads `.name`).
    res = readers.get_plot_threads(ctx, **args)
    if ctx.actor is Actor.CHAT:
        for t in res.get("plot_threads", []):
            if "name" in t:
                t["title"] = t.pop("name")
    return res


register(Capability(
    name="get_grand_outline",
    tool_name="get_outline",
    description=(
        "The book's structure — acts → chapters → scenes with their ids + "
        "titles (no beats or prose). Use get_chapter for one chapter's scenes "
        "+ outline beats, get_chapter_prose for its prose."
    ),
    route=Route.READ,
    args={"include_prose": "bool?"},
    gather=_gather_grand_outline,
    pages=("Outline",),
))

register(Capability(
    name="get_plot_threads",
    description="Plot threads (rough outlines). Optionally filter to one scope.",
    route=Route.READ,
    args={"scope_type": "string?", "scope_name": "string?"},
    gather=_gather_plot_threads,
    pages=("Threads",),
))

register(Capability(
    name="get_outline_scaffolds",
    description=("The grand-outline base scaffolds the writer can init from (presets + their "
                 "act names), for the empty-outline scaffold picker."),
    route=Route.READ,
    gather=lambda ctx, args: readers.get_outline_scaffolds(ctx, **args),
    pages=("Outline",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_thread_scaffolds",
    description=("The storyline (thread) scaffolds a writer can seed a new thread from — named "
                 "beat skeletons (headings + placeholders) with author-facing summaries, for "
                 "the New-storyline modal's scaffold picker."),
    route=Route.READ,
    gather=lambda ctx, args: readers.get_thread_scaffolds(ctx, **args),
    pages=("Threads",),
    actors=_NO_CHAT,
))
