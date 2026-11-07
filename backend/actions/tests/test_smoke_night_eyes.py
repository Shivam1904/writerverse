"""End-to-end smoke test for Night Eyes pipeline.

Covers: thread continuity, proposal accept/reject, staleness drift,
global tools, grounding, new ops, identify-then-act, preview round-trips,
button-source proposals, suggest-lenses, add_character, error guard, ping.

Requires: seeded local Postgres + live LLM API key.
Run: make night-eyes-smoke  (or: pytest -m smoke actions/tests/)
"""
import asyncio
import uuid

import night_eyes.frames as frames_mod
import night_eyes.tools as chat_tools
import pytest
from characters.models import Character
from night_eyes.graph import ConsistencyChat, _stale_warning
from night_eyes.models import ChatThread
from night_eyes.stream import (
    _drain_sync,
    _materialise_proposal,
    accept_proposal,
    materialise_proposals,
    reject_proposal,
)
from outline.engine import generation as engine_mod
from projects.models import Project

from actions.capabilities import registry
from actions.capabilities.dispatch import dispatch
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.spec import Actor, Capability, ProjectScope, Route
from actions.domain_versions import versions_for
from actions.models import Proposal

SMOKE_CAP_NAME = "__smoke_write_note__"
SMOKE_PAGE = "__smoke__"


# ── fixtures ──────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def smoke_project():
    project = Project.objects.order_by('id').first()
    if project is None:
        pytest.skip("No projects in the database — seed one first.")
    return project


@pytest.fixture(scope="module")
def smoke_session(smoke_project):
    return ProjectScope(smoke_project.id)


@pytest.fixture()
def register_smoke_cap():
    registry_snapshot = registry.snapshot()
    frames_snapshot = dict(frames_mod._load())
    runs_seen = []

    ACCEPT_CAP = f"_accept_{SMOKE_CAP_NAME}"

    def _commit_accept(ctx, result):
        preview = result.get("preview") or result
        runs_seen.append(preview.get("note", ""))

    registry.register(Capability(
        name=SMOKE_CAP_NAME,
        route=Route.PROPOSE,
        description=(
            "Record a one-line note. Use this when the user asks you to "
            "save a note."
        ),
        args={"note": "string"},
        accept=ACCEPT_CAP,
        actors=(Actor.USER_BUTTON, Actor.CHAT, Actor.INTERNAL, Actor.CRON),
    ))
    registry.register(Capability(
        name=ACCEPT_CAP,
        route=Route.WRITE,
        description="Accept smoke write note.",
        gather=gather_from_proposal,
        commit=_commit_accept,
        actors=(Actor.INTERNAL,),
    ))

    frames_mod._FRAMES = dict(frames_snapshot)
    frames_mod._FRAMES[SMOKE_PAGE] = {
        "reads": [],
        "actions": [SMOKE_CAP_NAME],
        "secondary": [],
        "context_params": [],
        "quick_actions": [],
        "prompt": (
            "You are a test agent. When the user asks to save a note, "
            f"call the {SMOKE_CAP_NAME} tool exactly once with the "
            "`note` argument set to the exact text the user gave you. "
            "Do not call any tool more than once per user message. "
            "When the tool returns, the note is saved — reply with one "
            "short confirmation sentence naming the note, then stop. "
            "Never call the tool again."
        ),
        "suffixes": {},
    }

    yield runs_seen, registry_snapshot, frames_snapshot

    registry.restore(registry_snapshot)
    frames_mod._FRAMES = frames_snapshot


@pytest.fixture()
def register_preview_cap():
    SMOKE_CAP = "__smoke_preview__"
    ACCEPT_CAP = f"_accept_{SMOKE_CAP}"
    PREVIEW_PAGE = "__smoke_preview_page__"

    execute_calls = []
    commit_calls = []

    PREVIEW_PAYLOAD = {
        "draft_text": "previewed-misbelief-text",
        "confidence": 0.9,
    }

    def _execute(ctx, gathered):
        execute_calls.append(dict(gathered))
        return {**gathered, **PREVIEW_PAYLOAD}

    def _commit_accept(ctx, result):
        preview = result.get("preview") or result
        commit_calls.append(dict(preview))

    registry_snapshot = registry.snapshot()
    frames_snapshot = dict(frames_mod._load())

    registry.register(Capability(
        name=SMOKE_CAP,
        route=Route.PROPOSE,
        description=(
            "Smoke-test capability with execute() that stashes "
            "a preview. Accept must reuse the preview, not re-execute."
        ),
        execute=_execute,
        accept=ACCEPT_CAP,
        args={"target_id": "string"},
        actors=(Actor.USER_BUTTON, Actor.CHAT, Actor.INTERNAL, Actor.CRON),
    ))
    registry.register(Capability(
        name=ACCEPT_CAP,
        route=Route.WRITE,
        description="Accept smoke preview.",
        gather=gather_from_proposal,
        commit=_commit_accept,
        actors=(Actor.INTERNAL,),
    ))

    frames_mod._FRAMES = dict(frames_snapshot)
    frames_mod._FRAMES[PREVIEW_PAGE] = {
        "reads": [],
        "actions": [SMOKE_CAP],
        "secondary": [],
        "context_params": [],
        "quick_actions": [],
        "prompt": (
            "You are a test agent. When the user asks to record a smoke "
            f"preview, call the {SMOKE_CAP} tool exactly once with the "
            "`target_id` argument set to the exact value the user gave "
            "you. Never call any tool more than once per user message. "
            "If you see [PROPOSAL_ACCEPTED] reply with one short sentence "
            "and stop; same for [PROPOSAL_REJECTED]."
        ),
        "suffixes": {},
    }

    yield execute_calls, commit_calls, PREVIEW_PAYLOAD, PREVIEW_PAGE, SMOKE_CAP

    registry.restore(registry_snapshot)
    frames_mod._FRAMES = frames_snapshot


@pytest.fixture()
def register_button_source_cap():
    SMOKE_CAP = "__smoke_button_source__"
    ACCEPT_CAP = f"_accept_{SMOKE_CAP}"
    commit_calls = []

    def _commit_accept(ctx, result):
        preview = result.get("preview") or result
        commit_calls.append(dict(preview))

    registry_snapshot = registry.snapshot()
    registry.register(Capability(
        name=SMOKE_CAP,
        route=Route.PROPOSE,
        description="Smoke-test cap for button-source proposal flow.",
        accept=ACCEPT_CAP,
        args={'target': 'string'},
        actors=(Actor.USER_BUTTON, Actor.CHAT, Actor.INTERNAL, Actor.CRON),
    ))
    registry.register(Capability(
        name=ACCEPT_CAP,
        route=Route.WRITE,
        description="Accept smoke button source.",
        gather=gather_from_proposal,
        commit=_commit_accept,
        actors=(Actor.INTERNAL,),
    ))

    yield SMOKE_CAP, commit_calls

    registry.restore(registry_snapshot)
    Proposal.objects.filter(
        capability=SMOKE_CAP, project_id=None,
    ).delete()


@pytest.fixture()
def patch_engine_merge():
    original_run = engine_mod.run_merge_rough_into_grand
    call_count = []

    def fake_run(rough_arg, grand_arg):
        call_count.append(1)
        return {
            'proposed_grand': grand_arg,
            'placements': [
                {'item_id': 'ri-1', 'scene_id': 'sc-smoke-A',
                 'kind': 'text', 'beat_text': 'Wren finds the living ink'},
                {'item_id': 'ri-2', 'scene_id': 'sc-smoke-B',
                 'kind': 'placeholder', 'beat_text': 'Wren draws the first line'},
            ],
            'ran_at': '2026-05-27T12:00:00+00:00',
            'usage': {'total': {'calls': 1, 'req_tok': 0, 'resp_tok': 0}},
            'records': [],
        }

    engine_mod.run_merge_rough_into_grand = fake_run

    yield engine_mod, call_count

    engine_mod.run_merge_rough_into_grand = original_run


@pytest.fixture()
def seed_merge_discovery(smoke_session):
    """Seed the outline + plot threads for merge preview; restore on teardown."""
    from outline.store import load_outline, load_threads, save_outline, save_threads

    SEEDED_ROUGH_ID = '__smoke_ro_12b__'
    threads_before = load_threads(smoke_session)
    outline_before = load_outline(smoke_session)

    seeded_threads = [
        *(r for r in threads_before if not (isinstance(r, dict) and r.get('id') == SEEDED_ROUGH_ID)),
        {
            'id': SEEDED_ROUGH_ID,
            'title': "Wren's awakening",
            'items': [
                {'id': 'ri-1', 'kind': 'text', 'text': 'Wren finds the living ink'},
                {'id': 'ri-2', 'kind': 'text', 'text': 'Wren draws the first line'},
                {'id': 'ri-3', 'kind': 'text', 'text': 'Wren becomes the Night Surveyor'},
            ],
        },
    ]
    save_threads(smoke_session, seeded_threads)

    save_outline(smoke_session, {
        'base_template': 'three_act',
        'acts': [{
            'id': 'ac-smoke', 'text': 'Act I (smoke)',
            'chapters': [{
                'id': 'ch-smoke-1', 'text': 'Chapter 1 — Discovery',
                'scenes': [
                    {'id': 'sc-smoke-A', 'text': 'Library scene', 'beats': []},
                    {'id': 'sc-smoke-B', 'text': 'Bedroom scene', 'beats': []},
                ],
            }],
        }],
    })

    yield SEEDED_ROUGH_ID

    save_threads(smoke_session, threads_before)
    save_outline(smoke_session, outline_before)


# ── helper ────────────────────────────────────────────────────────────


def run_turn(project_id, session, page, thread_id, message):
    """Drive one user-message turn end-to-end the way the view does."""
    thread, _ = ChatThread.objects.get_or_create(
        thread_id=thread_id,
        defaults={
            'project_id': project_id,
            'page': page,
            'title': (message or '')[:80],
        },
    )
    if hasattr(session, '_chat_proposals'):
        session._chat_proposals.clear()
    chat = ConsistencyChat(
        project_id, session, page=page, thread_id=thread_id,
    )
    text_parts = []
    tools_called = []
    interrupts = []
    events = []

    async def _drain():
        async for ev in chat.stream(message, thread_id):
            events.append(ev)
            kind = ev.get('event')
            if kind == 'on_chat_model_stream':
                chunk = ev['data']['chunk']
                if chunk.content:
                    text_parts.append(chunk.content)
            elif kind == 'on_tool_start':
                tools_called.append(ev.get('name', ''))
            elif kind == '__interrupt__':
                interrupts.extend(ev['data'].get('interrupts', []))

    asyncio.run(_drain())
    materialise_proposals(events, thread)
    return ''.join(text_parts), tools_called, interrupts


# ── tests ─────────────────────────────────────────────────────────────


@pytest.mark.smoke
@pytest.mark.django_db
def test_step2_continuity(smoke_project, smoke_session):
    """Thread continuity: memory, hydrated results, page switch."""
    thread_id = uuid.uuid4()

    reply1, tools1, _ = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            "First, call the get_characters tool to see who exists. "
            "Then in one short sentence tell me how many are loaded, "
            "and remember this number for later: my favourite number is 7777."
        ),
    )

    reply2, tools2, _ = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            "Without calling get_characters again, what number did I say "
            "was my favourite, and how many characters did you find earlier?"
        ),
    )

    reply3, tools3, _ = run_turn(
        smoke_project.id, smoke_session, page='world', thread_id=thread_id,
        message=(
            "I just navigated to the World page. Without using any tool, "
            "repeat my favourite number back to me."
        ),
    )

    assert 'get_characters' in tools1, "Turn 1 should invoke get_characters"
    assert '7777' in reply2, "Turn 2 should recall favourite number (7777)"
    assert 'get_characters' not in tools2, (
        "Turn 2 should NOT re-call get_characters (hydrated result)"
    )
    assert '7777' in reply3, "Turn 3 (different page) should still recall 7777"


@pytest.mark.smoke
@pytest.mark.django_db
def test_step3_proposal_flow(smoke_project, smoke_session, register_smoke_cap):
    """Proposal accept / reject: propose, accept runs, reject marks."""
    runs_seen, _registry_snapshot, _frames_snapshot = register_smoke_cap

    thread_id = uuid.uuid4()

    # ---- Propose (turn fires the write tool; NO interrupt — NE treats it
    # as done, surfaces the card via the sink, and summarises) ----
    reply_a, tools_a, _ = run_turn(
        smoke_project.id, smoke_session, page=SMOKE_PAGE, thread_id=thread_id,
        message=(
            f'Save a note. Use the {SMOKE_CAP_NAME} tool with '
            'note="hello world".'
        ),
    )
    proposals_a = list(getattr(smoke_session, '_chat_proposals', []) or [])

    rows = list(Proposal.objects.filter(
        thread_id=thread_id, status=Proposal.STATUS_PROPOSED,
    ))
    proposal = rows[0] if rows else None

    # ---- Accept → runs + applies (no agent resume turn anymore) ----
    accepted_ok = False
    if proposal is not None:
        accept_proposal(smoke_project.id, proposal.id, page=SMOKE_PAGE)
        proposal.refresh_from_db()
        accepted_ok = proposal.status == Proposal.STATUS_APPLIED

    # ---- Reject (second proposal in same thread) ----
    reply_b, tools_b, _ = run_turn(
        smoke_project.id, smoke_session, page=SMOKE_PAGE, thread_id=thread_id,
        message=(
            f'Save another note. Use {SMOKE_CAP_NAME} with '
            'note="second note".'
        ),
    )

    rejected_proposal = Proposal.objects.filter(
        thread_id=thread_id, status=Proposal.STATUS_PROPOSED,
    ).order_by('-created_at').first()

    reject_ok = False
    if rejected_proposal is not None:
        reject_proposal(smoke_project.id, rejected_proposal.id, page=SMOKE_PAGE)
        rejected_proposal.refresh_from_db()
        reject_ok = rejected_proposal.status == Proposal.STATUS_REJECTED

    assert SMOKE_CAP_NAME in tools_a, "Propose turn should invoke the write tool"
    assert bool(proposals_a), "Propose turn should surface a proposal (sink, no interrupt)"
    assert bool(reply_a.strip()), (
        "Propose turn should produce a reply (NE confirms — not silent)"
    )
    assert proposal is not None, "Proposal row should be created with status=PROPOSED"
    assert "hello world" in runs_seen, "Accept should run the capability (run_fn fired)"
    assert accepted_ok, "Accept should flip row to APPLIED"
    assert (
        rejected_proposal is not None
        and rejected_proposal.id != (proposal.id if proposal else -1)
    ), "Second propose turn should produce another PROPOSED row"
    assert reject_ok, "Reject should flip row to REJECTED"
    assert "second note" not in runs_seen, "Reject should NOT execute the capability"


@pytest.mark.smoke
@pytest.mark.django_db
def test_step5_staleness(smoke_project, smoke_session):
    """Staleness drift: baseline capture, external mutation, [STALE] warning."""
    thread_id = uuid.uuid4()

    # ---- Turn 1 — establish a baseline by reading characters ----
    reply1, tools1, _ = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            "Call get_characters and tell me in one sentence "
            "how many characters exist."
        ),
    )

    thread = ChatThread.objects.get(thread_id=thread_id)
    baseline_after_read = dict(thread.read_baseline or {})

    # ---- External mutation — bump the characters domain ----
    unique_name = f'__smoke_stale_char_{uuid.uuid4().hex[:8]}__'
    mutation = dispatch(
        'add_character',
        {'name': unique_name, 'type': 'extra'},
        Actor.INTERNAL,
        smoke_session,
    )
    new_versions = versions_for(smoke_project.id)

    # ---- Generate the warning manually so we can assert its shape ----
    warning = _stale_warning(thread_id, smoke_session)

    # ---- Turn 2 — same thread, expects [STALE] prepended ----
    reply2, tools2, _ = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            "How many characters are in the cast right now? "
            "Use the available tools if you need fresh data."
        ),
    )

    assert 'characters' in baseline_after_read, (
        "Turn 1 should capture a characters baseline"
    )
    assert 'characters' in (mutation.invalidates or []), (
        "add_character dispatch should return invalidates=[characters]"
    )
    assert (
        bool(new_versions.get('characters'))
        and new_versions.get('characters') != baseline_after_read.get('characters')
    ), "Mutation should bump the characters domain version"
    assert (
        warning is not None and 'STALE' in warning and 'characters' in warning
    ), "_stale_warning() should return a [STALE] string mentioning characters"
    assert 'get_characters' in tools2, (
        "Turn 2 agent should re-read get_characters (reacted to warning)"
    )


@pytest.mark.smoke
@pytest.mark.django_db
def test_step7_global_tools(smoke_project, smoke_session):
    """Global tool (get_project_meta) available on every page."""
    thread_id = uuid.uuid4()

    reply, tools, _ = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            "Without calling any other tool first, use get_project_meta and "
            "tell me the project's title in one short sentence."
        ),
    )

    project_title = (smoke_project.title or '').strip()

    assert 'get_project_meta' in tools, "should invoke get_project_meta"
    assert bool(project_title) and project_title in reply, (
        "reply should mention the project title"
    )


@pytest.mark.smoke
@pytest.mark.django_db
def test_step8_grounding(smoke_project, smoke_session):
    """Fresh-thread agent calls get_project_meta unprompted."""
    thread_id = uuid.uuid4()

    reply, tools, _ = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            "Hey — I'm just opening up this project after a break. "
            "What should I work on?"
        ),
    )

    assert 'get_project_meta' in tools, (
        "Fresh-thread agent should call get_project_meta unprompted"
    )


@pytest.mark.smoke
@pytest.mark.django_db
def test_step9_new_ops(smoke_project, smoke_session):
    """New operations via direct dispatch: update_character, thread CRUD."""
    # ---- broadened update_character ----
    char = Character.objects.filter(project_id=smoke_project.id).first()
    misbelief_ok = False
    if char is not None:
        unique = f"smoke misbelief {uuid.uuid4().hex[:6]}"
        r = dispatch(
            'update_character',
            {'id': char.id, 'misbelief': unique},
            Actor.USER_BUTTON,
            smoke_session,
        )
        char.refresh_from_db()
        misbelief_ok = (
            r.status == 'ran'
            and char.misbelief == unique
        )
    assert misbelief_ok, (
        "update_character should patch a non-name field (misbelief)"
    )

    # ---- thread CRUD ----
    thread_name = f"__smoke_thread_{uuid.uuid4().hex[:6]}__"
    r_add = dispatch(
        'add_plot_thread',
        {
            'name': thread_name,
            'description': 'smoke-test thread',
            'beats': ['opening beat', 'middle beat'],
        },
        Actor.USER_BUTTON,
        smoke_session,
    )
    thread = (r_add.result or {}).get('thread') or {}
    thread_id = thread.get('id')
    beat_ids = [b.get('id') for b in (thread.get('items') or [])]
    add_thread_ok = (
        r_add.status == 'ran'
        and thread_id
        and len(beat_ids) == 2
        and 'plot_threads' in (r_add.invalidates or [])
    )
    assert add_thread_ok, "add_plot_thread should create a thread with seeded beats"

    # Confirm it's visible to a read.
    r_read = dispatch(
        'get_plot_threads', {}, Actor.USER_BUTTON, smoke_session,
    )
    threads_now = (r_read.result or {}).get('plot_threads') or []
    visible_ok = any(
        (t.get('id') == thread_id and t.get('title') == thread_name)
        for t in threads_now
    )
    assert visible_ok, "get_plot_threads should see the new thread"

    # add_thread_beat
    r_beat = dispatch(
        'add_thread_beat',
        {'thread_id': thread_id, 'text': 'tail beat'},
        Actor.USER_BUTTON,
        smoke_session,
    )
    new_beat = (r_beat.result or {}).get('beat') or {}
    new_beat_id = new_beat.get('id')
    assert r_beat.status == 'ran' and new_beat.get('text') == 'tail beat', (
        "add_thread_beat should append a beat"
    )

    # add_thread_beat with after_beat_id — must land right after the anchor.
    r_after = dispatch(
        'add_thread_beat',
        {
            'thread_id': thread_id,
            'text': 'inserted beat',
            'after_beat_id': beat_ids[0] if beat_ids else None,
        },
        Actor.USER_BUTTON,
        smoke_session,
    )
    after_ok = False
    if r_after.status == 'ran':
        r_read2 = dispatch('get_plot_threads', {}, Actor.USER_BUTTON, smoke_session)
        t_now = next(
            (t for t in ((r_read2.result or {}).get('plot_threads') or [])
             if t.get('id') == thread_id),
            {},
        )
        texts = [b.get('text') for b in (t_now.get('items') or [])]
        after_ok = (
            'inserted beat' in texts
            and texts.index('inserted beat') == texts.index('opening beat') + 1
            and texts.index('inserted beat') < texts.index('middle beat')
        )
    assert after_ok, "add_thread_beat after_beat_id should insert in order"

    # update_thread_beat
    r_update_beat = dispatch(
        'update_thread_beat',
        {
            'thread_id': thread_id,
            'beat_id': beat_ids[0] if beat_ids else '',
            'text': 'opening beat — edited',
        },
        Actor.USER_BUTTON,
        smoke_session,
    )
    edited_beat = (r_update_beat.result or {}).get('beat') or {}
    assert (
        r_update_beat.status == 'ran'
        and edited_beat.get('text') == 'opening beat — edited'
    ), "update_thread_beat should edit beat text"

    # update_plot_thread (rename)
    renamed = f"{thread_name} (renamed)"
    r_update_thread = dispatch(
        'update_plot_thread',
        {'thread_id': thread_id, 'name': renamed},
        Actor.USER_BUTTON,
        smoke_session,
    )
    renamed_thread = (r_update_thread.result or {}).get('thread') or {}
    assert (
        r_update_thread.status == 'ran'
        and renamed_thread.get('title') == renamed
    ), "update_plot_thread should rename the thread"

    # And the renamed beat survives in a fresh read.
    r_read2 = dispatch(
        'get_plot_threads', {}, Actor.USER_BUTTON, smoke_session,
    )
    threads_after = (r_read2.result or {}).get('plot_threads') or []
    final = next(
        (t for t in threads_after if t.get('id') == thread_id), None,
    )
    final_ok = bool(
        final
        and final.get('title') == renamed
        and any(
            b.get('id') == new_beat_id and b.get('text') == 'tail beat'
            for b in (final.get('items') or [])
        )
        and any(
            b.get('id') == beat_ids[0] and b.get('text') == 'opening beat — edited'
            for b in (final.get('items') or [])
        )
    )
    assert final_ok, "All edits should survive a fresh get_plot_threads"


@pytest.mark.smoke
@pytest.mark.django_db
def test_step10_tightening(smoke_project, smoke_session):
    """Identify-then-act: get_characters BEFORE update_character."""
    char = (
        Character.objects.filter(project_id=smoke_project.id)
        .order_by('id')
        .first()
    )
    if char is None:
        pytest.skip("No characters in project — skipping identify-then-act.")

    thread_id = uuid.uuid4()

    new_pnote = f"step10 note {uuid.uuid4().hex[:6]}"
    reply, tools, _ = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            f"Set the private note (pnote) on the character named "
            f"'{char.name}' to exactly: {new_pnote!r}. Call "
            f"update_character once after looking up the id."
        ),
    )

    read_idx = (
        tools.index('get_characters') if 'get_characters' in tools else -1
    )
    write_idx = (
        tools.index('update_character') if 'update_character' in tools else -1
    )
    ordered = (
        read_idx != -1
        and write_idx != -1
        and read_idx < write_idx
    )

    char.refresh_from_db()
    patched_ok = char.pnote == new_pnote

    assert ordered, (
        "Agent should call get_characters BEFORE update_character"
    )
    assert patched_ok, (
        "update_character should run with the correct id (pnote patched)"
    )


@pytest.mark.smoke
@pytest.mark.django_db
def test_step12a_preview_roundtrip(smoke_project, smoke_session, register_preview_cap):
    """Propose-with-preview round-trip: execute at propose, reuse at accept."""
    execute_calls, commit_calls, PREVIEW_PAYLOAD, PREVIEW_PAGE, SMOKE_CAP = (
        register_preview_cap
    )

    thread_id = uuid.uuid4()

    # ---- propose turn ----
    reply_a, tools_a, interrupts_a = run_turn(
        smoke_project.id, smoke_session, page=PREVIEW_PAGE, thread_id=thread_id,
        message=(
            f'Record a smoke preview. Use the {SMOKE_CAP} tool with '
            'target_id="t-001".'
        ),
    )

    proposal = Proposal.objects.filter(
        thread_id=thread_id, status=Proposal.STATUS_PROPOSED,
    ).order_by('-created_at').first()

    proposal_has_preview = bool(
        proposal is not None
        and isinstance(proposal.proposal, dict)
        and isinstance(proposal.proposal.get('preview'), dict)
        and proposal.proposal['preview'].get('draft_text')
        == PREVIEW_PAYLOAD['draft_text']
    )

    execute_count_before = len(execute_calls)

    # ---- accept ----
    accepted_ok = False
    if proposal is not None:
        accept_proposal(
            smoke_project.id, proposal.id, page=PREVIEW_PAGE,
        )
        proposal.refresh_from_db()
        accepted_ok = proposal.status == Proposal.STATUS_APPLIED

    no_recompute = len(execute_calls) == execute_count_before

    commit_saw_preview = any(
        c.get('draft_text') == PREVIEW_PAYLOAD['draft_text']
        for c in commit_calls
    )

    assert len(execute_calls) >= 1, (
        "execute() should be invoked during propose"
    )
    assert proposal_has_preview, "Proposal row should carry the preview payload"
    assert accepted_ok, "accept should flip row to APPLIED"
    assert no_recompute, "accept should NOT re-execute (no recompute)"
    assert commit_saw_preview, "commit() should receive the previewed value"


@pytest.mark.smoke
@pytest.mark.django_db
def test_step12b_merge_preview(smoke_project, smoke_session, patch_engine_merge, seed_merge_discovery):
    """Merge-mapping preview round-trip: placements resolved, accept no re-call."""
    engine_mod, engine_call_count = patch_engine_merge
    SEEDED_ROUGH_ID = seed_merge_discovery

    # --- Propose via Actor.CHAT (policy returns PROPOSE for writes). ---
    r_propose = dispatch(
        'run_merge_rough_into_grand',
        {'thread_id': SEEDED_ROUGH_ID},
        Actor.CHAT,
        smoke_session,
    )
    propose_call_count = len(engine_call_count)
    preview = (r_propose.proposal or {}).get('preview') or {}
    placements = preview.get('placements') or []
    p0 = placements[0] if placements else {}
    p1 = placements[1] if len(placements) > 1 else {}

    # --- Accept via the generic accept_proposal capability. ---
    proposal_id = (r_propose.result or {}).get('proposal_id')
    r_accept = dispatch(
        'accept_proposal',
        {'proposal_id': str(proposal_id)},
        Actor.USER_BUTTON,
        smoke_session,
    )
    accept_call_count = len(engine_call_count)

    assert r_propose.status == 'proposed', (
        "propose should return status=='proposed'"
    )
    assert len(placements) == 2 and preview.get('total_beats') == 3, (
        "preview should carry 2 placements + 3 total beats"
    )
    assert preview.get('rough_title') == "Wren's awakening", (
        "rough_title should resolve on preview"
    )
    assert p0.get('item_text') == 'Wren finds the living ink', (
        "placement[0] item_id → readable item_text"
    )
    assert p0.get('scene_text') == 'Library scene', (
        "placement[0] scene_id → readable scene_text"
    )
    assert p0.get('chapter_text') == 'Chapter 1 — Discovery', (
        "placement[0] scene_id → chapter_text"
    )
    assert p1.get('kind') == 'placeholder', (
        "placement[1] kind=='placeholder' should survive"
    )
    assert propose_call_count == 1, (
        "propose should trigger exactly ONE engine call"
    )
    assert accept_call_count == 1, (
        "accept_proposal should trigger NO new engine call"
    )
    assert r_accept.status == 'ran', "accept should dispatch status=='ran'"


@pytest.mark.smoke
@pytest.mark.django_db
def test_step13_button_source(smoke_project, smoke_session, register_button_source_cap):
    """Button-source Proposal flow: USER_BUTTON → proposed → accept."""
    SMOKE_CAP, commit_calls = register_button_source_cap

    # --- (1) dispatch via USER_BUTTON → returns proposed + Proposal row ---
    r_button = dispatch(
        SMOKE_CAP, {'target': 'thing-1'},
        Actor.USER_BUTTON, smoke_session,
    )
    proposal_id = r_button.result.get('proposal_id') if r_button.result else None

    row = Proposal.objects.filter(pk=proposal_id).first() if proposal_id else None

    # --- (2) Accept via the test helper (mirrors HTTP flow) ---
    proposal_after = None
    accept_status_ok = False
    if row is not None:
        proposal_after, events, _new_rows = accept_proposal(
            smoke_project.id, row.id, page='__smoke_button_source_page__',
        )
        row.refresh_from_db()
        accept_status_ok = row.status == Proposal.STATUS_APPLIED

    accept_committed = any(
        c.get('target') == 'thing-1' for c in commit_calls
    )

    assert r_button.status == 'proposed', (
        "dispatch(USER_BUTTON, PROPOSE cap) should return status='proposed'"
    )
    assert row is not None, "PROPOSE should create Proposal row automatically"
    assert proposal_after is not None and proposal_after.id == row.id, (
        "button-source Proposal (thread=None) should be found by accept"
    )
    assert accept_status_ok, "accept should flip button-source row to APPLIED"
    assert accept_committed, "commit() should be called with the proposal data"


@pytest.mark.smoke
@pytest.mark.django_db
def test_step14d_add_character(smoke_project, smoke_session):
    """add_character direct write: USER_BUTTON + CHAT both create immediately."""
    unique = f'__smoke_addchar_{uuid.uuid4().hex[:8]}__'
    args = {'name': unique, 'type': 'extra', 'description': 'smoke add'}

    r_write = dispatch('add_character', args, Actor.USER_BUTTON, smoke_session)
    created = Character.objects.filter(project_id=smoke_project.id, name=unique).first()

    unique_chat = f'__smoke_addchar_chat_{uuid.uuid4().hex[:8]}__'
    r_chat = dispatch('add_character', {**args, 'name': unique_chat},
                      Actor.CHAT, smoke_session)
    created_chat = Character.objects.filter(
        project_id=smoke_project.id, name=unique_chat).first()

    assert r_write.status == 'ran', (
        "USER_BUTTON should write directly (status=='ran')"
    )
    assert created is not None, "character row should be created"
    assert 'characters' in (r_write.invalidates or []), (
        "write should invalidate the 'characters' domain"
    )
    assert r_chat.status == 'ran', (
        "CHAT actor should also write directly (status=='ran')"
    )
    assert created_chat is not None, "CHAT-created row should exist"

    if created:
        created.delete()
    if created_chat:
        created_chat.delete()


@pytest.mark.smoke
@pytest.mark.django_db
def test_error_guard(smoke_project, smoke_session, monkeypatch):
    """Tool wrapper catches dispatch exceptions → [ERROR] ToolMessage."""
    class _Cap:
        name = "update_character"

    def _boom(*_a, **_k):
        raise ValueError("Field 'id' expected a number but got 'Luna'.")

    monkeypatch.setattr(chat_tools, 'dispatch', _boom)
    fn = chat_tools._wrap(_Cap(), smoke_project.id, smoke_session, thread_id=None)
    out = None
    propagated = False
    try:
        out = fn(character_id="Luna")
    except Exception:  # the bug would land here  # noqa: BLE001
        propagated = True

    is_str = isinstance(out, str)
    is_error = is_str and out.startswith("[ERROR]")
    preserved = is_str and "Luna" in out

    assert not propagated, (
        "dispatch exception should NOT propagate (tool_call not stranded)"
    )
    assert is_error, "tool should return an [ERROR] tool result string"
    assert preserved, "original error message should be preserved for the agent"


@pytest.mark.smoke
@pytest.mark.django_db
def test_ping(smoke_project, smoke_session):
    """Surface ping (ask_user): interrupt, no Proposal, resume with answer."""
    chat0 = ConsistencyChat(smoke_project.id, smoke_session, page='characters', thread_id=None)
    ask_user_registered = any(
        getattr(t, 'name', '') == 'ask_user' for t in chat0.tools
    )

    thread_id = uuid.uuid4()
    thread, _ = ChatThread.objects.get_or_create(
        thread_id=thread_id,
        defaults={
            'project_id': smoke_project.id, 'page': 'characters', 'title': 'ping smoke',
        },
    )
    ping_not_a_proposal = _materialise_proposal(
        {"kind": "ping", "question": "x", "options": []}, thread,
    ) is None

    reply, tools, interrupts = run_turn(
        smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        message=(
            "Before doing anything else, use the ask_user tool to ask me "
            "whether Luna should be a rabbit or a fox. Pass 'rabbit' and "
            "'fox' as the options. Do not call any other tool."
        ),
    )

    ping_vals = [
        v for v in interrupts
        if isinstance(v, dict) and v.get('kind') == 'ping'
    ]
    ping_surfaced = len(ping_vals) >= 1
    ping_has_question = ping_surfaced and bool(ping_vals[0].get('question'))

    resume_reply = ""
    if ping_surfaced:
        chat_r = ConsistencyChat(
            smoke_project.id, smoke_session, page='characters', thread_id=thread_id,
        )
        events = _drain_sync(chat_r, thread_id, resume="a fox")
        parts = []
        for ev in events:
            if ev.get('event') == 'on_chat_model_stream':
                c = ev['data']['chunk']
                if c.content:
                    parts.append(c.content)
        resume_reply = ''.join(parts)

    assert ask_user_registered, "ask_user tool should be registered on every chat"
    assert ping_not_a_proposal, (
        "a ping interrupt should NOT be turned into a Proposal row"
    )
    assert ping_surfaced, "agent should surface a ping interrupt (kind=ping)"
    assert ping_has_question, "ping should carry a question"
    assert bool(resume_reply.strip()), (
        "resume with the answer should produce a reply"
    )
