"""Capability registrations — gauges (the 3-layer reference model).

Layers: shared **templates** + the user's **presets** → **bindings** (instances
that reference a config) + the **suggested**/**invented** candidate lists.
Capability-only — the FE calls every one via ``callOp`` (the ``op/<cap>/`` route).
No Proposal subsystem: suggested/invented are generated lists; accept materializes
a preset; binding is a separate call.
"""
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route

import gauges.readers as gdata
import gauges.section_lenses as sldata
from gauges import lenses
from gauges.capabilities.commit import (
    commit_analyse_gauge,
    commit_extract_gauge_scale,
    commit_save_gauges,
)
from gauges.capabilities.execute import (
    execute_accept_invention,
    execute_accept_suggestion,
    execute_add_invention,
    execute_analyse_gauge,
    execute_bind_gauge,
    execute_create_preset,
    execute_delete_preset,
    execute_dismiss_candidate,
    execute_extract_gauge_scale,
    execute_invent_lens_from_ask,
    execute_set_gauge_view,
    execute_suggest_custom_gauges,
    execute_suggest_gauges,
    execute_unbind_gauge,
    execute_update_gauge,
    execute_update_preset,
)
from gauges.capabilities.gather import (
    gather_analyse_gauge,
    gather_extract_gauge_scale,
    gather_invent_lens_from_ask,
    gather_passthrough,
    gather_suggest_custom_gauges,
    gather_suggest_gauges,
)

_PAGE = ("Gauges",)
_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)


def _reader(fetch):
    def _gather(ctx, args):
        return fetch(ctx, **args)
    return _gather


def _w(name, description, *, gather, execute, commit, args=None, uses_ai=False, label=""):
    register(Capability(
        name=name, description=description, route=Route.WRITE,
        args=args or {}, gather=gather, execute=execute, commit=commit,
        pages=_PAGE, actors=_NO_CHAT, uses_ai=uses_ai, label=label,
    ))


# ---- reads ---------------------------------------------------------------- #

# The bank is two reads: the static shared catalogue (same for every project, the
# frontend reads it once per session) and the author's small per-project presets.
register(Capability(
    name="get_gauge_catalogue",
    description="The shared lens templates grouped by type + vocab. Static (config only). No args.",
    route=Route.READ, gather=_reader(gdata.get_gauge_catalogue), pages=_PAGE, actors=_NO_CHAT,
))
register(Capability(
    name="get_gauge_presets",
    description="The user's reusable presets (the per-project half of the bank). No args.",
    route=Route.READ, gather=_reader(gdata.get_gauge_presets), pages=_PAGE, actors=_NO_CHAT,
))
register(Capability(
    name="get_section_lenses",
    description="The lighter SECTION lens bank — curated per-section consistency questions, tagged section/sub/scope. Section-pure (not in the page bank). No args.",
    route=Route.READ, gather=_reader(sldata.get_section_lenses), pages=_PAGE, actors=_NO_CHAT,
))
register(Capability(
    name="get_gauge_suggestions",
    description="source=suggested — the candidate list (each references a template + scope hint). No args.",
    route=Route.READ, gather=_reader(gdata.get_gauge_suggestions), pages=_PAGE, actors=_NO_CHAT,
))
register(Capability(
    name="get_gauge_inventions",
    description="source=invented — the candidate list (each carries a full AI spec). No args.",
    route=Route.READ, gather=_reader(gdata.get_gauge_inventions), pages=_PAGE, actors=_NO_CHAT,
))
register(Capability(
    name="get_gauge_board",
    description="The charts page — every bound instance, resolved through its ref + scope + analysis. No args.",
    route=Route.READ, gather=_reader(gdata.get_gauge_board), pages=_PAGE, actors=_NO_CHAT,
))


# ---- preset layer (the user's reusable bank) ------------------------------ #

_w("create_preset",
   "Add a reusable preset to the user's bank from a full config (author custom, or "
   "save an edited template). Does NOT bind. Returns preset_id.",
   gather=gather_passthrough, execute=execute_create_preset, commit=commit_save_gauges,
   args={"config": "object"})

_w("update_preset",
   "Edit a preset (its live instances reflect the change). Args: preset_id + the fields to merge.",
   gather=gather_passthrough, execute=execute_update_preset, commit=commit_save_gauges,
   args={"preset_id": "string"})

_w("delete_preset",
   "Delete one of the user's presets (templates can't be deleted; bound instances survive).",
   gather=gather_passthrough, execute=execute_delete_preset, commit=commit_save_gauges,
   args={"preset_id": "string"})

_w("accept_suggestion",
   "Materialize a preset from a suggested candidate (the entry stays in the list). Returns preset_id.",
   gather=gather_passthrough, execute=execute_accept_suggestion, commit=commit_save_gauges,
   args={"id": "string"})

_w("accept_invention",
   "Materialize a preset from an invented candidate (the entry stays in the list). Returns preset_id.",
   gather=gather_passthrough, execute=execute_accept_invention, commit=commit_save_gauges,
   args={"id": "string"})

_w("add_invention",
   "Add ONE fully-specified invented lens to the `invented` list (deterministic, no LLM) — "
   "the section-lens path authors the whole build_preset spec client-side. Returns id.",
   gather=gather_passthrough, execute=execute_add_invention, commit=commit_save_gauges,
   args={"spec": "object"})

_w("dismiss_suggestion", "Remove one suggested candidate from the list.",
   gather=gather_passthrough, execute=execute_dismiss_candidate("suggested"),
   commit=commit_save_gauges, args={"id": "string"})

_w("dismiss_invention", "Remove one invented candidate from the list.",
   gather=gather_passthrough, execute=execute_dismiss_candidate("invented"),
   commit=commit_save_gauges, args={"id": "string"})


# ---- bind layer (instances) ----------------------------------------------- #

_w("bind_gauge",
   "Bind a template or preset to a scope → an instance (references the config). "
   "Args: ref:{kind:'template'|'preset', id} (or lens_id) + scope_name + pair?/"
   "block_key?/visual?/report_view?/thread_ref?. thread_ref is required when the "
   "lens walks a thread. Returns binding_id.",
   gather=gather_passthrough, execute=execute_bind_gauge, commit=commit_save_gauges,
   args={"ref": "object", "scope_name": "string", "thread_ref": "string?"})

_w("unbind_gauge", "Delete an instance (the referenced preset/template survives).",
   gather=gather_passthrough, execute=execute_unbind_gauge, commit=commit_save_gauges,
   args={"binding_id": "string"})

_w("update_gauge",
   "Per-instance overrides (scope_name/pair/block_key/visual/report_view). Config "
   "edits go to the preset. Args: binding_id + the fields to merge.",
   gather=gather_passthrough, execute=execute_update_gauge, commit=commit_save_gauges,
   args={"binding_id": "string"})

_w("set_gauge_view",
   "Shortcut: set the per-instance visual / report_view. Args: binding_id + visual?/report_view?.",
   gather=gather_passthrough, execute=execute_set_gauge_view, commit=commit_save_gauges,
   args={"binding_id": "string", "visual": "string?", "report_view": "string?"})

_w("analyse_gauge",
   "Run the analysis for one bound instance (resolves its config, runs every rule, "
   "stores the result). Args: binding_id.",
   gather=gather_analyse_gauge, execute=execute_analyse_gauge, commit=commit_analyse_gauge,
   args={"binding_id": "string"}, uses_ai=True, label="Read your story with a lens")

_w("extract_gauge_scale",
   "Draft a preset's y_items scale from the story (preset-backed bindings only; "
   "section reads live from World). Args: binding_id.",
   gather=gather_extract_gauge_scale, execute=execute_extract_gauge_scale,
   commit=commit_extract_gauge_scale, args={"binding_id": "string"}, uses_ai=True, label="Drafted a lens scale")


# ---- suggesters (WRITE — append to the candidate lists) ------------------- #

_w("suggest_gauges",
   "Suggest which library lenses fit the story; appends to the `suggested` list "
   "(no dedup). Needs story elements (run init first). No args.",
   gather=gather_suggest_gauges, execute=execute_suggest_gauges, commit=commit_save_gauges,
   uses_ai=True, label="Suggested lenses")

_w("suggest_custom_gauges",
   "Invent bespoke lenses grounded in the story; appends to the `invented` list. "
   "Needs story elements. No args.",
   gather=gather_suggest_custom_gauges, execute=execute_suggest_custom_gauges,
   commit=commit_save_gauges, uses_ai=True, label="Invented lens suggestions")


# ---- shape-it (single-ask invent — READ, persists nothing) ---------------- #

register(Capability(
    name="invent_lens_from_ask",
    label="Invented a lens",
    uses_ai=True,
    tool_name="quick_invent_lens",
    description=("AI-draft ONE lens from a plain-language description. Returns a "
                 "build_preset-ready spec + its scope; persists nothing — the "
                 "caller binds it lazily. Needs story elements. Args: description."),
    route=Route.READ, args={"description": "string"},
    gather=gather_invent_lens_from_ask, execute=execute_invent_lens_from_ask,
    pages=_PAGE, actors=(*_NO_CHAT, Actor.CHAT), chat_exposure="toolbox",
))


# ---- lens library readers ------------------------------------------------- #

register(Capability(
    name="get_suggestions",
    description="Suggested lenses to watch. Currently always empty: nothing generates suggestions yet.",
    route=Route.READ,
    gather=lambda ctx, args: lenses.get_suggestions(ctx, **args),
    pages=("ConsistencyLab",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_lens_templates",
    description=("The lens library (the same gauge bank the Lenses page shows): one row per "
                 "lens + the author's saved presets."),
    route=Route.READ,
    gather=lambda ctx, args: lenses.get_lens_templates(ctx, **args),
    pages=("ConsistencyLab",),
    chat_exposure="toolbox",
))
