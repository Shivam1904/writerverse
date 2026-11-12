# Contributing to WriterVerse

Thank you for helping. WriterVerse is a **story integrity engine** for fiction authors: it turns scattered ideas, characters, world rules and plot notes into one Story Bible and outline with no contradictions. It is not a prose generator.

This page explains how to set up, pick something to work on, and send a change.

## The one product rule

**AI removes friction the author hates. It never takes a creative decision the author should own.**

Example: finding that a character's eye colour changes between chapter 2 and chapter 9 is a good AI job. Deciding what the character wants, or writing their scenes for them, is not. If your change adds AI behaviour, say in the PR which side of this line it is on.

## Set up

1. Follow **How to run** in the [README](README.md). In short: `make install`, then `make local` (Docker Postgres + Django + Vite).
2. Before you send a PR, run the full offline check:

   ```
   scripts/verify.sh
   ```

   It runs ruff, the import-layer check, eslint, the backend and frontend tests, the typecheck and the docs check. It is the same as CI. It never calls a paid AI model.
3. Optional: `make hooks` turns on the repo's git hooks (a commit-message check and a fast pre-push check).

The docs start at [`docs/README.md`](docs/README.md). The code is the source of truth; the docs explain what the code can't.

## Pick something to work on

- Issues labelled **`good first issue`** are small and well described. Start there.
- Comment on the issue to say you are working on it, so two people don't do the same thing.
- For anything big (a new feature, a new dependency, a change to the data model), open an issue or a discussion first and agree on the plan. A big PR with no earlier talk may be closed.

## Send a change

1. **Fork** the repository and clone your fork.
2. Make a **branch** from `main`, e.g. `fix/editor-cursor-jump`.
3. Make your change. Keep it small and on one topic. Add or update tests.
4. If you change how an area works, update its page in `docs/` in the same PR.
5. Run `scripts/verify.sh`. Fix anything it reports.
6. Push to your fork and open a **pull request** against `main`. Fill in the template.
7. The first time, the CLA bot asks you to sign (see below).
8. A maintainer reviews. We **squash-merge**: all your commits become one commit on `main`, named after the PR title.

## Commit messages and PR titles

We use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.

```
fix(editor): keep the cursor in place after autosave
feat(ideas): let authors pin an idea to a scene
docs(night-eyes): explain how a scene is picked
```

- **type** is one of: `feat` (new feature), `fix` (bug fix), `refactor` (same behaviour, cleaner code), `docs`, `test`, `chore` (upkeep, dependencies), `ci`, `perf` (faster), `style` (formatting only).
- **scope** is optional. It names the area, in lowercase kebab-case: `editor`, `ideas`, `night-eyes`, `outline`, `gauges`, `characters`…
- **subject** starts with a lowercase letter, says what the change does, and has no full stop at the end. Keep the whole line to 72 characters or fewer.

The **PR title must follow this format**. A check on every PR enforces it, because the PR title becomes the commit message on `main`. The commits inside your PR can be looser, but the local `commit-msg` hook (`make hooks`) helps you keep them tidy too.

## Tests and paid AI

- Tests must run **offline and free**. Never call a real, paid AI API from a test. Use the fakes and fixtures the existing tests use.
- AI code asks for a model **role** (`small`, `draft`, `expert`), never a model name. Roles are set in `backend/ai_engine/config/providers.yml`.

## AI-assisted contributions

You are welcome to use AI coding tools. **You are responsible for everything you submit**: read it, understand it, test it, and make sure you have the right to contribute it. Please don't send large generated changes you have not checked yourself.

## Contributor License Agreement (CLA)

WriterVerse is licensed under the [GNU AGPL, version 3 or later](LICENSE). Before we can merge your first PR, you sign our [Contributor License Agreement](CLA.md). You keep the copyright in your work. You give the maintainers the right to use it, including under other licenses (for example a commercial one).

To sign, reply on your PR with the sentence the CLA bot asks for. You sign once; it covers your later PRs too.

## Behaviour and security

- Everyone in this project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Found a security problem? Don't open an issue. Follow [SECURITY.md](SECURITY.md).
