#!/usr/bin/env python3
"""Print every WriterVerse table: app, model, its links (FK / 1:1) and JSON fields.

Read from Django's own model registry, so it is always current. Needs no
database connection (but does read backend/.env like any Django command).

Usage (from the repo root):  cd backend && uv run python ../scripts/models_map.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
SKIP = {"admin", "auth", "contenttypes", "sessions", "token_blacklist", "silk", "axes"}


def main() -> None:
    sys.path.insert(0, str(BACKEND))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    django.setup()
    from django.apps import apps

    current = None
    for m in sorted(apps.get_models(), key=lambda m: (m._meta.app_label, m.__name__)):
        app = m._meta.app_label
        if app in SKIP:
            continue
        if app != current:
            print(f"\n{app}/")
            current = app
        links = [
            f"{f.name}→{f.related_model.__name__}{' (1:1)' if f.one_to_one else ''}"
            for f in m._meta.concrete_fields
            if f.is_relation
        ]
        js = [f.name for f in m._meta.concrete_fields if f.get_internal_type() == "JSONField"]
        line = f"  {m.__name__}"
        if links:
            line += "  links: " + ", ".join(links)
        if js:
            line += "  json: " + ", ".join(js)
        print(line)
    print(f"\nSkipped framework/vendor apps: {', '.join(sorted(SKIP))}")


if __name__ == "__main__":
    main()
