# Decision: every AI role has an ordered list of backup models (Claude first)

> Covers: `backend/ai_engine/config/providers.yml`, `backend/ai_engine/config/core.py`, `backend/ai_engine/llm_utils.py`

**Date:** October 2026. **Status:** done. (wrt-71)

## What we decided

1. **A role is an ordered list of provider/model pairs**, not one fixed model. The role's `provider` + `model` is the main one; its `fallbacks:` list in `providers.yml` holds the backups, tried in order. More backups (other providers) are added by adding pairs, with no code change.
2. **Today each role has one backup: the Claude model of the same tier.** `small`: gpt-5.4-nano, then claude-haiku-4-5. `draft`: gpt-5.4-mini, then claude-sonnet-4-6. `expert`: gpt-5.4, then claude-opus-4-8.
3. **What switches to the backup:** the provider can't be reached or times out, it refuses our key (401/403), it rate-limits us (429), or it has a server error or is overloaded (5xx). A bad request (400) or a refused prompt does **not** switch: the backup would fail the same way, and switching would hide the bug.
4. **The cost recorded is what the call really cost.** Each call is priced by the model that answered, so a call answered by the backup is recorded at the backup's price. Every backup must be priced, like a main model; the startup check refuses one that isn't.
5. **Keys (changed 2026-11 for open source):** keys are optional everywhere. A model whose key is unset is left out of the chain, so one provider's key runs every text role. With no key at all the server still starts, and each AI feature answers HTTP 503 `ai_not_configured`. The startup check only warns (`writerverse.W002`) about what can't run.

## Why

- **One provider was a single point of failure.** An OpenAI outage or a blocked key stopped every AI feature, and the old Anthropic key was dead.
- **Many providers later.** The owner expects more than one backup over time, so a list is the shape that grows without more code.
- **Same tier keeps quality and cost close.** A backup that is much weaker would give worse answers; much stronger would cost the author far more.

## Options we did not take

- **Accept the single-provider risk.** Cheapest, but one bad day at OpenAI means WriterVerse has no AI at all.
- **One fixed backup per role.** Simpler config, but it would need rework as soon as a third provider arrives.
- **A router service (OpenRouter, LiteLLM proxy).** Another paid middleman and one more thing that can break.

## Known limits

- A main model that hangs costs up to 2 × its `timeout` (one retry) before the backup is tried.
- A Night Eyes chat that falls back mid-thread continues on the backup with the same history.
- Portrait images (`images:`) have no backup yet: they still need OpenAI.
