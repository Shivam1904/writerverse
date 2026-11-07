# projects

Central hub of the data model. Every story area points to Project.

## Role in the System

Project is the container for everything: characters, worldbuilding, braindumps, outline, chat threads, proposals. It holds basic metadata (title, description, genre), the story configuration (POV, tense, audience, tone) and AI tool settings.

The `book_config` JSON field holds page-estimate settings (its only key is `page`). It is one of the few things kept as JSON on purpose; see [`docs/system/data-model.md`](../../docs/system/data-model.md).

Project also owns the `status` field (imagine/plan/write/completed/paused/abandoned), which drives the frontend's mode-filtered navigation: which sidebar sections are visible and which page the user lands on.

## How It Connects

- Almost every per-project table points at `Project` and is deleted with it. The full map: [`docs/system/data-model.md`](../../docs/system/data-model.md).
- `projects` is a story app (same layer as `characters`, `outline`, …), but any layer may import `projects.models`, `projects.scoping` and `projects.signals`: the project is the owner of all data. See the layers in [`docs/system/code-layout.md`](../../docs/system/code-layout.md).
- Outline settings on Project: `outline_base_template`, `pov_default`, `scene_pipelines` (read/written only via `outline.store`).
- The Project row doubles as the per-project write lock: every WRITE dispatch takes `SELECT FOR UPDATE` on it (see `actions/capabilities/dispatch.py`).
- A project REST update sends `domains_changed` (`signals.py`) instead of importing `actions`; the kernel listens and bumps the domain versions, so other open tabs refetch.

## Key Patterns

- **Package layout**: `models/`, `serializers/`, `views/` directories instead of single files.
- **One owner check**: `scoping.py` has `owned_project_or_404` (404 unless the project is the caller's) and `ProjectScopedMixin` for the nested REST viewsets in other apps.
- **Startup checks** (`checks.py`): an error stops the command if `providers.yml` has a role with an unknown or unpriced model, or (when `AI_ENABLED`) a missing API key; a warning if `AI_ENABLED=True` but the database is not PostgreSQL (the pgvector extension is kept for meaning-search, SA-311).

## Source Map

| File | Purpose |
|------|---------|
| [models/project.py](models/project.py) | `Project` model — all fields and methods |
| [views/project.py](views/project.py) | `ProjectViewSet` — CRUD + archive/restore |
| [views/dev_ai_settings.py](views/dev_ai_settings.py) | Dev-only AI settings toggle |
| [serializers/project.py](serializers/project.py) | `ProjectSerializer`, `ProjectListSerializer` |
| [urls.py](urls.py) | Project routes (mounted at `/api/projects/` by `config/urls.py`) |
| [scoping.py](scoping.py) | `owned_project_or_404`, `ProjectScopedMixin` |
| [signals.py](signals.py) | `domains_changed` signal |
| [checks.py](checks.py) | Startup checks (AI config, Postgres + AI_ENABLED) |
| [readers.py](readers.py) | `get_project_meta_full`: World-page project details with pending proposals |
| [meta_fields.py](meta_fields.py) | Canonicalises metadata patches (genre/theme folding, POV/tense/audience codes) |
| [capabilities/](capabilities/) | Project-detail actions (`update_project_meta`, per-field accept/reject/edit) and global tools (`get_project_meta`, `generate_title`) |
| `tests/` | This app's tests, including cross-project access (`tests_cross_tenant.py`, `tests_foreign_record_ids.py`) |
