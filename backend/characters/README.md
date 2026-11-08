# characters

Character profiles with rich arc, voice, and relationship metadata.

## Role in the System

Characters are the most data-rich domain model. Beyond basic description and appearance, each character carries story arc fields (external arc, internal arc, want, need, misbelief), voice profile (lexicon, sentence patterns, taboo words), evolving states, permanent traits, relationship notes, and aliases with optional cross-character references.

The `want_items`, `need_items`, and `misbelief_items` JSON fields link character motivations to specific outline draft items — connecting character arc to story structure.

## How It Connects

- `Character` FK → Project (`related_name='characters'`). `CharacterRelationship` is one directed link between two characters (FK → Project, `from_character`, `to_character`).
- REST routes in `urls.py`, mounted by `config/urls.py` at `/api/projects/<id>/characters/`.
- The character actions (for the page and the AI) are declared in `capabilities/` and run by the `actions` kernel. Their reads and writes are in `readers.py`.
- `name_collision_service.py` detects collisions with other characters AND worldbuilding entries. World titles come through `name_sources.py`: worldbuilding registers a source at startup, so characters never imports worldbuilding (that would make an import loop: worldbuilding already imports characters).

## Key Patterns

- **Commit generated**: `commit_generated/` persists a list of character previews. Its AI generator (`generate_characters/`) was removed; rebuild ticket SA-312.
- **Name collision detection**: Pure algorithmic — edit distance, Soundex phonetic similarity, first-letter clustering. No LLM involved.
- **Dual serializers**: `CharacterSerializer` (read, with display methods) and `CharacterCreateSerializer` (write, with validation).
- **Portrait files**: `portraits.py` saves, finds and deletes portrait images in Django's file storage (local disk in dev, Cloudflare R2 in prod; see `config/storage.py`). The row keeps only the public URL. `signals.py` removes the file when a character row is really deleted (soft delete keeps it for Undo).

## Source Map

| File | Purpose |
|------|---------|
| [models/character.py](models/character.py) | `Character` model — all fields |
| [models/relationship.py](models/relationship.py) | `CharacterRelationship` — one directed link between two characters |
| [views/character.py](views/character.py) | `CharacterViewSet` — CRUD + main characters, commit generated, name collisions |
| [serializers/character.py](serializers/character.py) | `CharacterSerializer`, `CharacterCreateSerializer` |
| [services/name_collision_service.py](services/name_collision_service.py) | Algorithmic name collision detection |
| [readers.py](readers.py) | Character reads and writes used by the actions (list, one by id, patch, delete/undelete) |
| [fields.py](fields.py) | The one list of character fields and how each kind is read and written |
| [capabilities/](capabilities/) | Character actions: `register.py` declares them, `gather/execute/commit.py` run them |
| [portraits.py](portraits.py) | Portrait image files: key layout, save, delete |
| [name_sources.py](name_sources.py) | Other areas' names a character name may clash with (registered at startup) |
| [urls.py](urls.py) | REST routes |
| [signals.py](signals.py) | Deletes a portrait file with its character row |
