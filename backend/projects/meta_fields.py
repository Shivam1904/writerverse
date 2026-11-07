"""Canonicalisation for `update_project_meta` patches.

The AI tool schema historically exposed legacy singular `genre`/`theme` strings
and accepted free-text for the coded-choice fields (perspective/tense/audience),
so models sometimes emit a patch the World form can't render and commit can't
safely persist — e.g. `genre` is `varchar(20)` and a label like "Science
Fiction, Psychological Thriller" overflows it.

`canonicalize_meta_patch` folds/coerces a patch into the canonical field set the
frontend speaks — plural genre/theme lists, coded perspective/tense/audience —
so the existing form renders every field AND accept commits cleanly. It is pure
(no Django imports) and idempotent: running it on an already-canonical patch is a
no-op, so it is safe to apply at gather (create), commit (accept), and serve
(rehydration) time alike.
"""
from __future__ import annotations

import re
from typing import Any

# Map a normalised label/code → the model's stored choice code. Keys are the
# input stripped to lowercase alphanumerics (see `_coerce_choice`).
PERSPECTIVE_CODES: dict[str, str] = {
    "first": "first", "firstperson": "first", "1st": "first",
    "second": "second", "secondperson": "second", "2nd": "second",
    # Bare "third person" is ambiguous; default to the more common limited POV.
    "third": "third-limited", "thirdperson": "third-limited",
    "thirdlimited": "third-limited", "thirdpersonlimited": "third-limited",
    "limited": "third-limited",
    "thirdomniscient": "third-omniscient", "thirdpersonomniscient": "third-omniscient",
    "omniscient": "third-omniscient",
    "multiple": "multiple", "alternating": "multiple",
    "multiplepov": "multiple", "multipov": "multiple",
}
TENSE_CODES: dict[str, str] = {
    "past": "past", "pasttense": "past",
    "present": "present", "presenttense": "present",
    "mixed": "mixed", "mixedtense": "mixed",
}
AUDIENCE_CODES: dict[str, str] = {
    "children": "children", "child": "children", "kids": "children",
    "middlegrade": "middle-grade", "mg": "middle-grade",
    "youngadult": "young-adult", "youngadults": "young-adult",
    "ya": "young-adult", "teen": "young-adult", "teens": "young-adult",
    "adult": "adult", "adults": "adult",
    "general": "general", "generalaudience": "general", "allages": "general",
}

_CHOICE_FIELDS = (
    ("perspective", PERSPECTIVE_CODES),
    ("tense", TENSE_CODES),
    ("audience", AUDIENCE_CODES),
)


def _coerce_choice(value: Any, codes: dict[str, str]) -> Any:
    """Map a human label to a stored choice code, else keep the original."""
    norm = re.sub(r"[^a-z0-9]+", "", str(value).lower())
    return codes.get(norm, value)


def _fold_singular(patch: dict[str, Any], singular: str, plural: str, *, split: bool) -> None:
    """Drop the legacy singular string key and merge its value into the plural
    list (deduped, case-insensitive). `split=True` treats a comma list as
    multiple entries (genres); `split=False` keeps it whole (a theme statement)."""
    raw = patch.pop(singular, None)
    text = (raw or "").strip() if isinstance(raw, str) else ""
    if not text:
        return
    items = [p.strip() for p in text.split(",")] if split else [text]
    existing = patch.get(plural)
    merged = list(existing) if isinstance(existing, list) else []
    seen = {x.lower() for x in merged if isinstance(x, str)}
    for it in items:
        if it and it.lower() not in seen:
            merged.append(it)
            seen.add(it.lower())
    patch[plural] = merged


def canonicalize_meta_patch(patch: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of `patch` in the canonical meta field set (idempotent)."""
    if not isinstance(patch, dict):
        return patch
    out = dict(patch)
    _fold_singular(out, "genre", "genres", split=True)
    _fold_singular(out, "theme", "themes", split=False)
    for key, codes in _CHOICE_FIELDS:
        if out.get(key):
            out[key] = _coerce_choice(out[key], codes)
    return out


def canonicalize_pov_mode(value: Any) -> str:
    """Map a free-text POV/perspective label to a stored code
    (first / second / third-limited / third-omniscient / multiple).
    Blank or unrecognised input → "" (treated as unset). Idempotent: a value
    that is already a code round-trips to itself."""
    if not value:
        return ""
    norm = re.sub(r"[^a-z0-9]+", "", str(value).lower())
    return PERSPECTIVE_CODES.get(norm, "")
