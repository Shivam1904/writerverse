# activity

The developer debug log: what the app and its AI did, per project.

## Role in the System

`ActivityEvent` holds one row per thing that happened behind the scenes. Authors never see it; developers read it in the Django admin (**Activity Log**, filter by project / kind / date) to understand how the AI behaved. Two kinds:

- **step**: an AI pipeline step finished (extract, snap, merge, generate_thread, user_wishes), with step counts.
- **nudge**: a *shadow* nudge check. When an author loads a project page (`get_project_meta` from a button/page, not chat), `actions/awareness/evaluate.py` runs the nudge rules and logs which nudges WOULD fire and why. Nothing is shown to the author. At most once per 30 minutes per project.

Rows older than 30 days are deleted during the nudge check (`prune_old_events`).

## How It Connects

- `ActivityEvent` FK → Project (CASCADE: deleted with the project).
- No views, URLs or serializers; written by `actions` (commit modules, dispatcher, awareness).
- Writers never raise: logging must not break the action being logged.
- AI cost (tokens and $) is not logged here. `AIUsage` (usage) is the one record of it.

## Source Map

| File | Purpose |
|------|---------|
| [models.py](models.py) | `ActivityEvent` — one row per step / nudge check |
| [store.py](store.py) | `log_step`, `log_nudge_check`, `last_event_at`, `prune_old_events` |
| [admin.py](admin.py) | The Activity Log admin page |
