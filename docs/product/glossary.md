# Glossary

> Covers: `frontend/src/config/lexicon.ts`, `frontend/src/app/nav.ts`, `backend/actions/capabilities/spec.py`, `backend/actions/models.py`

Two lists: words **authors** see in the app, and words **builders** meet in the code. When the app and the code use different words for the same thing, both are given.

Official author-facing words live in `frontend/src/config/lexicon.ts`. UI code imports them from there instead of typing its own.

## Words authors see

| Word | Meaning | In code |
| --- | --- | --- |
| **Ideas** | Raw notes the author dumps in, tagged as plot, character, world, dialogue or scene | `braindumps`, model `Braindump` |
| **Make real** | Turn an idea into a real character or world entry, with AI filling in the details | `promote_to_character`, `promote_to_world_entity` |
| **Characters** | The people in the story | `Character` |
| **Character studio** | A workspace for one character, with its own AI chat | `character-studio` |
| **World** | Places, things and rules of the story world | `Worldbuilding` (plus `WorldBlock`, `StoryItem`, `StoryRule`) |
| **Threads** | Plot threads: a storyline made of beats, about one character or the whole story | `plot-threads`, `PlotThread` + `ThreadBeat` (older name: "rough outline") |
| **Beat** | One step in a thread or scene plan. A **placeholder** beat has no text yet and can be placed into the outline. | thread `items` (`ThreadBeat`), scene `beats` (`OutlineBeat`), `kind: "placeholder"` |
| **Outline** | The book's structure: acts → chapters → scenes | `Act`, `Chapter`, `Scene` |
| **Merge** | Weave several threads into the one outline | `pages/merge`, `run_merge_rough_into_grand` ("grand outline" = the merged whole) |
| **Manuscript** | The written prose, organised by chapter and scene | nav id `chapters`; one scene's prose is a `SceneContent` row |
| **Preview** | Read the book as a reader would (read-only) | `pages/preview` |
| **Lenses** | Checks the author can point at part of the story, e.g. "does this character stay consistent?", each giving a verdict. The naming here is being re-planned. | page folder `walks`; data in the `gauges` app tables ("gauge" is the older word) |
| **Point of view / tense** | Narrative voice for the book, with per-chapter overrides | `Project.perspective`, `Project.tense`, `set_chapter_pov` |
| **Imagine / Plan / Write** | The three modes that group the sidebar | `Mode` in `nav.ts` |
| **Night Eyes** | The AI assistant. Always this one name; page personas appear only as "Night Eyes · The Reader" and similar. | `night_eyes`, `ASSISTANT_NAME` |
| **Proposal** | An AI change waiting for the author's decision. The only two buttons are **Accept** and **Dismiss** ("Apply" is not used). | `Proposal`; code says `reject` for Dismiss |
| **Notification** (the bell) | An information-only message; nothing to accept. The bell also lists waiting proposals. | `Notification` |
| **Receipt** | A small toast after work is done: "✦ what → where" | `modules/receipt` |
| **Problem** | A red toast when a save or other change fails ("Couldn't update scene…"). Stays until dismissed. Failed reads don't show one. An extension may handle some API errors itself (`handleApiError`) instead. | `problem()` in `modules/receipt`, fired by `gateway.ts` |

## Words builders see

| Word | Meaning |
| --- | --- |
| **Capability** (also: action, op, tool) | One entry in the menu of actions. The frontend calls it with `callOp()`; Night Eyes sees the same thing as a "tool", under its AI-facing name (`tool_name`, else `name`). A placeholder that does nothing yet is marked `stub` and can never be given to Night Eyes. `night_eyes/tests/test_prompt_tool_names.py` fails if the prompt or a frame names a tool Night Eyes can't call. |
| **Actor** | Who runs an action: `USER_BUTTON` (a click), `CHAT` (the AI), `INTERNAL` (an app hook, e.g. on save), `CRON` (a scheduled job). |
| **Route** | What an action does: `READ` (returns data), `WRITE` (saves directly), `PROPOSE` (creates a Proposal and stops). |
| **Dispatch** | The function that runs any action: finds it, checks it, runs gather → execute → commit. |
| **Proposal status** | `PROPOSED` (waiting), `APPLIED` (accepted), `REJECTED` (dismissed), `FAILED` (accept went wrong). |
| **Proposal source** | Where it came from: `chat`, `button` or `cron`. |
| **Stale proposal** | The author changed the target after the AI suggested it. Accept is refused (409 `proposal_stale`) and the card shows "You changed this after the AI suggested it" with the author's value next to the AI's: **Use AI's** (accept with `force`) or **Keep mine** (dismiss). Each proposal saves the target's value when made (`Proposal.base`); see `backend/actions/capabilities/stamps.py`. |
| **Staleness / invalidates** | After a write, the backend names the kinds of data that changed so screens refresh just those parts. |
| **Frame** | Per-page settings for Night Eyes: which actions it gets on that page. |
| **Compaction** | When a chat gets long, older messages are summarised; the last 8 stay as they are. |
| **Chat thread** | One saved Night Eyes conversation (`ChatThread`). |
| **Domain version** | When one part of a project (outline, characters…) last changed (`ProjectDomainVersion`). Lets Night Eyes say "[STALE]: this changed since you read it". |
| **Scene pipelines** | Optional analysis jobs that run when a scene is saved; each can be switched on or off. |
| **Role** | Which grade of AI model a task asks for: `small`, `draft` or `expert`. |
| **Showcase** | Internal pages where UI components are designed before being used in the app. |
| **World entry** | One item on the World page (`Worldbuilding` row), filed under headings by its tags. |
| **World block** | A World-page heading the author added or restyled (`WorldBlock` row). Built-in headings live in code. |
| **Story elements** | What the author accepted from the AI's first read of their ideas: a story title + summary (fills the project's empty title/synopsis, otherwise proposed as a change), items (`StoryItem`) and rules (`StoryRule`). |
| **Activity log** | Developer-only debug log (`ActivityEvent`): AI steps and shadow nudge checks per project (AI cost lives in `AIUsage`). Read it in the admin. |
| **Shadow nudge** | A nudge rule (e.g. "want to see the shape so far?") that is checked and logged but not shown to authors yet. |

## Unclear today

These words exist in the code, but their meaning isn't clear from it yet. They get defined here once we look into them:

- **Walk**: the folder name behind the Lenses page; the word itself isn't explained anywhere.
