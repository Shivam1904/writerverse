# Features: what an author can do

> Covers: `backend/characters/capabilities/`, `backend/worldbuilding/capabilities/`, `backend/braindumps/capabilities/`, `backend/outline/capabilities/`, `backend/gauges/capabilities/`, `backend/projects/capabilities/`, `backend/projects/views/`, `backend/accounts/`, `backend/usage/`

Grouped by the author's journey. Each feature is an **action** in the backend's action menu (see [`../system/map.md`](../system/map.md)); the action names are in brackets for builders. For the exact, current list, run the dev registry page (`/api/consistency/dev/registry/`, DEBUG only). The menu has about 140 actions.

## 1. Start a project and capture ideas

- **Library and deleting a book:** the trash icon on a cover only moves the book to **Deleted books** (archive; all data kept). From there the author can **Restore** it, or **Delete forever** after typing the book's exact name; the dialog shows how many words will be erased. The backend refuses a permanent delete for a book that isn't archived. (`/api/projects/<id>/archive/`, `/restore/`)
- **Book totals on the cover:** each book's word, act, chapter and scene counts are refreshed on every outline change that affects them (a prose save, an add or a delete), by counting rows and adding up each scene's stored word count (prose is not recounted). (`refresh_totals` in `backend/outline/outline_writes.py`; whole-outline saves in `save_outline` do the same)

- **Ideas:** add, edit, delete raw notes. Edits save on their own 1.5 s after the author stops typing (and right away on blur or when leaving the page); while something is unsaved, closing the tab asks first. Editing never re-runs the tagging. Text typed into the new-idea box (or the first-run box) but not yet sent stays as a draft on this device, per project, and is back when the page opens again; it becomes an idea only on Enter. The AI **annotates** each one: it splits it into phrases, groups them and tags them (plot, character, world, dialogue, scene). It skips generic everyday props (a cup, a door) and keeps only named or plot-relevant objects. Each person, place or thing it finds gets its **own** topics (in "Leonard falls for Penny" the emotion is Leonard's only); places and things get World topics only, and a place or thing the idea doesn't name is dropped. The list shows one idea per row under an **Idea · Shows up on** header: the words on the left, chips like "Penny → Backstory · Internal arc": the sections of that person's page (or the World section) whose "from your ideas" box will show it, read from the same table those boxes use (`ideaDestinations` in `frontend/src/app/modules/sectionMarker/registry.ts`). Clicking a chip opens one small editor to drop a topic or the whole chip. Long text shows 2 lines until clicked; each row starts with the Ideas bulb, which turns into the drag grip on hover. `uv run python manage.py eval_tagging` checks the tagger on a few written-down ideas (it calls the paid AI). If the AI call fails, the idea says "Couldn't tag this idea" with **Try again** (the annotator keeps `ai_data.status: "failed"` on the row, so this survives a reload). Each annotation keeps the text it tagged (`ai_data.meta.source_text`); when the idea's text no longer matches it, the idea says "Text changed since tagging" with **Re-tag**. Re-tag saves the text, then re-runs tagging: the tags the AI added last time are replaced, and tags the author added by hand stay. On an empty project, the starter chips under the box ("a character", "a world"…) fill it with half a sentence to finish. (`add_braindump`, `update_braindump`, `annotate_braindump`)
- **Undo a delete:** deleting an idea (the trash button, or Backspace in an emptied idea) or a world entry shows a "Deleted — Undo" toast for 10 seconds; Undo brings it back. There is no trash bin: a delete only sets `deleted_at`, and deleted rows are hidden everywhere (`Braindump.objects` and `Worldbuilding.objects` skip them). (`delete_braindump` / `undelete_braindump`, `delete_worldbuilding` / `undelete_worldbuilding`; the shared toast is `deletedWithUndo()` in the receipt store)
- **Project details:** title, synopsis, genre, themes, tones, logline, point of view. The AI can suggest values; the author accepts or rejects **each field** separately. (`update_project_meta`, `accept_project_meta_field`)

## 2. Build the story bible

**Characters**
- Add, edit, delete; roles such as protagonist or antagonist. (`add_character`, `update_character`)
- **Describe one:** type a name and a line (plus any ticked ideas) and it is saved as a new character exactly as written. **No AI runs**, so the button carries no AI mark.
- **Undo a delete:** same 10-second "Deleted — Undo" toast as ideas, no confirm prompt. Deleted characters keep their row (`deleted_at`) but are hidden everywhere, and their name is free for a new character; Undo fails if a new one took the name meanwhile. (`delete_character`, `undelete_character`)
- **Make real:** turn an idea into a character; the AI then drafts a description plus inner and outer arcs as a proposal. `uv run python manage.py eval_make_real` scores that draft on written-down test stories against golden answers, and compares prompt versions (it calls the paid AI). (`promote_to_character`, `enrich_promoted_character`)
- **Merge duplicates:** fold "Tommy" into "Tom" as an alias. (`alias_character`)
- **Portrait image** from a description. (`generate_character_portrait`)
- **Character studio:** one character in full, with each AI-suggested field accepted or rejected on its own. Every field saves on blur, including backstory, the world object and the signature line, so collapsing a section or reloading keeps the text. (`get_character_full`, `accept_character_field`)
- **Presence chart:** one bar per scene, as tall as the number of times the character is @mentioned there. The backend recounts a scene's @mentions each time its prose is saved (no AI). If the optional pronoun resolver is on, a bar shows whichever count is higher.

**World**
- **Story section** (top of the page): title, synopsis, logline, genre, themes, tone, point of view. **✦ Suggest** opens Night Eyes with a request ready to send; the AI runs only when the author sends it. **✦ Suggest a title** (next to the title) asks the free title helper for a title built from the synopsis and the author's ideas, and fills it in; the AI never names the book on its own. AI suggestions (from the chat, or a title/synopsis from a braindump extract that differs from the author's) show green in the field they change, with ✓ accept / ✗ dismiss per field. If the author changed the field after the AI suggested it, accept asks first: use the AI's, or keep theirs. The lightbulb shows the author's own plot and theme ideas (no AI). (`get_project_meta_full`, `accept_project_meta_field`, `reject_project_meta_field`)
- Entries by type (places, factions, magic, rules, creatures…), organised into sections the author can name and add. (`add_world_entity`, `add_world_block`)
- **Make real** for world entries; the AI drafts an entry's description from everything the ideas say about it. (`promote_to_world_entity`, `draft_world_entity`)
- The AI can pull **structured story elements** (summary, characters, places…) from the synopsis and ideas. (`run_init_elements`)

## 3. Plan the story

**Plot threads**
- Create by hand, from a **template** (a named beat skeleton), or have the AI **generate** one from selected ideas or a plain description. (`add_plot_thread`, `get_thread_scaffolds`, `generate_thread`, `generate_thread_from_description`)
- **Extract from scenes** (start screen) asks the AI to pull storylines out of what's drafted. It only queues a suggestion: the button reads "Queued for review" until the author accepts or rejects it, then can run again. (`run_user_wishes_rough`)
- Rename a thread, or change who it belongs to (its **scope**: the whole story, a character, a place…) from the thread's ⋯ menu. (`update_plot_thread`)
- Add, edit, delete and **drag to reorder** beats (a heading drags the beats under it too); the AI can propose beats. If a beat's text fails to save, the typed text stays on screen with a message and is retried on the next edit or when you leave the beat; a failed new beat, delete, type change or move is undone, with a message. A move saves the thread's whole beat order; if the thread changed elsewhere since the page loaded, the server refuses and the move is undone. Deleting a thread or a thread beat keeps any outline beats placed from it (with their text); only their link to it goes. (`add_thread_beat`, `reorder_thread_beats`, `propose_insert_beat`, `delete_plot_thread`)

**Outline**
- Start from a structure (e.g. three-act). (`init_grand_outline`, `get_outline_scaffolds`)
- Add, edit, delete and **reorder** acts, chapters, scenes and beats. Acts, chapters and scenes move with the ↑ ↓ buttons that show on hover (within the same parent; hidden while a thread filter is on); beats are dragged. (`add_outline_item`, `reorder_outline_item`)
- Place a thread's beat into a scene, or let the AI **weave a whole thread** into the outline (beats already in the outline are skipped, so running it again only places what is missing). A move or placement that fails to save is undone on screen, with a short message. (`place_thread_beat`, `run_merge_rough_into_grand`)

**Undo a beat delete** (outline beats and thread beats; the delete button or Backspace on an empty beat)
- A beat that had words or a thread link shows the same 10-second "Beat deleted — Undo" toast. There is no soft delete: the row really goes, and the delete returns an `undo_token`, a signed snapshot of the beat (text, kind, edit stamps, neighbours and position, links). Undo sends it back and the beat returns in place with the same id: after its old previous neighbour, else before its old next one, else at its old index. An outline beat gets its thread links back; a thread beat re-links the outline beats placed from it (unless one was re-linked meanwhile). (`restore_deleted_beat`, author clicks only; `backend/outline/beat_undo.py`)
- The token is signed and tied to the project, so it can't be edited or used in another book, and it expires after 15 minutes. Undo refuses, with a message, when the beat's scene or thread was deleted since. A second Undo changes nothing; if the old id was taken meanwhile, the beat comes back under a new id.
- Acts, chapters, scenes and whole threads have no Undo yet. So deleting an act, chapter or scene that has anything inside asks first and says what goes with it ("1 chapter, 3 scenes, 12 beats, 840 words of prose"); an empty one deletes without asking. (`deleteConfirmMessage` in `modules/outline/tree.ts`)

## 4. Write

- Scene prose in the editor, saved per scene. Closing or reloading the tab with unsaved prose shows the browser's leave prompt; hiding the tab saves it. If the login expires, unsaved prose is parked in the browser and the redirect to /login shows no leave prompt; the prose returns after login. A failed save (network or server error) is retried a few times with growing pauses; if it still fails, a banner names the scene and stays until a save succeeds. (`save_scene_content`)
- Each scene keeps a capped history of its earlier prose. On the Write page, the active scene's margin has a **History** button: it lists those versions (time, word count, newest first), previews one, and **restores** it after a confirm. Unsaved typing is saved first, and the prose a restore replaces becomes a new version, so a restore can be undone. (`list_scene_revisions`, `get_scene_revision`, `restore_scene_revision`; screen: `pages/write/v2/SceneHistory.tsx`)
- The AI can **add paragraphs**, or **propose rewrites** of existing ones. Each lands in the prose as a green pending block with **Accept** (keep it) and **Dismiss**: dismissing a rewrite puts the author's original paragraph back (as plain text), dismissing an added paragraph removes it. (`insert_scene_paragraphs`, `propose_scene_edits`; screen: `components/DraftingCanvas/AiGeneratedBlock.ts`)
- **Attach a braindump or world entry to a scene** from the scene's margin, the selection bubble, or the chat selection bar. It shows as "attached" in the margin, survives a reload, and can be removed with its ×. Attaching never touches the scene's prose; a failed attach shows a message. (`link_scene_entity`, `unlink_scene_entity`; stored on the scene as `entity_links`)
- **@-mention** a character, braindump or world entry while writing: type `@`, pick a name, and it replaces what you typed as a mention. (screen: `components/DraftingCanvas/useMentionExtension.tsx`)
- **Point of view** per chapter, with a project default. The POV character is linked by id, so renaming the character updates it everywhere. (`set_chapter_pov`, `set_project_pov_default`)
- **Search the manuscript** for a word or name. (`search_prose`)
- **Preview:** read the book like a reader, with its formatting (bold, italics, quotes, lists, scene breaks) and @mentioned names. Pending AI blocks are not shown: Preview reads them as dismissed (an added paragraph is hidden, a rewrite shows the author's original) until the author accepts them. It loads the book one chapter at a time as you scroll (never the whole manuscript at once), and skips chapters with nothing written. (screen: `pages/preview/`)

## 5. Check the story

**Scene checks**, each switchable per project (`set_scene_pipeline`):

| Check | What it looks at |
| --- | --- |
| Hook grade | Does the scene open and close strongly? |
| POV purity | Head-hopping between characters' points of view |
| Voice consistency | Does the voice stay the same? |
| Subtext | On-the-nose dialogue |
| Scene fingerprint | Pacing, mood, intensity |
| Scene summary | A short summary of what happens |
| Names and pronouns | Who each "she" or "he" refers to |

**Lenses:** story checks the author attaches to part of the story (a character, a thread, the whole book). The AI can **suggest** lenses that fit, or **invent** a custom one from a plain request ("does Mara stay brave?"). Results come back as verdicts and charts. **Attaching is free and runs no AI:** the lens shows "Not read yet" (or "Nothing to read yet" on an empty book) until the author presses **Read my story** (which shows a cost label when an extension gives one). Saving a lens's settings clears its old reading; nothing re-runs by itself. A reading shows as **outdated** (re-run) when something it read was edited after it ran, or when the order it read changed: each reading saves a short fingerprint of the ids along its walk (outline walk: acts, chapters, scenes, beats; story walk: acts, chapters, scenes; thread walk: the thread's beats), and the board compares it with the live outline. Moving a beat inside a scene therefore marks outline-walk lenses outdated, not story-walk or thread lenses. (`order_fingerprint` in `backend/gauges/engine/_analyse.py`) (`bind_gauge`, `suggest_gauges`, `invent_lens_from_ask`, `analyse_gauge`)

## 6. Night Eyes, the AI assistant

- A chat available on every page. It reads the project and uses **the same actions** as the buttons above; each page decides which actions it gets.
- Small edits happen directly; bigger changes come back as **proposals**: Accept, Dismiss, or edit before accepting. (`accept_proposal`, `reject_proposal`, `update_proposed_*`) Accepting or dismissing anywhere (the bell, a green inline beat) clears that proposal everywhere; if the request fails, the card stays.
- Long chats are summarised automatically so they keep working.

## 7. Account and AI usage

- Sign up, log in, reset password, edit your name on the Profile page. Sign-up shows a terms checkbox only when an extension gives terms (`signupTerms`); when it is ticked the server saves when, and which version (the `TERMS_VERSION` setting). `REQUIRE_TERMS_ACCEPTANCE` (off by default) makes the server refuse a sign-up without it. Email can't be changed yet. (`/api/auth/`) On a deployed server a new account must **confirm its email** (click the emailed link) before it can sign in; the link signs it in. Account emails (verify, welcome, reset, password changed, account deleted) are listed in [`account-emails.md`](../how-it-works/account-emails.md). A reset link works even when someone is already signed in in that browser; once the new password is set, that browser is signed out too. Signing out never sends the login token (an expired or cancelled one would make the server refuse the sign-out), so it also works when the session has already ended. If the "send reset link" request fails, the page says so instead of claiming an email was sent.
- **Change password** (Profile page): needs the current password and passes Django's password rules. Every other device is signed out; this one stays in. A password reset signs out every device too.
- **Delete account** (Profile page, danger zone): needs the current password and the word `DELETE`. It deletes the user and everything they own at once, with no undo: books and every row under them, and their AI usage records.
- The **AI policy** (`WRITERVERSE_AI_POLICY`, `backend/usage/policy.py`) is asked **before** AI runs: chat asks at the start of each turn; button and page actions ask in `dispatch()` for every capability marked `uses_ai` (dispatch logs an error in dev when an unmarked capability spends tokens). Saves, edits and reads never ask. The default policy allows everything; an edition can add usage limits. A refusal (HTTP 402 by default) shows its message, unless an extension's `handleApiError` handles it. One chat turn (tool calls included) or one action is **one** `AIUsage` record, and tokens spent before a failure are still recorded.
- **Small helpers** (idea tagging, title suggestions, lens suggestions, and naming an untitled scene when it's saved) run on the small model, except idea tagging, which uses the mid-size model because the small one left ideas untagged in a test (wrt-115). Buttons that run AI can show a cost label before the click when an extension gives one (`useCostLabel`).
