# ai_engine

AI plumbing only: model roles, building a model, token metering, image generation. A plain Python package, not a Django app (it is not in `INSTALLED_APPS` and has no tables, routes or migrations).

## Role in the System

Every LLM call in WriterVerse is built here. Code asks for a **role** (`small`, `draft`, `expert`), never a model name; `config/providers.yml` maps each role to a provider and model, with its price.

`ai_engine` has no Django imports and imports no WriterVerse app. It takes plain data (strings, dicts) and returns results. It sits in the bottom layer with `common` (checked by import-linter; see `docs/system/code-layout.md`).

Domain AI does **not** live here. Prompts and chains live with their story area: scene checks in `outline/ai/`, braindump annotation in `braindumps/ai/`, gauge analysis in `gauges/engine/`, the chat agent in `night_eyes/`.

## How It Connects

- Imported by: `outline`, `braindumps`, `gauges`, `characters` (portraits), `night_eyes`, `usage` (cost of an AI unit), `actions` (dispatch reads the usage meter), `projects` (startup config check).
- Config fails loudly, never quietly picks a default: an unknown role, an unpriced model or (when `AI_ENABLED`) a missing API key is an error. `projects/checks.py` runs the same check at startup.
- **AI units:** `create_llm` attaches `check_billed` to every model. An LLM call with no AI unit open (a dispatch or a chat turn, see `units.py`) raises `UnbilledCallError` in dev and tests and logs a warning in prod. `usage/apps.py` sets that strict flag, so this package stays Django-free.

## Key Patterns

- **Role-based models**: the `roles:` section of [config/providers.yml](config/providers.yml) is the official ladder (OpenAI main models today, by choice).
- **Backup models**: each role's `fallbacks:` is an ordered list of provider/model pairs (Claude today). `create_llm` wraps them with LangChain's `with_fallbacks`, so an outage, refused key or rate limit moves the call to the next one; `bind_tools` / `with_structured_output` still work. See [the decision](../../docs/decisions/2026-10-ai-backup-provider.md).
- **Limits on every call**: `create_llm` passes each model's `timeout` and `max_tokens` (output cap) from providers.yml, plus one retry (`DEFAULT_MAX_RETRIES`).
- **Unreadable replies are free**: `ask_json(strict=True)` raises `UnreadableReply` and drops those calls' tokens from the recorded usage (`usage_meter.free_if`).
- **Usage meter**: `usage_meter.meter()` counts tokens across every model call inside it; `cost_usd()` prices each call with the `genai-prices` library (input, cached input and output at their own rates). Pricing fails closed: no price, no model. Each call's cost is recorded in `usage.AIUsage`; the AI policy (`WRITERVERSE_AI_POLICY`) decides any limits.

## Source Map

| File/Dir | Purpose |
|----------|---------|
| [llm_utils.py](llm_utils.py) | `create_llm(role)`, `ask_json(prompt, role)` |
| [usage_meter.py](usage_meter.py) | `meter()`, token counts, prices, `check_billed` |
| [image_gen.py](image_gen.py) | Character portrait generation |
| [parsers.py](parsers.py) | Pydantic schemas for the scene checks' structured output |
| [config/core.py](config/core.py) | Loads and validates `providers.yml`; API keys from env |
| [config/providers.yml](config/providers.yml) | LLM role → provider + model + price |
| `tests/` | This package's tests |
