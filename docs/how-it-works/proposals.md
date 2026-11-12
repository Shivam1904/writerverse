# Proposals: AI changes the author must OK

> Covers: `backend/actions/capabilities/commit/_proposals.py`, `backend/actions/capabilities/stamps.py`, `frontend/src/app/modules/proposal/`, `frontend/src/app/gateway.ts`

A **proposal** is the AI saying "I'd like to change X to Y". Nothing in the story changes
until the author presses **Accept**. **Dismiss** throws it away (the code calls it `reject`).
Words and statuses are in the [glossary](../product/glossary.md).

Example: in chat the author asks "give Mara green eyes". Night Eyes calls a PROPOSE tool.
A `Proposal` row is saved, the chat reply goes on, and a card appears. Mara's eyes only
change when the author accepts.

## Where a proposal comes from

A capability with `Route.PROPOSE` does not write. It saves a `Proposal` row
(`backend/actions/models.py`) with what it would change (`proposal.preview`) and
returns HTTP 202. Sources: `chat`, `button`, `cron`.

- **Chat does not pause.** The tool returns "proposed" and Night Eyes keeps talking.
  The stream sends a `proposal` event for each new row. Accept never resumes the chat.
- **Base stamp.** When the row is made, the capability's `stamp` function saves the
  current value of every field the proposal would overwrite, in `Proposal.base`.
  Proposals that only add something (a new beat, a new entry) overwrite nothing, so their
  stamp is empty.

## Where the author sees it

All pending proposals live in **one client list**, `useProposalStore`
(`modules/proposal/useProposalStore.ts`). It is filled from:

- a button's 202 response (`gateway.ts` pushes it),
- a chat `proposal` event (`modules/chat/NightEyes.tsx`),
- `GET pending-proposals/` on project open, and again after every chat turn
  (`modules/chat/syncPendingProposals.ts`), so a refresh never loses one.

Screens that show proposals:

- **The bell** (`modules/notification/NotificationBell.tsx`): every pending proposal, as a
  card with Accept / Dismiss. Always there, on any page. Newest first, and each card says
  how long ago it was suggested ("today", "2 days ago", "3 weeks ago"), from the row's
  `created_at`. Old proposals are never dismissed for age; they sink to the bottom. The
  badge counts only proposals from the last 7 days (`modules/proposal/age.ts`).
- **Page cards**: the World page, the character studio and thread suggestions show cards
  for their own page, read from the same store.
- **Green inline values**: some reads merge the pending value into the data itself, so the
  page shows it in place in green. The character studio and project details (World page)
  do this per field; thread beats do it per beat (`beat.proposal`). These are parallel to
  the store, so pages refetch when a proposal appears or clears
  (e.g. `modules/threadList/useBeatProposalRefetch.ts`).

Chat shows only a one-line note ("✦ Proposal ready — review in your bell"); the card is in
the bell. There is no floating proposal toast any more.

## Accepting

Accept is a normal op call: `POST op/accept_proposal/` with `{proposal_id, force?}`.
No streaming. The reply is 200 plus an `X-Invalidates` header, which tells the frontend
which cached data to reload.

1. `accept_proposal` (in the kernel, `actions/capabilities/register/_proposals.py`) looks
   up the capability that made the proposal and runs its own accept capability (the
   `accept=` field on the PROPOSE capability, declared in that story app).
2. Every one of those accepts is wrapped in `guarded_accept`. A test fails if one is not.
   The guard runs under the project's write lock:
   - the row is re-read and must still be `PROPOSED`, else **409 `proposal_not_pending`**
     (stops a double click from writing twice, or an accept after a dismiss);
   - unless `force` is set, each field it overwrites must still hold its base stamp, else
     **409 `proposal_stale`** with `{field, was, current, proposed}` per field. Nothing is
     written.
3. The write runs. The row becomes `APPLIED`. If the write fails, nothing is written and
   the row stays `PROPOSED`, so the author can try again or dismiss it. The error says what
   went wrong (the accept's own message, or a plain fallback sentence).

Accepting can also close "siblings": other pending proposals for the same target (the
same world entry or beat), so an old value does not come back on the next read.

**Per-field accepts.** Character edits and project-detail edits are one proposal with
many fields. The studio accepts them one at a time with `accept_character_field` /
`accept_project_meta_field` (and `reject_…_field`). Each checks only its own field
against the stamp, takes `force` too, and the proposal closes when no field is left.
The author can also edit the green value first (`update_proposed_field`,
`update_proposed_meta_field`); it stays pending.

## What the frontend does with the answer

`callOp` in `gateway.ts` handles every accept / reject, from any screen:

- **Success:** removes the card from the store and, when a rule exists for that kind, shows a receipt
  ("✦ what → where", rules in `modules/receipt/rules.ts`).
- **409 `proposal_not_pending`:** removes the card (someone already closed it).
- **409 `proposal_stale`:** keeps the card and puts the conflicts on it. The card shows
  "You changed this after the AI suggested it" with both values:
  **Use AI's** (accept again with `force: true`) or **Keep mine** (dismiss).

Cards get their buttons from `makeProposalHandlers` (`modules/proposal/proposalHandlers.ts`),
which adds an error + Retry state when a call fails for another reason.

## Rules when you add a proposal kind

- Register the PROPOSE capability in your story app's `capabilities/`, with `accept=`
  and a `stamp=` from `actions/capabilities/stamps.py` (`additive` if it only adds).
  `manage.py check` fails at startup if an accept has no stamp (`actions/checks.py`).
- Wrap its accept commit in `guarded_accept`.
- Accept and dismiss through `callOp` (or `makeProposalHandlers`), never by your own
  fetch, so the card settles everywhere.
- Don't keep a second list of pending proposals on the client: read `useProposalStore`.
