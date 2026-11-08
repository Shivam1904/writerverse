from pathlib import Path

import yaml

_FRAMES = None

# D31 + Step 7: a couple of capabilities are useful on every page, so we
# inject them here rather than duplicating them across every frame in
# `night_eyes/config/chat_frames.yml`. Keep this list tight — globals are forever and
# show up in every page's tool dump.
# Orientation set — the Set 0 caps present on EVERY page frame (caps/caps_ordered.md).
# Must name only real, bound, chat-callable tools — pinned by
# night_eyes/tests/test_prompt_tool_names.py.
GLOBAL_TOOL_NAMES = (
    "get_project_overview",
)


def _load():
    global _FRAMES
    if _FRAMES is None:
        path = Path(__file__).resolve().parent / 'config' / 'chat_frames.yml'
        _FRAMES = yaml.safe_load(path.read_text())['frames']
    return _FRAMES

def get_frame(page):
    frames = _load()
    return frames.get(page, frames['default'])

def load_frame_prompt(page, context=None):
    frame = get_frame(page)
    template = frame['prompt']
    for key in frame.get('context_params', []):
        val = (context or {}).get(key, '')
        template = template.replace(f'{{{key}}}', str(val))
    return template

def render_frame_hints(page):
    """Render the page's side-rail hint cards as a prompt section so Night Eyes
    knows what nudges the author can see here. `here` = work on THIS page;
    `next` = cards that navigate to the named page. Returns '' when the frame
    declares no hints."""
    frame = get_frame(page)
    hints = frame.get('hints') or {}
    here = hints.get('here') or []
    nxt = hints.get('next') or []
    if not here and not nxt:
        return ""
    lines = [
        "SIDE-RAIL HINTS — the nudge cards the author can see in the rail on this "
        "page (what they're being pointed toward). Use these to stay aligned with "
        "what's on their screen; don't re-pitch a card they already have.",
    ]
    if here:
        lines.append("What to do here:")
        for h in here:
            lines.append(f'- "{h.get("title", "")}": {h.get("note", "")}')
    if nxt:
        lines.append("What to do next:")
        for h in nxt:
            to = h.get("to")
            arrow = f" → {to}" if to else ""
            lines.append(f'- "{h.get("title", "")}"{arrow}: {h.get("note", "")}')
    return "\n".join(lines)


def load_tool_suffixes(page, bound_names):
    frame = get_frame(page)
    suffixes = frame.get('suffixes', {})
    lines = []
    for name in bound_names:
        if name in suffixes:
            lines.append(f"- {name}: {suffixes[name]}")
    if not lines:
        return ""
    return "Tool guidance:\n" + "\n".join(lines)
