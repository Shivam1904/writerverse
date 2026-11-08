"""Gauge store — the one read and the one write for a project's gauges.

The app works with one plain dict per project (the shape `GaugeStore.data`
used to hold)::

    {"presets":   {uid: {…config…}},
     "bindings":  [{binding_id, ref:{kind,id}, scope_type, scope_name, …}],
     "suggested": [{id, lens_id, …}],
     "invented":  [{id, …full spec…}],
     "analyses":  {binding_id: {data_points: [...], verdict, score, …}}}

`load_gauges` builds that dict from the tables; `save_gauges` makes the tables
match a dict, writing only the rows that changed. The pure writers in
`gauges/binding.py` never see the tables.

How a dict entry maps to a row: a key goes into its own column only when the
column can give the exact value back (a non-empty string, a float, a UTC time
in the `common.timeutil` stamp format). Anything else — other keys, a
`None`, an empty string, an int score — stays in the row's JSON field. So a
save then a load gives the same dict back.

A data point's `scene_id` (the scene's uid) is stored as a real link to the
`Scene` row. A uid that matches no scene of the project stays in `extra` as
text, so it still comes back. Deleting a scene deletes its points.

Two things are on purpose NOT exact:
  * A character binding linked to a character shows that character's CURRENT
    name as `scope_name` (so a rename follows). Its `binding_id` keeps the name
    it was bound under — it is only a key.
  * An analysis whose binding is gone has no row to hang on, so it is dropped.
"""
from __future__ import annotations

import logging
from datetime import datetime
from types import SimpleNamespace

from common.timeutil import iso, parse_iso
from django.db import transaction
from django.db.models import F, Prefetch

logger = logging.getLogger("writerverse.gauges")

_SECTIONS = ("presets", "bindings", "suggested", "invented", "analyses")
_KINDS = ("suggested", "invented")


def _models():
    from outline.models import Scene

    from gauges import models as m
    return SimpleNamespace(
        Preset=m.GaugePreset, Binding=m.GaugeBinding, Candidate=m.GaugeCandidate,
        Analysis=m.GaugeAnalysis, Point=m.GaugeDataPoint, Scene=Scene,
    )


# ---- dict key ↔ column, exactly ---------------------------------------------- #

def _pop_str(rest: dict, key: str, max_len: int | None = None) -> str:
    v = rest.get(key)
    if isinstance(v, str) and v and (max_len is None or len(v) <= max_len):
        del rest[key]
        return v
    return ""


def _pop_float(rest: dict, key: str) -> float | None:
    v = rest.get(key)
    if isinstance(v, float):
        del rest[key]
        return v
    return None


def _pop_time(rest: dict, key: str) -> datetime | None:
    """A stamp as a datetime — only if it prints back to the same text."""
    dt = parse_iso(rest.get(key), exact=True)
    if dt is not None:
        del rest[key]
    return dt


def _put(d: dict, key: str, value) -> None:
    if value not in ("", None):
        d[key] = value


def _valid_key(v, max_len: int) -> bool:
    return isinstance(v, str) and bool(v) and len(v) <= max_len


# ---- rows → dicts ------------------------------------------------------------ #

def _preset_to_dict(p) -> dict:
    d = {"id": p.uid}
    _put(d, "name", p.name)
    _put(d, "type_id", p.type_id)
    d.update(p.config or {})
    return d


def _binding_to_dict(b) -> dict:
    d: dict = {"binding_id": b.binding_id}
    if b.ref_kind or b.ref_id:
        d["ref"] = {"kind": b.ref_kind, "id": b.ref_id}
    _put(d, "scope_type", b.scope_type)
    # Linked character → its current name, so a rename shows up here.
    _put(d, "scope_name", b.character.name if b.character_id else b.scope_name)
    _put(d, "thread_ref", b.thread_ref)
    _put(d, "source", b.source)
    if b.bound_at:
        d["bound_at"] = iso(b.bound_at)
    d.update(b.extra or {})
    return d


def _candidate_to_dict(c) -> dict:
    return {"id": c.uid, **(c.spec or {})}


def _point_to_dict(p) -> dict:
    d: dict = {}
    _put(d, "tick_id", p.tick_id)
    _put(d, "scene_id", p.scene_uid)   # the linked scene's uid (annotated by the load)
    if p.value is not None:
        d["value"] = p.value
    _put(d, "confidence", p.confidence)
    _put(d, "reasoning", p.reasoning)
    d.update(p.extra or {})
    return d


def _analysis_to_dict(a, points) -> dict:
    d: dict = {}
    _put(d, "verdict", a.verdict)
    _put(d, "score", a.score)
    if a.analysed_at:
        d["analysed_at"] = iso(a.analysed_at)
    d.update(a.summary or {})
    if points:
        d["data_points"] = [_point_to_dict(p) for p in points]
    return d


def load_presets(project_id) -> list[dict]:
    """Only the project's presets, in order — one query. For reads that need the
    presets alone (the bank); `load_gauges` also loads every analysis and point."""
    if not project_id:
        return []
    return [_preset_to_dict(p) for p in _models().Preset.objects.filter(project_id=project_id)]


def load_preset_map(project_id) -> dict:
    """The project's presets keyed by uid (the `presets` section of
    `load_gauges`) — one query, no analyses."""
    if not project_id:
        return {}
    return {p.uid: _preset_to_dict(p)
            for p in _models().Preset.objects.filter(project_id=project_id)}


def load_binding(project_id, binding_id: str) -> dict | None:
    """One binding (same dict as in `load_gauges()["bindings"]`), or None."""
    if not project_id or not binding_id:
        return None
    b = (_models().Binding.objects.filter(project_id=project_id, binding_id=binding_id)
         .select_related("character").first())
    return _binding_to_dict(b) if b is not None else None


def load_candidates(project_id, kind: str) -> list[dict]:
    """One candidate list (`suggested` or `invented`), in order — one query."""
    if not project_id:
        return []
    return [_candidate_to_dict(c)
            for c in _models().Candidate.objects.filter(project_id=project_id, kind=kind)]


def load_gauges(project_id) -> dict:
    """The project's gauges as one dict (all five sections, maybe empty)."""
    out: dict = {"presets": {}, "bindings": [], "suggested": [], "invented": [], "analyses": {}}
    if not project_id:
        return out
    m = _models()
    for p in m.Preset.objects.filter(project_id=project_id):
        out["presets"][p.uid] = _preset_to_dict(p)
    for c in m.Candidate.objects.filter(project_id=project_id):
        out[c.kind].append(_candidate_to_dict(c))
    for b in m.Binding.objects.filter(project_id=project_id).select_related("character"):
        out["bindings"].append(_binding_to_dict(b))
    analyses = (m.Analysis.objects.filter(binding__project_id=project_id)
                .select_related("binding")
                .prefetch_related(Prefetch(
                    "points", queryset=m.Point.objects.annotate(scene_uid=F("scene__uid"))))
                .order_by("binding__position", "binding__id"))
    for a in analyses:
        out["analyses"][a.binding.binding_id] = _analysis_to_dict(a, list(a.points.all()))
    return out


# ---- dicts → row fields -------------------------------------------------------- #

def _preset_fields(uid: str, raw: dict, pos: int) -> dict:
    rest = dict(raw)
    if rest.get("id") == uid:
        del rest["id"]
    return {"name": _pop_str(rest, "name", 300), "type_id": _pop_str(rest, "type_id", 80),
            "config": rest, "position": pos}


def _binding_fields(raw: dict, pos: int) -> dict:
    rest = dict(raw)
    rest.pop("binding_id", None)
    ref = rest.get("ref")
    ref_kind = ref_id = ""
    if (isinstance(ref, dict) and set(ref) == {"kind", "id"}
            and _valid_key(ref["kind"], 40) and _valid_key(ref["id"], 200)):
        ref_kind, ref_id = ref["kind"], ref["id"]
        del rest["ref"]
    return {
        "ref_kind": ref_kind, "ref_id": ref_id,
        "scope_type": _pop_str(rest, "scope_type", 40),
        "scope_name": _pop_str(rest, "scope_name", 300),
        "thread_ref": _pop_str(rest, "thread_ref", 200),
        "source": _pop_str(rest, "source", 40),
        "bound_at": _pop_time(rest, "bound_at"),
        "extra": rest, "position": pos,
    }


def _candidate_fields(raw: dict, pos: int) -> dict:
    rest = dict(raw)
    rest.pop("id", None)
    return {"spec": rest, "position": pos}


def _point_fields(raw: dict, scene_pks: dict) -> dict:
    """`scene_pks` maps scene uid → Scene pk. A `scene_id` that names no scene
    of the project stays in `extra` as text."""
    rest = dict(raw)
    value = rest.pop("value") if rest.get("value") is not None else None
    scene_pk = None
    sid = rest.get("scene_id")
    if isinstance(sid, str) and sid in scene_pks:
        scene_pk = scene_pks[sid]
        del rest["scene_id"]
    return {
        "tick_id": _pop_str(rest, "tick_id", 200),
        "scene_id": scene_pk,
        "value": value,
        "confidence": _pop_float(rest, "confidence"),
        "reasoning": _pop_str(rest, "reasoning"),
        "extra": rest,
    }


def _analysis_fields(raw: dict) -> tuple[dict, list[dict]]:
    rest = dict(raw)
    points: list[dict] = []
    dps = rest.get("data_points")
    if isinstance(dps, list) and dps and all(isinstance(p, dict) for p in dps):
        points = rest.pop("data_points")
    fields = {
        "verdict": _pop_str(rest, "verdict"),
        "score": _pop_float(rest, "score"),
        "analysed_at": _pop_time(rest, "analysed_at"),
        "summary": rest,
    }
    return fields, points


# ---- the sync ------------------------------------------------------------------ #

def _apply(obj, fields: dict) -> None:
    """Save only the fields that actually changed (none → no query)."""
    changed = [k for k, v in fields.items() if getattr(obj, k) != v]
    if changed:
        for k in changed:
            setattr(obj, k, fields[k])
        obj.save(update_fields=changed)


def _default_character_finder(project_id, name):
    from outline.store import find_character_id
    return find_character_id(project_id, name)


def _character_for(project_id, fields: dict, existing, find_character) -> int | None:
    """Which character a character binding is about. Keeps the current link
    while the name still matches it (the loaded dict carries the live name), so
    an unchanged save never re-resolves; otherwise looks the name up."""
    if fields["scope_type"] != "character" or not fields["scope_name"]:
        return None
    name = fields["scope_name"].lower()
    if existing is not None and existing.character_id and \
            (existing.character.name or "").strip().lower() == name:
        return existing.character_id
    return find_character(project_id, fields["scope_name"])


def _sync_presets(m, project_id, presets) -> None:
    existing = {p.uid: p for p in m.Preset.objects.filter(project_id=project_id)}
    keep: set[str] = set()
    new = []
    items = presets.items() if isinstance(presets, dict) else []
    for pos, (uid, raw) in enumerate((k, v) for k, v in items
                                     if _valid_key(k, 200) and isinstance(v, dict)):
        keep.add(uid)
        fields = _preset_fields(uid, raw, pos)
        if uid in existing:
            _apply(existing[uid], fields)
        else:
            new.append(m.Preset(project_id=project_id, uid=uid, **fields))
    stale = [uid for uid in existing if uid not in keep]
    if stale:
        m.Preset.objects.filter(project_id=project_id, uid__in=stale).delete()
    if new:
        m.Preset.objects.bulk_create(new)


def _sync_candidates(m, project_id, g: dict) -> None:
    existing = {(c.kind, c.uid): c for c in m.Candidate.objects.filter(project_id=project_id)}
    keep: set = set()
    new = []
    for kind in _KINDS:
        entries = g.get(kind) if isinstance(g.get(kind), list) else []
        for pos, raw in enumerate(e for e in entries if isinstance(e, dict)):
            uid = raw.get("id")
            if not _valid_key(uid, 200) or (kind, uid) in keep:
                logger.warning("gauges: skipped a %s entry with a missing or repeated id %r",
                               kind, uid)
                continue
            keep.add((kind, uid))
            fields = _candidate_fields(raw, pos)
            if (kind, uid) in existing:
                _apply(existing[(kind, uid)], fields)
            else:
                new.append(m.Candidate(project_id=project_id, kind=kind, uid=uid, **fields))
    stale = [c.pk for key, c in existing.items() if key not in keep]
    if stale:
        m.Candidate.objects.filter(pk__in=stale).delete()
    if new:
        m.Candidate.objects.bulk_create(new)


def _sync_bindings(m, project_id, bindings, find_character) -> dict:
    """Returns binding_id → row for every kept binding."""
    existing = {b.binding_id: b for b in
                m.Binding.objects.filter(project_id=project_id).select_related("character")}
    kept: dict = {}
    for pos, raw in enumerate(b for b in (bindings if isinstance(bindings, list) else [])
                              if isinstance(b, dict)):
        bid = raw.get("binding_id")
        if not _valid_key(bid, 500) or bid in kept:
            logger.warning("gauges: skipped a binding with a missing or repeated id %r", bid)
            continue
        fields = _binding_fields(raw, pos)
        obj = existing.get(bid)
        fields["character_id"] = _character_for(project_id, fields, obj, find_character)
        if obj is None:
            obj = m.Binding.objects.create(project_id=project_id, binding_id=bid, **fields)
        else:
            _apply(obj, fields)
        kept[bid] = obj
    stale = [bid for bid in existing if bid not in kept]
    if stale:
        m.Binding.objects.filter(project_id=project_id, binding_id__in=stale).delete()
    return kept


def _sync_points(m, analysis, raws: list[dict], old: list, scene_pks: dict) -> None:
    new = []
    for i, raw in enumerate(raws):
        fields = _point_fields(raw, scene_pks)
        if i < len(old):
            # Deleting a scene deletes its points, which leaves gaps in
            # `position`; renumbering in order (old[i].position >= i) closes them.
            _apply(old[i], {**fields, "position": i})
        else:
            new.append(m.Point(analysis=analysis, position=i, **fields))
    if len(old) > len(raws):
        m.Point.objects.filter(pk__in=[p.pk for p in old[len(raws):]]).delete()
    if new:
        m.Point.objects.bulk_create(new)


def _scene_pks(m, project_id, analyses) -> dict:
    """uid → Scene pk for every scene the data points name (one query)."""
    uids = {p.get("scene_id")
            for raw in (analyses.values() if isinstance(analyses, dict) else [])
            if isinstance(raw, dict) and isinstance(raw.get("data_points"), list)
            for p in raw["data_points"]
            if isinstance(p, dict) and isinstance(p.get("scene_id"), str)}
    uids.discard("")
    if not uids:
        return {}
    return dict(m.Scene.objects.filter(project_id=project_id, uid__in=uids)
                .values_list("uid", "id"))


def _sync_analyses(m, project_id, analyses, bindings: dict) -> None:
    existing = {a.binding_id: a for a in
                m.Analysis.objects.filter(binding__project_id=project_id)
                .prefetch_related("points")}
    keep: set = set()
    scene_pks = _scene_pks(m, project_id, analyses)
    for bid, raw in (analyses.items() if isinstance(analyses, dict) else []):
        binding = bindings.get(bid)
        if binding is None or not isinstance(raw, dict):
            logger.warning("gauges: dropped the analysis of %r (no such binding)", bid)
            continue
        keep.add(binding.pk)
        fields, points = _analysis_fields(raw)
        a = existing.get(binding.pk)
        if a is None:
            a = m.Analysis.objects.create(binding=binding, **fields)
            old = []
        else:
            _apply(a, fields)
            old = sorted(a.points.all(), key=lambda p: p.position)
        _sync_points(m, a, points, old, scene_pks)
    stale = [a.pk for b_pk, a in existing.items() if b_pk not in keep]
    if stale:
        m.Analysis.objects.filter(pk__in=stale).delete()


def save_gauges(project_id, gauges: dict) -> None:
    """Make the project's gauge tables match `gauges` (the whole dict). One
    transaction; unchanged rows are not written."""
    if not project_id or not isinstance(gauges, dict):
        return
    m = _models()
    find_character = _default_character_finder
    with transaction.atomic():
        _sync_presets(m, project_id, gauges.get("presets"))
        _sync_candidates(m, project_id, gauges)
        kept = _sync_bindings(m, project_id, gauges.get("bindings"), find_character)
        _sync_analyses(m, project_id, gauges.get("analyses"), kept)
