"""Portrait image files: save, find and delete them in file storage.

Storage is Django's `default_storage`: local disk in dev, Cloudflare R2 in prod
(see `config/storage.py`). The row only keeps the public URL
(`Character.portrait_url`); the file key is read back out of that URL.

Key layout: `character_portraits/<project id>/<character id>-<random>.png`.
Only ids and a random uuid, no names (no personal data in the key), and the
random part makes the URL impossible to guess.
"""
from __future__ import annotations

import logging
import uuid
from urllib.parse import unquote, urlparse

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger("writerverse.characters")

PREFIX = "character_portraits/"


def portrait_key(project_id, character_id) -> str:
    return f"{PREFIX}{project_id}/{character_id}-{uuid.uuid4().hex}.png"


def save_portrait(project_id, character_id, png: bytes) -> str:
    """Store the PNG and return its public URL. Raises if storage fails."""
    saved = default_storage.save(portrait_key(project_id, character_id), ContentFile(png))
    return default_storage.url(saved)


def key_from_url(url: str) -> str | None:
    """The storage key inside a portrait URL, or None if it isn't one of ours."""
    path = unquote(urlparse(url or "").path)
    at = path.find(PREFIX)
    if at < 0:
        return None
    key = path[at:]
    if ".." in key.split("/"):
        return None
    return key


def delete_portrait(url: str) -> None:
    """Remove a portrait file. Best effort: a storage error is logged, never raised."""
    key = key_from_url(url)
    if key is None:
        return
    try:
        default_storage.delete(key)
    except Exception:  # noqa: BLE001 — a leftover file must never fail the caller
        logger.exception("portrait file delete failed key=%s", key)
