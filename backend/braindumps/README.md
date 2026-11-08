# braindumps

Scattered ideas, notes, and raw thoughts from the author.

## Role in the System

Braindumps capture the unstructured creative flow — ideas, snippets, dialogue fragments, scene concepts, character thoughts — anything the author wants to dump without worrying about where it fits. Each braindump entry has a category (plot/character/world/dialogue/scene/other), priority, status, and optional AI-generated annotations.

## How It Connects

- `Braindump` FK → Project (`related_name='braindumps'`)
- REST routes in `urls.py`, mounted by `config/urls.py` at `/api/projects/<id>/braindumps/`.
- The braindump actions (for the page and the AI) are declared in `capabilities/` and run by the `actions` kernel; their reads and writes are in `readers.py`.
- AI annotation (`ai/annotator.py`) enriches entries with tags, categories, and extracted entities.

## Key Patterns


## Source Map

| File | Purpose |
|------|---------|
| [models/braindump.py](models/braindump.py) | `Braindump` model — title, content, category, priority, AI data |
| [views/braindump.py](views/braindump.py) | `BraindumpViewSet` — CRUD |
| [serializers/braindump.py](serializers/braindump.py) | `BraindumpSerializer`, `BraindumpCreateSerializer` |
| [readers.py](readers.py) | Read/write helpers behind the braindump capabilities (`get_braindumps`, create/patch/annotate/delete) |
| [capabilities/](capabilities/) | Braindump capabilities: `register.py` (registrations) + gather / execute / commit steps |
| [engine/generation.py](engine/generation.py) | Element extraction + promote-to-character / world-entity drafts |
| [ai/annotator.py](ai/annotator.py) | AI annotation: phrases, packs, entities, tags |
| [ai/tags.py](ai/tags.py) | Tag taxonomy loader for [ai/braindump_tags.yml](ai/braindump_tags.yml) |
| [urls.py](urls.py) | REST routes |
