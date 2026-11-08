"""Hidden-context channel — per-key prompt renderers.

The chat request carries an optional `context` dict (the "hidden context")
alongside the author's message. It rides WITH the turn but never becomes part of
the user's message text. Each known key maps to a renderer that formats its
payload into a prompt section, appended to the system prompt in `build_system_prompt`.

The system prompt is rebuilt every request and is NOT checkpointed into thread
history, so each turn gets the freshest context and nothing stale accumulates.

Today there is exactly one consumer — `live_hints`, the side-rail nudge cards
actually on the author's screen this turn (see `frontend/src/app/modules/
hint/collectLiveHints.ts`). To add another hidden field later (selected entity,
open editor, scroll position, …), register one more renderer below.
"""


def _render_live_hints(payload) -> str:
    """`payload` = list[str], one short sentence per currently-visible hint card.

    Replaces the static, page-only `render_frame_hints` guesswork with ground
    truth: the exact cards on screen right now. Returns '' for an empty/garbage
    payload so the caller falls back to the static block."""
    # A bare string is iterable — guard it so we never fan a string out into
    # one bullet per character. Only a real list/tuple of sentences counts.
    if not isinstance(payload, (list, tuple)):
        return ""
    items = [s.strip() for s in payload if isinstance(s, str) and s.strip()]
    if not items:
        return ""
    lines = [
        "CURRENTLY VISIBLE side-rail hints — the exact nudge cards on the author's "
        "screen right now. Stay aligned with these; do NOT re-pitch a card they "
        "already have.",
    ]
    lines += [f"- {s}" for s in items]
    return "\n".join(lines)


# The most open-scene prose one turn carries (~3k tokens).
ACTIVE_SCENE_MAX_CHARS = 12_000


def _render_active_scene(payload) -> str:
    """`payload` = the `get_scene_paragraphs` shape for the scene the author has
    open in the editor right now: `{title, paragraphs: [{index, text, ...}]}`.

    Puts the ACTUAL prose of the current scene in front of the model, so a "check
    this scene" / "does this contradict…" request is grounded in what's written
    rather than answered hypothetically. Without this the write page hands Night
    Eyes only a bare `scene_id`, and the sole chat-callable prose reader
    (`get_chapter_prose`) is keyed by *chapter* — so grounding on "this scene"
    needs a multi-step scene→chapter→prose lookup the model tends to skip, and it
    hedges ("IF the scene has her go in calmly…"). Empty prose / missing scene →
    '' so the model falls back to its read tools."""
    if not isinstance(payload, dict):
        return ""
    lines = [
        (p.get("text") or "").strip()
        for p in (payload.get("paragraphs") or [])
        if isinstance(p, dict) and (p.get("text") or "").strip()
    ]
    if not lines:
        return ""
    title = (payload.get("title") or "").strip() or "the active scene"
    # Bounded: one scene, and at most ACTIVE_SCENE_MAX_CHARS of it, so a very
    # long scene can't blow up every turn's prompt (series scale).
    # A paragraph that doesn't fit is cut mid-way (when nothing is kept yet) or
    # left out; either way the note below tells the model the text is partial.
    kept, used, cut = [], 0, False
    for line in lines:
        room = ACTIVE_SCENE_MAX_CHARS - used
        if len(line) > room:
            cut = True
            if not kept:
                kept.append(line[:room])
            break
        kept.append(line)
        used += len(line)
    body = "\n\n".join(kept)
    if cut:
        body += ("\n\n[Cut here: the scene goes on. Call get_chapter_prose with "
                 "the open chapter id for the rest.]")
    return (
        f'THE SCENE THE AUTHOR IS EDITING RIGHT NOW — "{title}". This is the '
        'current prose on their screen, verbatim. When they say "this scene" or '
        '"here", they mean THIS text. Ground any consistency check on it directly '
        '— quote what actually happens; never answer hypothetically about what '
        "the scene might contain.\n\n"
        f"{body}"
    )


# key in the hidden `context` dict -> renderer. The extension point: a future
# hidden field registers here, and `build_system_prompt` picks it up for free.
CONTEXT_BLOCK_RENDERERS = {
    "live_hints": _render_live_hints,
    "active_scene": _render_active_scene,
}


def enrich_context(context, session):
    """Add server-derived hidden-context keys before prompt assembly.

    Today: `active_scene`. The frontend sends only the `scene_id` the author is
    editing (plus `chapter_id`; see frontend modules/chat/pageContext.ts); we
    read that scene's SAVED prose here (server-authoritative, so the block
    can't drift from what's stored) and stash it under `active_scene` for
    `_render_active_scene`. A `chapter_id` that isn't this project's chapter is
    dropped, so the prompt never names a chapter the model can't read. Returns
    a shallow-copied, enriched context; the input is never mutated. A no-op
    (returns the original) when there's no scene_id / chapter_id / project, so
    non-write pages are unaffected."""
    scene_id = (context or {}).get("scene_id")
    chapter_id = (context or {}).get("chapter_id")
    project_id = getattr(session, "project_id", None)
    if not (scene_id or chapter_id) or not project_id:
        return context
    try:
        from types import SimpleNamespace

        from outline.engine import scene_paragraphs as sp
        from outline.models import Chapter
        from outline.store import load_scene

        enriched = dict(context or {})
        if chapter_id and not Chapter.objects.filter(
                project_id=project_id, uid=str(chapter_id)).exists():
            enriched.pop("chapter_id")
        scene = load_scene(SimpleNamespace(project_id=project_id), scene_id) if scene_id else None
        if scene is None:
            return enriched
        enriched["active_scene"] = {
            "title": scene.get("text") or "",
            "paragraphs": sp.scene_paragraphs(scene),
        }
        return enriched
    except Exception:  # noqa: BLE001 — enrichment must never break a chat turn
        return context


def render_context_blocks(context) -> list[str]:
    """Render each present, non-empty hidden-context key via its registered
    renderer, in registry order. Returns [] when `context` is empty or carries
    no known keys (so the prompt is unchanged from today's behaviour)."""
    if not context:
        return []
    blocks = []
    for key, render in CONTEXT_BLOCK_RENDERERS.items():
        if context.get(key):
            block = render(context[key])
            if block:
                blocks.append(block)
    return blocks


def has_live_hints(context) -> bool:
    """True when the turn carried a non-empty `live_hints` payload — the signal
    that the live block should REPLACE the static `render_frame_hints` block."""
    return bool(_render_live_hints((context or {}).get("live_hints")))
