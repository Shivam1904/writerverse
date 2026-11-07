"""Capability registrations — outline tree + plot thread CRUD (new-style)."""
from actions.capabilities.commit._proposals import guarded_accept
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route
from actions.capabilities.stamps import stamp_beat

from outline.capabilities.commit.beat_undo import (
    commit_restore_deleted_beat,
    gather_restore_deleted_beat,
)
from outline.capabilities.commit.outline_crud import (
    commit_accept_beat,
    commit_add_outline_item,
    commit_add_plot_thread,
    commit_add_scene,
    commit_add_scene_with_beats,
    commit_add_thread_beat,
    commit_delete_outline_item,
    commit_delete_plot_thread,
    commit_delete_thread_beat,
    commit_init_grand_outline,
    commit_insert_scene_paragraphs,
    commit_link_scene_entity,
    commit_place_thread_beat,
    commit_propose_scene_edits,
    commit_reorder_outline_item,
    commit_reorder_thread_beats,
    commit_restore_scene_revision,
    commit_save_scene_content,
    commit_set_chapter_pov,
    commit_set_project_pov_default,
    commit_unlink_scene_entity,
    commit_update_outline_item,
    commit_update_plot_thread,
    commit_update_proposed_beat,
    commit_update_thread_beat,
)
from outline.capabilities.execute.outline_crud import (
    execute_add_scene_with_beats,
    execute_place_thread_beat,
    execute_save_scene_content,
)
from outline.capabilities.gather.outline_crud import (
    gather_add_outline_item,
    gather_add_plot_thread,
    gather_add_scene,
    gather_add_scene_with_beats,
    gather_add_thread_beat,
    gather_delete_outline_item,
    gather_delete_plot_thread,
    gather_delete_thread_beat,
    gather_init_grand_outline,
    gather_insert_scene_paragraphs,
    gather_list_scene_revisions,
    gather_place_thread_beat,
    gather_propose_insert_beat,
    gather_propose_scene_edits,
    gather_propose_update_beat,
    gather_reorder_outline_item,
    gather_reorder_thread_beats,
    gather_restore_scene_revision,
    gather_save_scene_content,
    gather_scene_entity_link,
    gather_set_chapter_pov,
    gather_set_project_pov_default,
    gather_update_outline_item,
    gather_update_plot_thread,
    gather_update_thread_beat,
)

_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)


# ---- outline tree --------------------------------------------------------- #

register(Capability(
    name="init_grand_outline",
    description=(
        "Initialise the grand outline from a scaffold when it has no acts yet. "
        "Pass `base_template` (a preset id from `get_outline_scaffolds`, e.g. "
        "three_act / hero_journey) OR `acts` (a list of custom act names). "
        "Each act is seeded with one empty chapter and scene. Refuses if the "
        "outline already has acts."
    ),
    route=Route.WRITE,
    args={"base_template": "string?", "acts": "list?"},
    gather=gather_init_grand_outline,
    commit=commit_init_grand_outline,
    pages=("Outline",),
    actors=_NO_CHAT,
))

register(Capability(
    name="add_outline_item",
    description=(
        "Add an act, chapter, scene, or beat to the grand outline. "
        "Source parent_id from `get_grand_outline` (omit when adding a "
        "top-level act)."
    ),
    route=Route.WRITE,
    args={"item_type": "string", "parent_id": "string?", "text": "string?", "id": "string?"},
    gather=gather_add_outline_item,
    commit=commit_add_outline_item,
    pages=("Outline",),
    actors=_NO_CHAT,
))

register(Capability(
    name="update_outline_item",
    description=(
        "Edit the text (or kind) of an act, chapter, scene, or beat, or toggle a "
        "beat's `written` flag (written into the chapter prose). "
        "Source item_id from `get_grand_outline`."
    ),
    route=Route.WRITE,
    args={"item_type": "string", "item_id": "string", "text": "string?", "kind": "string?", "written": "bool?"},
    gather=gather_update_outline_item,
    commit=commit_update_outline_item,
    pages=("Outline",),
    actors=_NO_CHAT,
))

register(Capability(
    name="reorder_outline_item",
    description=(
        "Move an act, chapter, scene, or beat to a new position among its siblings. "
        "Source item_id from `get_grand_outline`."
    ),
    route=Route.WRITE,
    args={"item_type": "string", "item_id": "string", "new_index": "int"},
    gather=gather_reorder_outline_item,
    commit=commit_reorder_outline_item,
    pages=("Outline",),
    actors=_NO_CHAT,
))

register(Capability(
    name="delete_outline_item",
    description=(
        "Remove an act, chapter, scene, or beat (and its subtree) from the grand outline. "
        "Source item_id from `get_grand_outline`."
    ),
    route=Route.WRITE,
    args={"item_type": "string", "item_id": "string"},
    gather=gather_delete_outline_item,
    commit=commit_delete_outline_item,
    pages=("Outline",),
    actors=_NO_CHAT,
))

# Whole-doc TipTap save — the HUMAN write editor only. The AI must never call
# this: it can't faithfully reproduce a TipTap tree, so it drops content/marks
# (the 2026-06-06 `content:null` incident, where prose landed in the title). The
# AI edits prose by paragraph via `propose_scene_edits` instead. `_NO_CHAT` keeps
# CHAT/INTERNAL out; USER_BUTTON (the editor's autosave) + CRON stay.
register(Capability(
    name="save_scene_content",
    description=(
        "Save TipTap prose content to a scene in the grand outline. "
        "Source scene_id from `get_grand_outline`. On save, ENABLED scene-analysis "
        "pipelines run as best-effort follow-ups unless `auto_analyze` is false."
    ),
    route=Route.WRITE,
    args={"scene_id": "string", "content": "dict?", "text": "string?",
          "auto_analyze": "bool?", "allow_empty": "bool?"},
    gather=gather_save_scene_content,
    execute=execute_save_scene_content,
    commit=commit_save_scene_content,
    pages=("Chapters",),
    actors=_NO_CHAT,
))

# Prose history (revisions are kept by save_scene_content, SA-285). Author-only.
register(Capability(
    name="list_scene_revisions",
    description=(
        "Earlier versions of a scene's prose, newest first: id, time, word count. "
        "Source scene_id from `get_grand_outline`."
    ),
    route=Route.READ,
    args={"scene_id": "string"},
    gather=gather_list_scene_revisions,
    pages=("Write",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_scene_revision",
    description=(
        "The prose of one earlier version of a scene, for a preview before "
        "restoring. Source revision_id from `list_scene_revisions`."
    ),
    route=Route.READ,
    args={"scene_id": "string", "revision_id": "int"},
    # Same lookup as a restore's gather, without the commit.
    gather=gather_restore_scene_revision,
    pages=("Write",),
    actors=_NO_CHAT,
))

register(Capability(
    name="restore_scene_revision",
    description=(
        "Put an earlier version of a scene's prose back. The prose it replaces "
        "is kept as a new revision, so a restore can be undone. Source "
        "revision_id from `list_scene_revisions`."
    ),
    route=Route.WRITE,
    args={"scene_id": "string", "revision_id": "int"},
    gather=gather_restore_scene_revision,
    commit=commit_restore_scene_revision,
    pages=("Write",),
    actors=_NO_CHAT,
))

# Prose editing for the AI — REWRITES land in the scene immediately as pending
# 'ai-generated' blocks the author accepts or dismisses IN the editor (a green
# block with Accept + Dismiss buttons), NOT as rail cards. A direct WRITE: each
# rewrite replaces its paragraph in place, marked, carrying the author's refs
# forward + stashing the original. Accept (editor-side) strips the marker →
# normal prose; Dismiss puts the stashed original back. The AI
# passes plain text per paragraph; it never builds TipTap and never authors refs.
register(Capability(
    name="propose_scene_edits",
    description=(
        "REWRITE existing scene paragraphs (e.g. fix grammar, tighten a line). "
        "First call `get_chapter_prose` to see paragraphs by index, then pass "
        "`scene_id` + `edits`: a list of {index, text} — `text` is the PLAIN "
        "rewritten prose for the paragraph at `index` (never TipTap JSON). Each "
        "rewrite appears in the author's editor as a pending AI block to accept or "
        "dismiss in place (dismiss restores the author's original paragraph); the "
        "author's references on that paragraph are preserved. To ADD "
        "new paragraphs, use `insert_scene_paragraphs` instead."
    ),
    route=Route.WRITE,
    args={"scene_id": "string", "edits": "list"},
    gather=gather_propose_scene_edits,
    commit=commit_propose_scene_edits,
    pages=("Chapters",),
    actors=(Actor.USER_BUTTON,),  # dropped from chat (caps refactor 2026-07-03)
))

# Add NEW paragraphs — written into the scene immediately, each marked
# 'ai-generated'. Same in-editor accept model as propose_scene_edits: the marked
# paragraph IS the proposal, decided IN the editor (a green block with Accept +
# Dismiss buttons). Accept (editor-side) strips the marker so it becomes normal
# prose; Dismiss removes the paragraph.
register(Capability(
    name="insert_scene_paragraphs",
    description=(
        "Add NEW paragraphs to a scene. Pass `scene_id` + `paragraphs` (a list of "
        "plain-text strings, one per paragraph, never TipTap JSON) and an optional "
        "`position` (0-based paragraph index to insert before; omit to append). The "
        "paragraphs land as a contiguous block, each appearing in the author's "
        "editor as a pending AI block to accept or dismiss (remove) in place. Read the "
        "chapter's current prose with `get_chapter_prose` first."
    ),
    route=Route.WRITE,
    args={"scene_id": "string", "paragraphs": "list", "position": "int?"},
    gather=gather_insert_scene_paragraphs,
    commit=commit_insert_scene_paragraphs,
    pages=("Chapters",),
    actors=(Actor.USER_BUTTON, Actor.CHAT),
))

# Scene links — ideas / world entries the author attaches to a scene (the
# "attached" notes in the Write margin). Stored on the scene as `entity_links`,
# so get_grand_outline returns them. Never touches the scene's prose.
register(Capability(
    name="link_scene_entity",
    description=(
        "Attach a braindump or world entry to a scene. Pass scene_id + "
        "link_type (braindump / worldbuilding) + link_id. Attaching the same "
        "item twice is a no-op."
    ),
    route=Route.WRITE,
    args={"scene_id": "string", "link_type": "string", "link_id": "int"},
    gather=gather_scene_entity_link,
    commit=commit_link_scene_entity,
    pages=("Write",),
    actors=_NO_CHAT,
))

register(Capability(
    name="unlink_scene_entity",
    description=(
        "Remove an attached braindump or world entry from a scene. Pass "
        "scene_id + link_type + link_id."
    ),
    route=Route.WRITE,
    args={"scene_id": "string", "link_type": "string", "link_id": "int"},
    gather=gather_scene_entity_link,
    commit=commit_unlink_scene_entity,
    pages=("Write",),
    actors=_NO_CHAT,
))

register(Capability(
    name="place_thread_beat",
    tool_name="place_thread_beat_in_outline",
    description=(
        "Copy one beat from a plot thread into a scene in the outline. "
        "Source thread_id + beat_id from get_thread; scene_id from get_outline. "
        "Optionally pass beat_index to position it within the scene."
    ),
    route=Route.WRITE,
    args={
        "thread_id": "string",
        "beat_id": "string",
        "scene_id": "string",
        "beat_index": "int?",
    },
    gather=gather_place_thread_beat,
    execute=execute_place_thread_beat,
    commit=commit_place_thread_beat,
    pages=("Threads",),
    actors=(Actor.USER_BUTTON, Actor.CHAT, Actor.INTERNAL, Actor.CRON),
    chat_exposure="toolbox",
))

register(Capability(
    name="set_chapter_pov",
    description=(
        "Declare a chapter's point of view: `chapter_id` + `mode` (first / "
        "third-limited / third-omniscient / multiple) + `character` (the POV "
        "character's name; required for first/third-limited). Source chapter_id "
        "from `get_grand_outline`."
    ),
    route=Route.WRITE,
    args={"chapter_id": "string", "mode": "string", "character": "string?"},
    gather=gather_set_chapter_pov,
    commit=commit_set_chapter_pov,
    pages=("Chapters",),
    actors=_NO_CHAT,
))

register(Capability(
    name="set_project_pov_default",
    description=(
        "Set the project-level default POV (`mode` + `character`) that NEW "
        "chapters inherit on creation."
    ),
    route=Route.WRITE,
    args={"mode": "string", "character": "string?"},
    gather=gather_set_project_pov_default,
    commit=commit_set_project_pov_default,
    pages=("Chapters",),
    actors=_NO_CHAT,
))

register(Capability(
    name="add_scene",
    description=(
        "Add a scene to an existing chapter. Pass chapter_id (from get_outline) "
        "plus an optional title and position "
        "(0-based index within the chapter; omit to append). Acts and chapters "
        "are author-owned — you can only add scenes inside a chapter that exists."
    ),
    route=Route.WRITE,
    args={"chapter_id": "string", "title": "string?", "position": "int?"},
    gather=gather_add_scene,
    commit=commit_add_scene,
    pages=("Outline",),
))


register(Capability(
    name="add_scene_with_beats",
    description=(
        "Create a new scene in a chapter, pre-seeded with a list of beats, and "
        "appended to the end of the chapter. Pass chapter_id (from get_outline) "
        "plus `beats` (a list of strings or {text, kind?} dicts). The scene's "
        "title is auto-generated from the beats unless an explicit `title` is "
        "passed. Used by the merge page when beats are dropped into a new-scene "
        "drop zone."
    ),
    route=Route.WRITE,
    args={"chapter_id": "string", "beats": "list", "title": "string?"},
    gather=gather_add_scene_with_beats,
    execute=execute_add_scene_with_beats,
    commit=commit_add_scene_with_beats,
    pages=("Outline",),
    actors=_NO_CHAT,
))


# ---- plot threads --------------------------------------------------------- #

register(Capability(
    name="add_plot_thread",
    description=(
        "Create a new plot thread. Pass a title and an optional description / "
        "scope / initial beats. Each beat is either a string (becomes a text "
        "beat) or {text, kind?} where kind is text / placeholder / heading."
    ),
    route=Route.WRITE,
    args={
        "title": "string",
        "description": "string?",
        "scope_type": "string?",
        "scope_name": "string?",
        "color": "string?",
        "beats": "list?",
    },
    gather=gather_add_plot_thread,
    commit=commit_add_plot_thread,
    pages=("Threads",),
))

register(Capability(
    name="update_plot_thread",
    tool_name="update_plot_thread_info",
    description=(
        "Edit a plot thread's top-level INFO only — its name, description, "
        "and/or scope. This does NOT add, fill, or change any beats: writing a "
        "description here does NOT 'fill in' the thread. To write or fill in the "
        "thread's beats (including turning an empty `placeholder` into real "
        "text) use `update_plot_thread_beat` or `add_plot_thread_beat`. Only "
        "the fields you pass get updated; pass thread_id to identify the thread. "
        "Source thread_id from `get_plot_threads`."
    ),
    route=Route.WRITE,
    args={
        "thread_id": "string",
        "name": "string?",
        "description": "string?",
        "scope_type": "string?",
        "scope_name": "string?",
    },
    gather=gather_update_plot_thread,
    commit=commit_update_plot_thread,
    pages=("Threads",),
    actors=_NO_CHAT,
))

register(Capability(
    name="delete_plot_thread",
    description="Delete a plot thread. Source thread_id from `get_plot_threads`.",
    route=Route.WRITE,
    args={"thread_id": "string"},
    gather=gather_delete_plot_thread,
    commit=commit_delete_plot_thread,
    pages=("Threads",),
    actors=_NO_CHAT,
))

# The author's own beat add/edit — direct WRITE (instant). NOT exposed to chat:
# Night Eyes adds/edits beats via propose_insert_beat / propose_update_beat (which
# the AI sees under these same tool names) so its changes land as green proposals.
register(Capability(
    name="add_thread_beat",
    description=(
        "Add ONE beat to a plot thread (author edit). Pass thread_id + text "
        "(+ optional after_beat_id to place it right after that beat, else it's "
        "appended; kind: text / placeholder / heading, default text)."
    ),
    route=Route.WRITE,
    args={"thread_id": "string", "text": "string", "after_beat_id": "string?", "kind": "string?"},
    gather=gather_add_thread_beat,
    commit=commit_add_thread_beat,
    pages=("Threads",),
    actors=_NO_CHAT,
))

register(Capability(
    name="update_thread_beat",
    description=(
        "Edit ONE beat in a plot thread by id (author edit). Pass thread_id + "
        "beat_id + the text and/or kind to change."
    ),
    route=Route.WRITE,
    args={"thread_id": "string", "beat_id": "string", "text": "string?", "kind": "string?"},
    gather=gather_update_thread_beat,
    commit=commit_update_thread_beat,
    pages=("Threads",),
    actors=_NO_CHAT,
))


# ---- beat proposals — Night Eyes proposes; the author reviews green ---------- #
def _preview_propose_update_beat(result: dict) -> list[dict]:
    """Fan a beat-edit gather out into one `beat_edit` proposal per beat — each
    reviewed (accept/reject/edit) on its own, the per-beat shape get_thread reads."""
    tid = (result or {}).get("thread_id")
    title = (result or {}).get("thread_title") or ""
    out = []
    for e in (result or {}).get("edits") or []:
        if not e.get("fields"):
            continue
        out.append({
            "args": {"thread_id": tid, "beat_id": e["beat_id"]},
            "preview": {"type": "beat_edit", "thread_id": tid, "thread_title": title,
                        "beat_id": e["beat_id"], "fields": e["fields"]},
        })
    return out


def _preview_propose_insert_beat(result: dict) -> list[dict]:
    """Fan a beat-add gather out into one `beat_insert` proposal per new beat."""
    tid = (result or {}).get("thread_id")
    title = (result or {}).get("thread_title") or ""
    out = []
    for it in (result or {}).get("items") or []:
        text = (it.get("text") or "").strip()
        if not text:
            continue
        fields = {"text": text}
        if it.get("kind"):
            fields["kind"] = it["kind"]
        out.append({
            "args": {"thread_id": tid},
            "preview": {"type": "beat_insert", "thread_id": tid, "thread_title": title,
                        "index": it.get("index") or 0, "fields": fields},
        })
    return out


register(Capability(
    name="propose_insert_beat",
    tool_name="insert_thread_beat",
    description=(
        "Insert one new beat into a plot thread. Pass thread_id + text; "
        "optionally after_beat_id (place it right after that beat — omit to "
        "append) and kind (text / placeholder / heading, default text). Source "
        "thread_id + beat_id from get_thread."
    ),
    route=Route.PROPOSE,
    args={
        "thread_id": "string", "text": "string",
        "after_beat_id": "string?", "kind": "string?",
    },
    gather=gather_propose_insert_beat,
    preview=_preview_propose_insert_beat,
    accept="accept_beat",
    stamp=stamp_beat,
    pages=("Threads",),
    actors=(Actor.CHAT,),
))

register(Capability(
    name="propose_update_beat",
    tool_name="update_thread_beat",
    description=(
        "Edit one beat in a plot thread. Pass thread_id + beat_id + the text "
        "and/or kind to change (writing text into a placeholder fills it). "
        "Source thread_id + beat_id from get_thread."
    ),
    route=Route.PROPOSE,
    args={
        "thread_id": "string", "beat_id": "string",
        "text": "string?", "kind": "string?",
    },
    gather=gather_propose_update_beat,
    preview=_preview_propose_update_beat,
    accept="accept_beat",
    stamp=stamp_beat,
    pages=("Threads",),
    actors=(Actor.CHAT,),
))

# Accept a beat proposal — apply the beat_edit/beat_insert. Dispatched by the
# generic accept_proposal (toast/chat) AND the inline thread editor.
register(Capability(
    name="accept_beat",
    description="Accept a beat proposal — apply the proposed beat edit / insert to the thread.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_accept_beat),
    pages=("Threads",),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL),
))

# Blur-save: the author edited the green proposed beat — persist the edit INTO
# the proposal (still pending until accepted).
register(Capability(
    name="update_proposed_beat",
    description="Save an edited proposed beat value (text/kind) back into the proposal (still pending).",
    route=Route.WRITE,
    args={"proposal_id": "string", "text": "string?", "kind": "string?"},
    commit=commit_update_proposed_beat,
    pages=("Threads",),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL),
))

# The author's drag on the Threads page: save the new beat order (a heading
# drags its whole block, so one drag can move several beats). Not for chat.
register(Capability(
    name="reorder_thread_beats",
    description=(
        "Save a new order for a plot thread's beats (author drag). Pass thread_id "
        "+ beat_ids: every beat id of the thread, once each, in the new order."
    ),
    route=Route.WRITE,
    args={"thread_id": "string", "beat_ids": "list"},
    gather=gather_reorder_thread_beats,
    commit=commit_reorder_thread_beats,
    pages=("Threads",),
    actors=_NO_CHAT,
))

register(Capability(
    name="delete_thread_beat",
    description=(
        "Delete one beat from a plot thread. Identify via thread_id + beat_id. "
        "Source thread_id + beat_id from `get_plot_threads`."
    ),
    route=Route.WRITE,
    args={"thread_id": "string", "beat_id": "string"},
    gather=gather_delete_thread_beat,
    commit=commit_delete_thread_beat,
    pages=("Threads",),
    actors=_NO_CHAT,
))

# The author's Undo on the 10-second "Deleted — Undo" toast, for an outline
# beat or a thread beat. `token` is the `undo_token` the delete returned.
# A click only: the AI never deletes, so it never undoes either.
register(Capability(
    name="restore_deleted_beat",
    description=(
        "Undo a beat delete: put the deleted outline beat or thread beat back where "
        "it was, with its links. `token` is the delete's `undo_token`."
    ),
    route=Route.WRITE,
    args={"token": "string"},
    gather=gather_restore_deleted_beat,
    commit=commit_restore_deleted_beat,
    pages=("Outline", "Threads"),
    actors=(Actor.USER_BUTTON,),
))
