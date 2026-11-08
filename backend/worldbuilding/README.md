# worldbuilding

World entries: locations, lore, factions, magic, and the World-page sections that hold them.

## Role in the System

Worldbuilding entries capture the author's world — locations, magic systems, political structures, historical events, cultural norms. Each entry can hold tags. (An old hidden AI call that pulled "rules" out of every saved entry was removed; rebuild ticket SA-312.)

`WorldBlock` holds the World-page headings the author added or restyled. `StoryItem` and `StoryRule` hold the items and rules the author accepted from the AI's first read of their ideas (the story title and summary fill the project's empty title/synopsis, or are proposed as a change).

## How It Connects

- `Worldbuilding` FK → Project (`related_name='worldbuildings'`)
- `WorldBlock`, `StoryItem`, `StoryRule` FK → Project (`world_blocks`, `story_items`, `story_rules`)
- REST routes in `urls.py`, mounted by `config/urls.py` at `/api/projects/<id>/worldbuildings/`.
- At startup `apps.py` registers `name_source.py` with `characters/name_sources.py`, so the character name-collision check sees world titles.

## Key Patterns

- **Read helpers**: `store.py` (`load_world_blocks`, `load_elements`) returns these rows as plain dicts (the World page readers and the gauges use them).
- **Capabilities**: the World page's actions (add/update/delete worldbuilding, world blocks, world entities, chat's `get_world`) register from `capabilities/`. Their readers and writers are `readers.py` (entry CRUD) and `block_readers.py` (blocks = tags on entries).

## Source Map

| File | Purpose |
|------|---------|
| [models/worldbuilding.py](models/worldbuilding.py) | `Worldbuilding` model — title, content, tags, status |
| [models/world_block.py](models/world_block.py) | `WorldBlock` — author-added World-page headings |
| [models/story_element.py](models/story_element.py) | `StoryItem`, `StoryRule` — accepted story items and rules |
| [views/worldbuilding.py](views/worldbuilding.py) | `WorldbuildingViewSet` — CRUD |
| [serializers/worldbuilding.py](serializers/worldbuilding.py) | `WorldbuildingSerializer`, `WorldbuildingCreateSerializer` |
| [readers.py](readers.py) | Worldbuilding entry CRUD in the page's read shape; `get_items` / `get_rules` (StoryItem / StoryRule) |
| [block_readers.py](block_readers.py) | World blocks: `get_world_blocks`, `get_world_block`, `get_world_entities` (whole list, for chat), `block_row_by_title` |
| [capabilities/](capabilities/) | World capabilities: `register.py` + `gather.py` + `commit.py` |
| [store.py](store.py) | `load_world_blocks`, `load_elements` (reads only; writes go row by row through the models) |
| [name_source.py](name_source.py) | World titles for the character name-collision check |
| [urls.py](urls.py) | REST routes |
