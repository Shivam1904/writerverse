# Product overview

> Covers: `frontend/index.html`, `frontend/src/app/nav.ts`, `frontend/src/components/SignupPage.tsx`, `frontend/src/components/LoginPage.tsx`

## In one line

**WriterVerse is the story integrity engine for fiction authors. From chaos to story.** (the app's own description, `frontend/index.html`)

It takes an author's scattered ideas, characters, world rules and plot notes and turns them into a coherent **Story Bible** and **Outline**, then helps keep everything consistent as the draft grows. The pitch isn't "AI writes your novel". It's **"AI keeps your novel consistent while you write it."**

What authors read when they sign up or log in:

- *"Build stories with memory and structure."*
- *"Plan beats, track world rules, and draft scenes with AI that understands your narrative context."*
- *"Consistency-aware drafting for fiction writers."*

## What an author can do: three modes

Inside a project, the sidebar groups the work into three modes (`nav.ts`):

| Mode | Sections (as the author sees them) | What happens there |
| --- | --- | --- |
| **Imagine** | Ideas · Characters · World | Dump raw ideas; build up the cast and the world's places, things and rules |
| **Plan** | Threads · Outline · Lenses | Plot threads made of beats; the act → chapter → scene outline; analysis "lenses" that check the story |
| **Write** | Manuscript · Preview | Write scene prose; read the book as a reader would |

**Night Eyes**, the AI assistant, is available on every page. It reads the project and can answer questions, make small edits directly, or suggest bigger changes for the author to accept.

A brand-new project opens on **Ideas**. Once the project has plot threads, an outline or chapters, it opens on the furthest one along.

## Who it's for

**Not decided yet.** The target authors, and the words we use for them, need proper research first. Until then, don't design features around a specific kind of author.

What the app does today: a brand-new project starts on **Ideas** (dump raw notes first), and there's no way to import an existing draft.

## Principles (working, open to change)

The code is built this way today. These may change once the audience research is done.

- **AI removes friction, not creativity.** Build a feature only if it removes work the author hates, never if it takes a creative decision the author should own.
- **Small edits happen directly; big changes are proposals.** The AI may fix a field or add an entry right away. Generating, restructuring and prose changes come back as a proposal the author accepts or rejects.
- **Built for series size.** One project may one day hold a whole book series with 1M+ words. So the app never loads a whole project into the AI at once; it loads a small map, or searches for the relevant pieces.

## What it is not

- **Not a prose generator or ghostwriter.** Prose help exists but is secondary.
- **Not a general text editor.** It's built around the bible → outline → prose model.

## Gaps an author would notice today

- **No import:** you can't bring in an existing manuscript.
- **No export:** you can't get the manuscript out as a file.
- **One book per project:** each project has a single outline, so a series isn't split into separate books yet.
