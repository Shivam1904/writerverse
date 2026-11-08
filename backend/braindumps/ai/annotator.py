"""Braindump AI annotation — extract phrases, packs, named entities, and tags
from one brain-dump idea.

Zero Django imports (provider-agnostic, per the ai_engine rule). Long ideas are
split into *overlapping* paragraph chunks and annotated one chunk at a time; the
per-chunk results are then merged into ONE clean annotation set — duplicate
phrases from the overlap are dropped and pack ids are renumbered into a single
continuous sequence (so each chunk's local `pack_1`, `pack_2`… don't collide).

`annotate()` never raises: on an engine/LLM error it returns a ``status:"failed"``
payload so the caller can still persist the failure (and offer a later re-run).

Public API:
    annotate(text, *, role="draft") -> dict   # the ai_data payload (see VERSION)
"""
from __future__ import annotations

import logging
import re
from typing import Any

from . import tags as braindump_tags

logger = logging.getLogger("writerverse.consistency")

VERSION = 3  # v3: each entity carries its OWN craft tags ({kind,name,tags})
# "draft", not "small": on 10 test ideas the small model left 2 untagged and
# added junk tags; draft costs ~$1.50 per 1,000 ideas (wrt-115, 2026-10-20).
DEFAULT_ROLE = "draft"

# Chunking thresholds, in characters. Tunable — dev phase, deliberately simple.
# Cap on an entity's craft tags per phrase (the prompt asks for 2).
MAX_TAGS_PER_ENTITY = 3

SINGLE_CHUNK_CHARS = 1800   # at or below this, one LLM call (no chunking)
CHUNK_CHARS = 1500          # target max size per chunk when splitting
# Overlap is paragraph-level: each chunk after the first repeats the previous
# chunk's last paragraph, so an idea spanning a paragraph boundary still lands
# whole in at least one chunk.

# The extraction prompt (author-authored). `[INSERT KINDS HERE]` / `[INSERT TREE
# HERE]` are replaced with the entity-kind list and the allowed craft-tag tree; the
# example + real input are appended in _build_prompt so "Output JSON only." stays last.
_PROMPT = """You are a story annotation engine.

Your job is NOT to summarize.

Your job is to extract meaningful phrases and annotate them.

Rules:

1. Split the input into the smallest meaningful phrases.
2. Multiple neighboring phrases that belong to the same idea should share a pack_id.
3. Extract every entity you can — people, plot threads, places, objects, rules, and
   any other story thing — even brand-new ones. Give each a short name (use a
   descriptor like "unknown woman" when it has no name yet). Only extract things the
   story could track across scenes. Skip generic everyday nouns that are just props
   or scenery in the sentence (a cup, a door, water, a chair); keep an object only
   if it is named, special, or matters to the plot (the Sword of Ash, a locket
   passed down in her family).
4. TYPE each entity with its `kind` (see Entity kinds). Prefer a specific kind; use
   `world` for any world detail that doesn't fit a specific kind.
5. Only extract entities this text names or clearly refers to (a pronoun counts). When
   one of them is a known entity, reuse its EXACT known name. Never add a known
   entity the text doesn't mention.
6. Give EACH entity its own `tags`: CRAFT tags only (from Allowed tags), saying what
   this phrase tells us about THAT entity. Two people in one phrase rarely share all
   their tags: in "Milo falls for Rosa", the emotion is Milo's, not Rosa's.
   At most 2 tags per entity; pick the ones that matter most. Never put entity
   names in `tags`.
7. Tags about what PEOPLE do, say or want go on those people: an event or goal on
   the people taking part ("Milo and Otto go to Bram's" → event on both), a
   line of dialogue on its speaker. Don't make a separate entity for an action or
   a line ("get the TV back", "my chair"); only a named storyline is a `plot`.
   Places, objects and other non-person entities take World tags only (setting,
   society, history, religion, magic_rule, tech_rule, atmosphere), or none. A place
   has no backstory, goal or relationship.
8. Tag meanings:
   - appearance: a LASTING physical trait (glasses, red hair). Not something that
     happens to them in one scene (losing their pants is an event).
   - backstory: their PAST. Their current job or situation is not backstory.
   - motivation / goal: what they want, now or for the story.
   - relationship: a bond between two people who are both in the phrase.
   - motif / theme: only when the text says it recurs or carries meaning.
9. Prefer specific tags over generic ones. Do not invent information. Preserve wording.
10. Return all potentially useful story fragments, even if incomplete.

For each phrase return:

{
  "text": "...",
  "pack_id": "pack_X",
  "entities": [{"kind": "char", "name": "...", "tags": []}]
}

Entity kinds:

[INSERT KINDS HERE]

Allowed tags (craft):

[INSERT TREE HERE]"""

_EXAMPLE_INPUT = (
    "John finally admitted he started the fire at the mill.\n"
    "Sarah slapped him.\n"
    "Neither of them noticed the old king listening outside the door.\n"
    'John: "I\'d do it again."'
)

_EXAMPLE_OUTPUT = """[
  {"text": "John finally admitted he started the fire at the mill", "pack_id": "pack_1", "entities": [{"kind": "char", "name": "John", "tags": ["confrontation", "turning_point"]}, {"kind": "loc", "name": "The Mill", "tags": ["setting"]}]},
  {"text": "Sarah slapped him", "pack_id": "pack_1", "entities": [{"kind": "char", "name": "Sarah", "tags": ["event", "emotion"]}, {"kind": "char", "name": "John", "tags": ["relationship"]}]},
  {"text": "the old king listening outside the door", "pack_id": "pack_1", "entities": [{"kind": "char", "name": "Old King", "tags": ["turning_point"]}]},
  {"text": "John: \\"I'd do it again.\\"", "pack_id": "pack_2", "entities": [{"kind": "char", "name": "John", "tags": ["dialogue", "flaw"]}]}
]"""


# --------------------------------------------------------------------------- #
# Entity kinds + craft-tag tree
# --------------------------------------------------------------------------- #

# Entity-kind vocabulary the model may assign (kind -> human hint). char/plot/world
# map to the Character/Plot/World tag groups; loc/item/rule/magic/faction/culture/
# history/creature are the world sections. `world` is the catch-all fallback.
_KINDS: list[tuple[str, str]] = [
    ("char", "a person / character"),
    ("plot", "a plot thread or arc"),
    ("loc", "a location / place"),
    ("item", "a named or plot-relevant object (never an everyday prop like a cup)"),
    ("rule", "a rule or law of the world"),
    ("magic", "a magic system or power"),
    ("faction", "a group, organisation, or faction"),
    ("culture", "a culture, custom, or society"),
    ("history", "a historical event or era"),
    ("creature", "a creature or species"),
    ("world", "any other world detail (use when unsure)"),
]


def _render_kinds() -> str:
    return "\n".join(f"{k}: {hint}" for k, hint in _KINDS)


def _render_tree() -> str:
    """The allowed CRAFT-tag vocabulary fed to the model — the active categories only.
    Entity TYPES are now carried by each entity's `kind` (not a type-tag), so the
    archived `Entity` group is no longer rendered. One line per group:
    ``Group: tag1, tag2, …``."""
    lines: list[str] = []
    for name, grp in braindump_tags.tag_categories().items():
        tags = ", ".join(grp.get("tags") or [])
        lines.append(f"{name}: {tags}")
    return "\n".join(lines)


def _render_known(known: list | None) -> str:
    """The 'known entities' block — the story's existing cast/places/things/threads.
    Telling the model these up front makes it REUSE the exact canonical name when a
    fragment refers to one (so the graph stays deduped), and helps it catch a
    recurring entity it might otherwise miss. Empty when the story has none yet."""
    names = [str(n).strip() for n in (known or []) if str(n).strip()]
    if not names:
        return ""
    return (
        "Known entities — the people, places, things, and threads already in this "
        "story. When a phrase refers to one of these, reuse its EXACT name in "
        "`entities` (don't invent a variant):\n"
        + ", ".join(names)
    )


def _build_prompt(chunk: str, tree: str, kinds: str, known_block: str = "") -> str:
    return (
        _PROMPT.replace("[INSERT KINDS HERE]", kinds).replace("[INSERT TREE HERE]", tree)
        + (f"\n\n{known_block}" if known_block else "")
        + "\n\nExample\nInput:\n"
        + _EXAMPLE_INPUT
        + "\n\nOutput:\n"
        + _EXAMPLE_OUTPUT
        + "\n\nInput:\n"
        + chunk
        + "\n\nOutput JSON only."
    )


# --------------------------------------------------------------------------- #
# Chunking
# --------------------------------------------------------------------------- #

def _hard_split(para: str, size: int) -> list[str]:
    """Split one oversized paragraph into <=size pieces, preferring sentence
    boundaries, falling back to fixed char windows."""
    if len(para) <= size:
        return [para]
    pieces: list[str] = []
    buf = ""
    for sent in re.split(r"(?<=[.!?])\s+", para):
        if buf and len(buf) + len(sent) + 1 > size:
            pieces.append(buf)
            buf = sent
        else:
            buf = f"{buf} {sent}".strip()
    if buf:
        pieces.append(buf)
    # A single sentence longer than `size` still needs a hard cut.
    out: list[str] = []
    for p in pieces:
        while len(p) > size:
            out.append(p[:size])
            p = p[size:]
        if p:
            out.append(p)
    return out


def _chunk(text: str) -> list[str]:
    """Split into overlapping paragraph chunks. Returns [text] when short enough."""
    if len(text) <= SINGLE_CHUNK_CHARS:
        return [text]
    paras: list[str] = []
    for raw in re.split(r"\n\s*\n", text):
        p = raw.strip()
        if not p:
            continue
        paras.extend(_hard_split(p, CHUNK_CHARS))
    if not paras:
        return [text]

    chunks: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for p in paras:
        if cur and cur_len + len(p) > CHUNK_CHARS:
            chunks.append("\n\n".join(cur))
            # Overlap: carry the previous chunk's last paragraph into this one.
            cur = [cur[-1]]
            cur_len = len(cur[-1])
        cur.append(p)
        cur_len += len(p)
    if cur:
        chunks.append("\n\n".join(cur))
    return chunks


# --------------------------------------------------------------------------- #
# Normalise + merge
# --------------------------------------------------------------------------- #

def _as_str_list(val: Any) -> list[str]:
    if not isinstance(val, list):
        return []
    out: list[str] = []
    for v in val:
        s = str(v).strip()
        if s:
            out.append(s)
    return out


def _dedup(seq: list[str]) -> list[str]:
    """Order-preserving de-dup (case-sensitive — tags are snake_case, entity
    names keep their casing)."""
    seen: set[str] = set()
    out: list[str] = []
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _as_entity_list(val: Any) -> list[dict]:
    """Coerce raw entities → ``[{'kind': str, 'name': str, 'tags': [str]}]``. Accepts
    the v3 typed dicts ``{kind,name,tags}`` and, for resilience, bare strings
    (→ untyped, ``kind=''``, no tags)."""
    if not isinstance(val, list):
        return []
    out: list[dict] = []
    for v in val:
        if isinstance(v, dict):
            name = str(v.get("name") or "").strip()
            kind = str(v.get("kind") or "").strip().lower()
            tags = _as_str_list(v.get("tags"))
        else:
            name, kind, tags = str(v).strip(), "", []
        if name:
            out.append({"kind": kind, "name": name, "tags": tags})
    return out


def _clean_entity_tags(e: dict) -> list[str]:
    """An entity's own craft tags, checked: known tags only, World tags only for a
    non-person, at most MAX_TAGS_PER_ENTITY (the prompt asks for 2; one spare)."""
    allowed = braindump_tags.all_tags()
    cats = braindump_tags.tag_categories()
    world = set(cats.get("World", {}).get("tags") or [])
    plot = set(cats.get("Plot", {}).get("tags") or [])
    tags = [t for t in _dedup(e.get("tags") or []) if t in allowed]
    if e.get("kind") == "plot":   # a named storyline: plot or world tags
        tags = [t for t in tags if t in plot or t in world]
    elif e.get("kind") != "char":
        tags = [t for t in tags if t in world]
    return tags[:MAX_TAGS_PER_ENTITY]


def _named_in(name: str, text_norm: str) -> bool:
    """True when `name` appears in the (normalised) idea text. A leading "the" is
    optional, so "The Mill" matches "the mill" and "mill"."""
    n = _norm(name)
    if n.startswith("the "):
        n = n[4:]
    # Whole words only, so "TV" doesn't match inside "activity".
    return bool(n) and re.search(rf"\b{re.escape(n)}\b", text_norm) is not None


def _entity_key(e: dict) -> tuple:
    """Identity for de-dup: (kind, normalised-name)."""
    return (e.get("kind") or "", _norm(e.get("name") or ""))


def _dedup_entities(seq: list[dict]) -> list[dict]:
    """Order-preserving de-dup by (kind, normalised name); keeps first casing and
    unions the duplicates' tags."""
    by_key: dict = {}
    out: list[dict] = []
    for e in seq:
        k = _entity_key(e)
        if not k[1]:
            continue
        if k in by_key:
            kept = by_key[k]
            kept["tags"] = _dedup((kept.get("tags") or []) + (e.get("tags") or []))
            continue
        e = {**e, "tags": list(e.get("tags") or [])}
        by_key[k] = e
        out.append(e)
    return out


def _phrase_tags(entities: list[dict]) -> list[str]:
    """A phrase's craft tags: the union of its entities' own tags."""
    return _dedup([t for e in entities for t in (e.get("tags") or [])])


def _coerce_phrases(resp: Any, chunk_idx: int) -> list[dict]:
    """One chunk's raw LLM response → normalised phrase dicts (text/pack_id/
    entities/tags + the source chunk index, used only during merge)."""
    items = resp if isinstance(resp, list) else (resp.get("phrases") if isinstance(resp, dict) else None)
    out: list[dict] = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        text = str(it.get("text") or "").strip()
        if not text:
            continue
        entities = _as_entity_list(it.get("entities"))
        # Older answer shape: tags on the phrase, not on each entity. Hand them to
        # the entities that came without their own, so nothing is lost.
        phrase_tags = _as_str_list(it.get("tags"))
        for e in entities:
            if not e["tags"]:
                e["tags"] = list(phrase_tags)
            e["tags"] = _clean_entity_tags(e)
        allowed = braindump_tags.all_tags()
        out.append({
            "text": text,
            "pack_id": str(it.get("pack_id") or "").strip(),
            "entities": entities,
            "tags": _phrase_tags(entities) if entities else [t for t in _dedup(phrase_tags) if t in allowed],
            "_chunk": chunk_idx,
        })
    return out


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _merge(phrases: list[dict]) -> list[dict]:
    """Dedupe overlap-duplicate phrases (by normalised text) and renumber pack ids
    into one continuous sequence — while keeping phrases that shared a pack WITHIN
    a chunk grouped together. Dropping a duplicate unions its tags/entities into
    the kept copy so nothing the overlap surfaced is lost."""
    kept: dict[str, dict] = {}
    order: list[dict] = []
    for i, p in enumerate(phrases):
        key = _norm(p["text"])
        if not key:
            continue
        if key in kept:
            k = kept[key]
            k["tags"] = _dedup(k["tags"] + p["tags"])
            k["entities"] = _dedup_entities(k["entities"] + p["entities"])
            continue
        p = dict(p)
        p["_i"] = i
        kept[key] = p
        order.append(p)

    pack_map: dict[tuple, str] = {}
    counter = 0
    out: list[dict] = []
    for p in order:
        # Phrases with no pack_id each get their own pack; otherwise group by
        # (chunk, original pack) so a chunk's local pack stays one pack.
        raw_pack = p.get("pack_id")
        pack_key = (p.get("_chunk", 0), raw_pack) if raw_pack else ("_solo", p["_i"])
        if pack_key not in pack_map:
            counter += 1
            pack_map[pack_key] = f"pack_{counter}"
        out.append({
            "text": p["text"],
            "pack_id": pack_map[pack_key],
            "entities": p["entities"],
            "tags": p["tags"],
        })
    return out


# --------------------------------------------------------------------------- #
# Public
# --------------------------------------------------------------------------- #

def _rollup_entities(phrases: list[dict]) -> list[dict]:
    """Per-entity craft-tag rollup: for each unique (kind, name) across phrases,
    union that entity's OWN tags from each phrase. Returns
    ``[{'kind', 'name', 'tags'}]`` in first-seen order — the view the UI renders as
    ``Name | tag, tag``. Tags are per entity, so in "Milo falls for Rosa" the
    emotion stays on Milo and doesn't spread to Rosa."""
    order: list[tuple] = []
    by_key: dict[tuple, dict] = {}
    for p in phrases:
        for e in p.get("entities") or []:
            k = _entity_key(e)
            if not k[1]:
                continue
            rec = by_key.get(k)
            if rec is None:
                rec = {"kind": e.get("kind") or "", "name": e["name"], "tags": []}
                by_key[k] = rec
                order.append(k)
            rec["tags"] = _dedup(rec["tags"] + (e.get("tags") or []))
    return [by_key[k] for k in order]


def _drop_unnamed(phrases: list[dict], text: str) -> None:
    """Remove places, things and other non-person entities whose name isn't in the
    idea's text: the model sometimes borrows a known name the idea never mentions
    ("Apartment" on "she moves in across the hall"). People stay, since a pronoun
    can refer to them, and so do storylines, whose names are coined ("The Heist").
    Mutates the phrases and refreshes their tags."""
    text_norm = _norm(text)
    for p in phrases:
        before = p.get("entities") or []
        kept = [
            e for e in before
            if e.get("kind") in ("char", "plot") or _named_in(e.get("name") or "", text_norm)
        ]
        if len(kept) != len(before):
            p["entities"] = kept
            p["tags"] = _phrase_tags(kept)


def _payload(status: str, phrases: list[dict], *, role: str, chunk_count: int,
             error: str | None = None) -> dict:
    out = {
        "version": VERSION,
        "status": status,
        "phrases": phrases,
        "entities": _rollup_entities(phrases),                  # [{kind,name,tags}]
        "tags": _dedup([t for p in phrases for t in p["tags"]]),  # flat craft tags
        "meta": {"role": role, "chunked": chunk_count > 1, "chunk_count": chunk_count},
    }
    if error:
        out["error"] = error
    return out


def _canonicalize(phrases: list[dict], known_map: dict[str, str]) -> None:
    """Map each extracted entity NAME to its canonical form when it matches a known
    one (case/space-insensitive) — so the deduped graph names win even if the model
    returned a variant. Mutates phrase entity dicts in place."""
    if not known_map:
        return
    for p in phrases:
        for e in p.get("entities") or []:
            canon = known_map.get(_norm(e.get("name") or ""))
            if canon:
                e["name"] = canon
        p["entities"] = _dedup_entities(p["entities"])


def annotate(text: str, *, role: str = DEFAULT_ROLE, known_entities: list | None = None) -> dict:
    """Annotate one brain-dump idea. Returns the ai_data payload (never raises).

    `known_entities` (the project's already-known entity names) are fed into the
    prompt for recognition/reuse, then used to canonicalise the output — so the
    story's entity set self-reinforces instead of fragmenting into variants."""
    text = (text or "").strip()
    # normalised → canonical name; first occurrence wins (caller dedups upstream).
    known_map: dict[str, str] = {}
    for n in (known_entities or []):
        k = _norm(str(n))
        if k and k not in known_map:
            known_map[k] = str(n).strip()

    if not text:
        return _payload("ok", [], role=role, chunk_count=0)

    chunks = _chunk(text)
    tree = _render_tree()
    kinds = _render_kinds()
    known_block = _render_known(known_entities)
    raw: list[dict] = []
    try:
        from ai_engine.llm_utils import ask_json

        for idx, ch in enumerate(chunks):
            resp = ask_json(_build_prompt(ch, tree, kinds, known_block), role=role, tag="braindump_annotate",
                           expect=(list, dict))
            raw.extend(_coerce_phrases(resp, idx))
    except Exception as exc:  # noqa: BLE001 — best-effort; the idea is already saved
        logger.exception("braindump annotate failed (chunks=%d)", len(chunks))
        return _payload("failed", [], role=role, chunk_count=len(chunks), error=str(exc)[:200])

    merged = _merge(raw)
    _canonicalize(merged, known_map)
    _drop_unnamed(merged, text)
    return _payload("ok", merged, role=role, chunk_count=len(chunks))
