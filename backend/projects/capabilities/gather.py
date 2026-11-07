"""Gather layer — project page (update_project_meta)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from projects.meta_fields import canonicalize_meta_patch

_META_ALLOWED: dict[str, str] = {
    "title": "string",
    "description": "string",
    "synopsis": "string",
    # Input aliases only: canonicalize_meta_patch folds them into themes/genres
    # (there are no singular columns).
    "theme": "string",
    "genre": "string",
    "genres": "list",
    "tones": "list",
    "themes": "list",
    "logline": "string",
    "perspective": "string",
    "tense": "string",
    "audience": "string",
}

_UNSET = object()


def gather_update_project_meta(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    for field_name, field_type in _META_ALLOWED.items():
        val = args.get(field_name, _UNSET)
        if val is _UNSET:
            continue
        if field_type == "string":
            stripped = (val or "").strip()
            # A book must keep a name: an empty title in the args (the AI often
            # passes every field it knows, blank ones included) must never enter
            # the patch and clobber the existing title on accept-all.
            if field_name == "title" and not stripped:
                continue
            patch[field_name] = stripped
        elif field_type == "list" and isinstance(val, list):
            patch[field_name] = val
    # Fold legacy singular genre/theme into the plural lists the World form
    # renders and coerce label values to choice codes (see meta_fields).
    patch = canonicalize_meta_patch(patch)
    if not patch:
        raise CapabilityError(
            "no fields to update — pass at least one of: " + ", ".join(_META_ALLOWED),
            400,
        )
    # Per-field shape (mirrors the character_edit pipeline): `fields` is the
    # column-keyed patch; the preview callback wraps it as a `meta_edit` proposal
    # that get_project_meta_full + the per-field accept/reject caps understand.
    return {"fields": patch, "project_id": ctx.project_id}


# Cap how much synopsis + idea text feeds the book titler: a short, focused prompt
# (a series can hold thousands of ideas; the first few thousand characters are plenty).
_BOOK_TITLE_SOURCE_CHARS = 4000

# The book/project title: keep it playful and light.
_BOOK_TITLE_TONE = "\n\nThe tone of the title should be playful and light."


def gather_generate_title(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """generate_title's inputs. Normally the caller's own `description`.

    With `from_project` (the World page's "Suggest a title" button), the
    description is built here from the book's synopsis + the author's ideas, so
    the browser never has to load every idea just to name the book."""
    if not args.get("from_project"):
        return dict(args)
    from braindumps.readers import all_braindump_texts

    from projects.models import Project

    project = Project.objects.filter(pk=ctx.project_id).only("synopsis").first()
    synopsis = ((project.synopsis if project else "") or "").strip()
    ideas = [t.strip() for t in all_braindump_texts(ctx.project_id) if t.strip()]
    if not synopsis and not ideas:
        raise CapabilityError(
            "Write a synopsis or a few ideas first, then I can suggest a title.", 400,
        )
    desc = synopsis
    if ideas:
        desc += ("\n\n" if desc else "") + "Notes:\n" + "\n".join(f"- {t}" for t in ideas)
    return {
        "description": desc[:_BOOK_TITLE_SOURCE_CHARS] + _BOOK_TITLE_TONE,
        "case": args.get("case"),
    }
