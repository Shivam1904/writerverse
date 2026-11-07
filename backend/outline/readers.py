"""Outline reads — grand outline, plot threads, scenes."""
from __future__ import annotations

import re

from outline.store import load_chapter_prose, load_outline
from outline.tree import iter_scenes

_WORD_RE = re.compile(r"[a-z0-9']+")


def _outline_beat_proposals_for(project_id) -> dict[str, list]:
    """Pending merge-insert proposals grouped by their target scene_id.

    Mirrors `_beat_proposals_by_thread` but for the grand outline: each proposal row's
    preview is the FULL beat dict the AI produced —
    `{type:'outline_beat_insert', scene_id, index, fields:{text, kind, from_rough,
    from_item}}` — so the read just splices it straight into its scene. Returns
    `{scene_id: [{"id": pid, "index": n, "fields": {...}}]}`."""
    from actions.models import Proposal
    by_scene: dict[str, list] = {}
    if project_id is None:
        return by_scene
    try:
        rows = list(
            Proposal.objects.filter(project_id=project_id, status=Proposal.STATUS_PROPOSED)
            .order_by("created_at")
            .values("id", "proposal")
        )
    except Exception:  # noqa: BLE001 — no DB (unit-test double) → no proposals
        return by_scene
    for r in rows:
        pv = (r["proposal"] or {}).get("preview") or {}
        if pv.get("type") != "outline_beat_insert":
            continue
        sid = pv.get("scene_id")
        if not sid:
            continue
        by_scene.setdefault(sid, []).append(
            {"id": r["id"], "index": pv.get("index", -1), "fields": pv.get("fields") or {}}
        )
    return by_scene


def _merge_outline_proposals(ctx, go: dict) -> dict:
    """Splice pending merge-insert proposals into their target scenes as ghost
    beats — emitting the SAME triad get_thread/get_character_full return
    (`actual_value`/`proposed_value`/`proposed_kind`/`proposal`/`insert`). Real
    beats pass through untouched (only ghosts carry the triad), so a proposed beat
    reads green wherever the outline is rendered. The frontend folds the ghost into
    its editor beat shape at the load boundary, exactly like loadThreads."""
    if not isinstance(go, dict):
        return go
    by_scene = _outline_beat_proposals_for(getattr(ctx, "project_id", None))
    if not by_scene:
        return go
    for place in iter_scenes(go):
        sc = place.scene
        props = by_scene.get(sc.get("id"))
        if not props:
            continue
        beats = sc.setdefault("beats", [])
        for p in props:
            f = p.get("fields") or {}
            kind = f.get("kind") or "text"
            ghost = {
                "id": None, "insert": True,
                "kind": kind, "actual_value": "",
                "proposal": p["id"],
                "proposed_value": f.get("text") or "",
                "proposed_kind": kind,
            }
            if f.get("from_rough"):
                ghost["from_rough"] = f["from_rough"]
            if f.get("from_item"):
                ghost["from_item"] = f["from_item"]
            idx = p.get("index", -1)
            if idx is None or idx < 0 or idx >= len(beats):
                beats.append(ghost)
            else:
                beats.insert(idx, ghost)
    return go


def get_grand_outline(ctx, include_prose=True) -> dict:
    """The whole outline tree. Screens that never show prose (Outline, Threads,
    Walks, ...) pass include_prose=False: the prose is then not even read from
    the database (scenes keep `words`, so word counts still show)."""
    go = load_outline(ctx, include_prose=include_prose is not False)
    return {"grand_outline": _merge_outline_proposals(ctx, go)}


def get_outline_skeleton(ctx) -> dict:
    """Caps refactor Phase 4 (ai_name get_outline): the lean acts→chapters→scenes
    skeleton — ids + titles only, NO beats or prose. Chat's structural map for
    placing beats + editing scenes; get_chapter drills into one chapter."""
    go = load_outline(ctx, include_prose=False) or {}
    acts = []
    for act in go.get("acts") or []:
        chapters = []
        for ch in act.get("chapters") or []:
            scenes = [
                {"scene_id": sc.get("id"), "title": sc.get("text") or ""}
                for sc in ch.get("scenes") or []
            ]
            chapters.append({
                "chapter_id": ch.get("id"),
                "title": ch.get("text") or "",
                "scenes": scenes,
            })
        acts.append({"title": act.get("text") or "", "chapters": chapters})
    return {"acts": acts}


def get_chapter(ctx, chapter_id=None) -> dict:
    """Caps refactor Phase 4: one chapter → its scenes, each with its outline beats
    `[{index, id, text, kind}]`. Source chapter_id from get_outline."""
    from outline.store import load_chapter

    ch = load_chapter(ctx, chapter_id)
    if ch is None:
        return {"chapter_id": chapter_id, "found": False, "scenes": []}
    scenes = []
    for sc in ch.get("scenes") or []:
        beats = [
            {"index": i, "id": b.get("id"),
             "text": b.get("text") or "", "kind": b.get("kind") or "text"}
            for i, b in enumerate(
                x for x in (sc.get("beats") or []) if isinstance(x, dict))
        ]
        scenes.append({
            "scene_id": sc.get("id"),
            "title": sc.get("text") or "",
            "beats": beats,
        })
    return {"chapter_id": chapter_id, "title": ch.get("text") or "",
            "scenes": scenes}


def get_outline_scaffolds(ctx) -> dict:
    """Preset grand-outline bases the writer can init from, each with its act
    names for preview. Drives the empty-outline scaffold picker."""
    from outline.engine import grand_outline_base_options
    from outline.engine.config import BASE_SCAFFOLD
    scaffolds = [
        {
            "id": opt["id"],
            "label": opt["label"],
            "acts": list(BASE_SCAFFOLD.get(opt["id"]) or []),
        }
        for opt in grand_outline_base_options()
    ]
    return {"scaffolds": scaffolds}


def get_thread_scaffolds(ctx) -> dict:
    """The storyline (thread) scaffolds a writer can seed a new thread from —
    each a named beat skeleton (essential headings + fill-in placeholders) with
    its two author-facing summaries. Drives the New-storyline modal's scaffold
    picker. The per-scaffold ``judging`` summary is server-only (AI-critic prompt
    context) and is deliberately withheld from this payload."""
    from pathlib import Path

    import yaml

    path = Path(__file__).resolve().parent / "config" / "thread_scaffolds.yml"
    raw = yaml.safe_load(path.read_text()) or {}
    out = []
    for sid, sc in (raw.get("scaffolds") or {}).items():
        summary = sc.get("summary") or {}
        out.append({
            "id": sid,
            "name": sc.get("name") or sid,
            "suggested": bool(sc.get("suggested")),
            "scope_fit": list(sc.get("scope_fit") or []),
            "about": summary.get("about") or "",
            "using": summary.get("using") or "",
            "beats": [
                {
                    "heading": b.get("heading") or "",
                    "placeholders": list(b.get("placeholders") or []),
                }
                for b in (sc.get("beats") or [])
            ],
        })
    # Suggested scaffolds float to the top; file order is otherwise preserved.
    out.sort(key=lambda s: not s["suggested"])
    return {"thread_scaffolds": out}


def get_plot_threads(ctx, scope_type=None, scope_name=None) -> dict:
    """All threads, slim: id, name, scope, beat_count (NO beats). Use get_thread
    for one thread's beats."""
    from outline.store import load_threads
    threads = load_threads(ctx)
    if scope_type and scope_name:
        threads = [
            t for t in threads
            if (t.get("scope") or {}).get("type") == scope_type
            and (t.get("scope") or {}).get("name") == scope_name
        ]
    out = [
        {"id": t.get("id"), "name": t.get("title") or "",
         "scope": t.get("scope"), "color": t.get("color") or "",
         "beat_count": len(t.get("items") or [])}
        for t in threads if isinstance(t, dict)
    ]
    return {"plot_threads": out}


_BEAT_PROPOSAL_TYPES = ("beat_edit", "beat_insert")


def _beat_proposals_by_thread(project_id, thread_id=None) -> dict[str, tuple[dict, list]]:
    """Pending beat proposals, grouped by thread: `{thread_id: (edits, inserts)}`.
      • edits   → `{beat_id: {"id": pid, ...fields}}` (beat_edit, latest wins)
      • inserts → `[{"id": pid, "index": n, ...fields}]` (beat_insert)
    Each proposal row's preview is `{type, thread_id, beat_id|index, fields:{text?,kind?}}`.

    ONE query, filtered in SQL to beat proposals (and to one thread when
    `thread_id` is given) — not a Python scan of every pending proposal (SA-88)."""
    from actions.models import Proposal
    out: dict[str, tuple[dict, list]] = {}
    if project_id is None:
        return out
    qs = Proposal.objects.filter(
        project_id=project_id, status=Proposal.STATUS_PROPOSED,
        proposal__preview__type__in=_BEAT_PROPOSAL_TYPES,
    )
    if thread_id is not None:
        qs = qs.filter(proposal__preview__thread_id=thread_id)
    try:
        rows = list(qs.order_by("created_at").values("id", "proposal"))
    except Exception:  # noqa: BLE001 — no DB (unit-test double) → no proposals
        return out
    for r in rows:
        pv = (r["proposal"] or {}).get("preview") or {}
        edits, inserts = out.setdefault(pv.get("thread_id"), ({}, []))
        fields = pv.get("fields") or {}
        if pv.get("type") == "beat_edit" and pv.get("beat_id"):
            edits[pv["beat_id"]] = {"id": r["id"], **fields}
        elif pv.get("type") == "beat_insert":
            inserts.append({"id": r["id"], "index": pv.get("index") or 0, **fields})
    return out


def _thread_with_beats(t: dict, edits: dict, inserts: list) -> dict:
    """One thread dict + its pending beat proposals → the get_thread payload."""
    beats = []
    for i, b in enumerate(x for x in (t.get("items") or []) if isinstance(x, dict)):
        actual_text = b.get("text") or ""
        actual_kind = b.get("kind") or "text"
        beat = {"index": i, "id": b.get("id"),
                "kind": actual_kind, "actual_value": actual_text}
        prop = edits.get(b.get("id"))
        if prop:
            beat["proposal"] = prop["id"]
            beat["proposed_value"] = prop.get("text", actual_text)
            beat["proposed_kind"] = prop.get("kind", actual_kind)
        beats.append(beat)
    # Splice ghost inserts in at their index (highest-first keeps lower idxs valid).
    for ins in sorted(inserts, key=lambda x: x["index"]):
        pos = max(0, min(ins["index"], len(beats)))
        ins_kind = ins.get("kind") or "text"
        beats.insert(pos, {
            "index": ins["index"], "id": None, "insert": True,
            "kind": ins_kind, "actual_value": "",
            "proposal": ins["id"],
            "proposed_value": ins.get("text") or "",
            "proposed_kind": ins_kind,
        })

    return {"thread_id": t.get("id"), "found": True,
            "name": t.get("title") or "", "scope": t.get("scope"),
            "color": t.get("color") or "",
            "source": t.get("source"), "template_id": t.get("template_id"),
            "beats": beats}


def get_thread(ctx, thread_id=None) -> dict:
    """One thread by id → its ordered beats, plus the thread's source/template_id.
    The AI edits beats by `index`; the `id` (and source/template_id) are for the
    editor UI, which resolves beat edits by id and tags the thread by source.

    Each beat carries pending AI proposals as the SAME triad get_character_full
    uses (read-time merge of the beat + its pending Proposal):

        {index, id, kind, actual_value,
         proposal?, proposed_value?, proposed_kind?, insert?}

    `actual_value` is the beat's committed text; `kind` its committed kind. When a
    pending `beat_edit` targets the beat, `proposal` is the bare proposal id and
    `proposed_value`/`proposed_kind` are what it would become (latest pending wins;
    a field the edit leaves alone falls back to the actual). A `beat_insert` is
    spliced in at its index as a ghost (`id:None, insert:True, actual_value:""`)
    carrying its own `proposal` + proposed values."""
    from outline.store import load_threads
    threads = load_threads(ctx)
    t = next((x for x in threads
              if isinstance(x, dict) and x.get("id") == thread_id), None)
    if t is None:
        return {"thread_id": thread_id, "found": False, "name": "",
                "scope": None, "source": None, "template_id": None, "beats": []}
    edits, inserts = _beat_proposals_by_thread(ctx.project_id, thread_id).get(thread_id, ({}, []))
    return _thread_with_beats(t, edits, inserts)


def get_threads_with_beats(ctx) -> dict:
    """Every thread with its beats — the get_thread payload for each, in one read.
    For the Threads page, which shows every thread's beats at once: one thread
    load + one proposals query, instead of one get_thread call per thread."""
    from outline.store import load_threads
    threads = [t for t in load_threads(ctx) if isinstance(t, dict)]
    pending = _beat_proposals_by_thread(getattr(ctx, "project_id", None)) if threads else {}
    return {"threads": [
        _thread_with_beats(t, *pending.get(t.get("id"), ({}, [])))
        for t in threads
    ]}


def get_scenes(ctx) -> dict:
    """Every scene flat: scene id + title + its chapter (id + 1-based number across
    the book) + paragraph count. The AI's structural map; use get_scene_paragraphs
    for one scene's prose."""
    from outline.engine import scene_paragraphs as sp
    go = load_outline(ctx) or {}
    out = []
    chapter_number = 0
    for act in go.get("acts") or []:
        for ch in act.get("chapters") or []:
            chapter_number += 1
            for sc in ch.get("scenes") or []:
                out.append({
                    "scene_id": sc.get("id"),
                    "title": sc.get("text") or "",
                    "chapter_id": ch.get("id"),
                    "chapter_number": chapter_number,
                    "paragraph_count": len(sp.scene_paragraphs(sc)),
                })
    return {"scenes": out}


def get_scene_beats(ctx) -> dict:
    """Every scene with its outline beats, flat across the book. Each scene:
    `{scene_id, title, chapter_id, chapter_number, beats:[{index, id, text,
    kind}]}`. The scene-wise view of the grand outline's beat layer — use
    get_scenes for just structure, get_scene_paragraphs for one scene's prose."""
    go = load_outline(ctx, include_prose=False) or {}
    out = []
    chapter_number = 0
    for act in go.get("acts") or []:
        for ch in act.get("chapters") or []:
            chapter_number += 1
            for sc in ch.get("scenes") or []:
                beats = [
                    {"index": i, "id": b.get("id"),
                     "text": b.get("text") or "", "kind": b.get("kind") or "text"}
                    for i, b in enumerate(
                        x for x in (sc.get("beats") or []) if isinstance(x, dict))
                ]
                out.append({
                    "scene_id": sc.get("id"),
                    "title": sc.get("text") or "",
                    "chapter_id": ch.get("id"),
                    "chapter_number": chapter_number,
                    "beats": beats,
                })
    return {"scenes": out}


def get_scene_paragraphs(ctx, scene_id=None) -> dict:
    """A scene as an ordered list of paragraphs — `[{index, text, refs}]` — the
    shape the AI edits by index. `text` is plain prose; `refs` is read-only
    context (entities the author already marked in that paragraph)."""
    from outline.engine import scene_paragraphs as sp
    from outline.store import load_scene

    scene = load_scene(ctx, scene_id)
    if scene is None:
        return {"scene_id": scene_id, "found": False,
                "title": "", "paragraphs": []}
    return {
        "scene_id": scene_id,
        "found": True,
        "title": scene.get("text") or "",
        "paragraphs": sp.scene_paragraphs(scene),
    }


def get_chapter_prose(ctx, chapter_id=None) -> dict:
    """Caps refactor Phase 5: every scene in a chapter with its ordered paragraphs
    `[{index, text, refs}]`. The chat-facing prose read; source chapter_id from
    get_outline. Reads only this chapter's prose."""
    from outline.engine import scene_paragraphs as sp

    ch = load_chapter_prose(ctx, chapter_id)
    if ch is None:
        return {"chapter_id": chapter_id, "found": False, "scenes": []}
    scenes = [
        {"scene_id": sc["id"], "title": sc["title"] or "",
         "paragraphs": sp.scene_paragraphs(sc)}
        for sc in ch["scenes"]
    ]
    return {"chapter_id": chapter_id, "title": ch["title"] or "", "scenes": scenes}


def get_chapter_docs(ctx, chapter_id=None) -> dict:
    """The Write page's prose read: one chapter's scenes, each with its saved
    TipTap doc and `rev` (the prose version number, +1 per change):
    `{chapter_id, found, scenes: [{id, content, rev}]}`. The page loads the
    outline structure without prose (get_grand_outline include_prose=false)
    and fetches prose one chapter at a time with this."""
    ch = load_chapter_prose(ctx, chapter_id)
    if ch is None:
        return {"chapter_id": chapter_id, "found": False, "scenes": []}
    return {"chapter_id": chapter_id, "found": True,
            "scenes": [{"id": sc["id"], "content": sc["content"], "rev": sc["rev"]}
                       for sc in ch["scenes"]]}


def search_prose(ctx, query=None, top_k=8) -> dict:
    """Keyword search across the manuscript's saved scene prose — the "recall
    what's established" reader behind cross-scene consistency checks.

    Night Eyes otherwise reads only the CURRENT chapter's prose, so a fact set up
    earlier ("Mira is terrified of deep water", chapter 1) is invisible when
    checking a later scene — and it hedges or asks the author to paste it. This
    scans EVERY scene's paragraphs for the query terms and returns the best
    passages with their scene + chapter, so a "does this contradict…" check can
    ground on what the manuscript already wrote. Bounded per project (one JSON
    walk, no LLM, no embeddings); a lexical first pass we can later route through
    the pgvector/BM25 hybrid once scene prose is indexed there.

    Returns `{query, passages:[{scene_id, scene_title, chapter_title,
    paragraph_index, text}]}`, best match first."""
    from outline.engine import scene_paragraphs as sp

    terms = [t for t in _WORD_RE.findall((query or "").lower()) if len(t) > 2]
    if not terms:
        return {"query": query or "", "passages": []}
    try:
        k = max(1, min(int(top_k), 25))
    except (TypeError, ValueError):
        k = 8

    go = load_outline(ctx) or {}
    scored: list[tuple[int, dict]] = []
    for place in iter_scenes(go):
        ch_title = place.chapter.get("text") or ""
        sc = place.scene
        sc_title = sc.get("text") or ""
        for para in sp.scene_paragraphs(sc):
            text = (para.get("text") or "").strip()
            if not text:
                continue
            hay = text.lower()
            total = sum(hay.count(t) for t in terms)
            if not total:
                continue
            # Distinct-term coverage dominates raw frequency, so a passage
            # that touches every query term outranks one that just repeats
            # a single term.
            distinct = sum(1 for t in terms if t in hay)
            scored.append((distinct * 1000 + total, {
                "scene_id": sc.get("id"),
                "scene_title": sc_title,
                "chapter_title": ch_title,
                "paragraph_index": para.get("index"),
                "text": text,
            }))

    scored.sort(key=lambda x: x[0], reverse=True)
    return {"query": query or "", "passages": [p for _, p in scored[:k]]}
