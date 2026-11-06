#!/usr/bin/env python3
"""Docs upkeep checks. Warn-only by default (exit 0); --strict exits 1 on warnings.

Checks every docs page (docs/**/*.md, generated docs/reference/ excluded) and
every CLAUDE.md for:
  1. behind   - code a page covers changed after the page was last committed.
                The page lists what it covers in a line like:  > Covers: `backend/`, `a/b.py`
                Folder covers (ending in /) count only commits that add, delete
                or rename files; file covers count any commit.
  2. paths    - a `backticked/path` or ./relative link that points nowhere.
  3. size     - docs page > 150 lines, root CLAUDE.md > 80, folder CLAUDE.md > 30.
  4. index    - a docs page not listed in docs/README.md.

Silence one path on a page:   <!-- docs-check: ignore some/path/ -->
Mark a page as re-checked:    python3 scripts/docs_check.py --ack docs/system/map.md
  (writes a marker file docs/.acks/<page>/<sha>; commit that file. The page itself is
  not edited, so two PRs that ack the same page never conflict: each adds its own file.)

Usage: python3 scripts/docs_check.py [--strict] [--ack PAGE ...]
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIMITS = {"page": 150, "root_claude": 80, "folder_claude": 30}
FILE_EXT = (".py", ".ts", ".tsx", ".js", ".mjs", ".md", ".yml", ".yaml", ".json",
            ".toml", ".sh", ".css", ".html", ".lock")
ROOT_FILES = {"Makefile", "CLAUDE.md", "README.md", "pyproject.toml", "uv.lock",
              "docker-compose.yml"}


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def known_paths() -> tuple[set[str], set[str]]:
    files = set(git("ls-files", "--cached", "--others", "--exclude-standard").splitlines())
    dirs = {str(Path(f).parent) + "/" for f in files}
    dirs |= {"/".join(p.split("/")[:i]) + "/" for p in dirs for i in range(1, p.count("/"))}
    return files, dirs


def resolves(token: str, files: set[str], dirs: set[str], page_dir: Path) -> bool:
    t = token.removeprefix("./")
    # on disk (also catches git-ignored folders like archive/ or db/logs/)
    for base in (page_dir, ROOT, ROOT / "backend", ROOT / "frontend" / "src"):
        if (base / t).exists():
            return True
    if t.endswith("/"):
        return t in dirs or any(d.endswith("/" + t) for d in dirs)
    return t in files or any(f.endswith("/" + t) for f in files)


def looks_like_path(tok: str) -> bool:
    if any(c in tok for c in "<>*{} …=()") or tok.startswith(("/", "http")) or "://" in tok:
        return False
    if tok.startswith("-") or tok.startswith("."):
        return tok.startswith((".github", "./", "../"))
    return tok in ROOT_FILES or ("/" in tok and (tok.endswith("/") or tok.endswith(FILE_EXT)))


def pages() -> list[Path]:
    docs = [p for p in (ROOT / "docs").rglob("*.md") if "reference" not in p.relative_to(ROOT / "docs").parts]
    claudes = [ROOT / f for f in git("ls-files", "--cached", "--others", "--exclude-standard",
                                       "*CLAUDE.md", "CLAUDE.md").splitlines()]
    return sorted(set(docs + claudes))


def covers(text: str) -> list[str]:
    for line in text.splitlines():
        if line.lstrip("> ").startswith("Covers:"):
            return re.findall(r"`([^`]+)`", line)
    return []


def ack_dir(page: str) -> Path:
    slug = page.removesuffix(".md").replace("/", "__")
    return ROOT / "docs" / ".acks" / slug


def behind(page: str, cover_list: list[str]) -> list[str]:
    # A page counts as current as of its last commit OR its last ack marker.
    base = git("log", "-1", "--format=%H", "--", page, str(ack_dir(page).relative_to(ROOT)))
    if not base:  # page never committed yet
        return []
    out = []
    for c in cover_list:
        if c.endswith("/"):
            n = len(set(git("log", "--format=%H", "--diff-filter=ADR", f"{base}..HEAD", "--", c).split()))
            kind = "commits added/removed/renamed files"
        else:
            n = int(git("rev-list", "--count", f"{base}..HEAD", "--", c) or 0)
            kind = "commits"
        if n:
            out.append(f"{c}: {n} {kind} since this page was last updated")
    return out


def check() -> list[str]:
    files, dirs = known_paths()
    index = (ROOT / "docs/README.md").read_text() if (ROOT / "docs/README.md").exists() else ""
    warnings = []
    for p in pages():
        rel = str(p.relative_to(ROOT))
        text = p.read_text()
        lines = text.count("\n") + 1
        ignored = set(re.findall(r"<!-- docs-check: ignore (\S+) -->", text))
        is_claude = p.name == "CLAUDE.md"
        limit = (LIMITS["root_claude"] if rel == "CLAUDE.md" else LIMITS["folder_claude"]) if is_claude else LIMITS["page"]
        if lines > limit:
            warnings.append(f"[size]   {rel}: {lines} lines (limit {limit})")
        if rel.startswith("docs/") and rel != "docs/README.md":
            if rel.removeprefix("docs/") not in index:
                warnings.append(f"[index]  {rel}: not listed in docs/README.md")
        tokens = set(re.findall(r"`([^`\n]+)`", text)) | set(re.findall(r"\]\((\.{1,2}/[^)#\s]+)", text))
        for tok in sorted(tokens):
            if tok in ignored or not looks_like_path(tok):
                continue
            if not resolves(tok, files, dirs, p.parent):
                warnings.append(f"[paths]  {rel}: `{tok}` not found")
        for msg in behind(rel, covers(text)):
            warnings.append(f"[behind] {rel}: {msg}")
    return warnings


def ack(page_args: list[str]) -> None:
    head = git("rev-parse", "--short", "HEAD")
    for a in page_args:
        rel = str(Path(a).resolve().relative_to(ROOT))
        d = ack_dir(rel)
        d.mkdir(parents=True, exist_ok=True)
        for old in d.iterdir():  # keep one marker per page
            old.unlink()
        (d / head).write_text("")
        print(f"acked {rel} at {head} - commit docs/.acks/ to reset its 'behind' count")


def changed_files() -> tuple[set[str], set[str]]:
    """Files changed but not pushed yet: uncommitted + commits ahead of upstream.
    Returns (all changed, structurally changed = added/deleted/renamed)."""
    changed, structural = set(), set()
    for line in git("status", "--porcelain", "--untracked-files=all").splitlines():
        code, path = line[:2], line[3:].split(" -> ")[-1]
        changed.add(path)
        if any(c in code for c in "AD?R"):
            structural.add(path)
    upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    if upstream:
        changed |= set(git("diff", "--name-only", f"{upstream}...HEAD").splitlines())
        structural |= set(git("diff", "--name-only", "--diff-filter=ADR", f"{upstream}...HEAD").splitlines())
    return changed, structural


def hook() -> int:
    """Claude Code Stop hook: nag only about docs touched by this work. Exit 2 = show to Claude."""
    import json
    try:
        if json.load(sys.stdin).get("stop_hook_active"):
            return 0  # already nagged once this turn; don't loop
    except (ValueError, OSError):
        pass
    changed, structural = changed_files()
    if not changed:
        return 0
    notes = []
    for p in pages():
        rel = str(p.relative_to(ROOT))
        if rel in changed:
            continue  # page was already updated alongside the code
        acks = str(ack_dir(rel).relative_to(ROOT)) + "/"
        if any(f.startswith(acks) for f in changed):
            continue  # page was acked as still correct alongside the code
        for c in covers(p.read_text()):
            pool = structural if c.endswith("/") else changed
            hits = sorted(f for f in pool if f == c or (c.endswith("/") and f.startswith(c)))
            if hits:
                notes.append(f"[behind] {rel} covers `{c}`, which you changed ({', '.join(hits[:3])}"
                             f"{'…' if len(hits) > 3 else ''}). Update the page, or if it's still "
                             f"correct run: python3 scripts/docs_check.py --ack {rel}")
    notes += [w for w in check() if not w.startswith("[behind]") and w.split(": ")[0].split()[-1] in changed]
    if not notes:
        return 0
    print("Docs check — your changes may have made these docs stale:\n" + "\n".join(notes), file=sys.stderr)
    return 2


def main() -> int:
    args = sys.argv[1:]
    if "--hook" in args:
        return hook()
    if "--ack" in args:
        ack([a for a in args if a != "--ack"])
        return 0
    warnings = check()
    if not warnings:
        print("docs-check: all clear")
        return 0
    print(f"docs-check: {len(warnings)} warning(s)")
    print("\n".join(warnings))
    return 1 if "--strict" in args else 0


if __name__ == "__main__":
    sys.exit(main())
