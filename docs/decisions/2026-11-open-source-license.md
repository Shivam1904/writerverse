# Decision: open source under the AGPL, with a CLA

> Covers: `LICENSE`, `NOTICE`, `CLA.md`, `.github/workflows/cla.yml`, `.github/workflows/pr-title.yml`

**Date:** November 2026. **Status:** in force since the first public commit (November 2026).

## What we decided

1. **License: GNU AGPL, version 3 or later** (`AGPL-3.0-or-later`). Full text in `LICENSE`, short notice in `NOTICE`. The `license` field in `pyproject.toml` and `frontend/package.json` says the same. `frontend/package.json` stays `"private": true`, so it can never be published to npm by mistake.
2. **Copyright holders:** "The WriterVerse maintainers" (Shivam Srivastava and Aakarshika Priydarshi).
3. **Every outside contributor signs a CLA** (`CLA.md`, adapted from the Apache individual CLA). They keep their copyright and give the maintainers a broad license, including the right to relicense. A bot checks each PR (`.github/workflows/cla.yml`).
4. **Commercial licenses on request.** Because of the CLA, the maintainers own or may relicense all the code, so they can sell a non-AGPL license to a company that can't accept the AGPL.
5. **One commit format:** Conventional Commits (`type(scope): subject`). The PR title is checked (`.github/workflows/pr-title.yml`) because squash-merge makes it the commit on `main`. A local `commit-msg` hook (`make hooks`) checks commits too. Rules for contributors: `CONTRIBUTING.md`.

## Why

- **AGPL, not MIT or Apache.** WriterVerse is a hosted web app. Under a permissive license (MIT) or the plain GPL, a company could run a changed copy as a paid service and never share its changes. The AGPL's network clause (section 13) says: if you let people use a changed version over a network, you must offer them its source. That protects the project from a closed fork while keeping it truly open.
- **"Or later"** lets the project move to a future AGPL version (for example to fix a legal gap) without asking every contributor again. With the CLA this matters less, but it is the common default and costs nothing.
- **Why a CLA.** Without one, each contributor owns their part under the AGPL only, and the maintainers could never offer a commercial license or change the license. The CLA keeps that option open: this is the "open core / dual license" model used by projects like Qt and MongoDB (before its license change).
- **Cost of the CLA:** some people won't sign one. We accept that; the text is short and plain to keep the cost low.

## Where the code lives

This repository is the home of the code: all changes, by maintainers and contributors, arrive as pull requests here, and new work is tracked in GitHub Issues. Development before the first public commit happened privately; that history is not published. The maintainers keep business notes and the production deploy jobs (which hold production secrets) outside this repository.

## Set up once on GitHub (public repository)

- Create the `cla-signatures` branch (from `main`) before the first outside PR. The bot stores signatures there in a `cla.json` file.
- Turn on **private vulnerability reporting** (Settings → Code security), **Discussions**, and **squash merge** only (with "default to PR title").
- Make the `CLA` and `PR title` checks required on `main`.
- Set up the `conduct@` and `security@` addresses used in `CODE_OF_CONDUCT.md` and `SECURITY.md`.
