"""One timestamp format for the whole backend.

Stamps are ISO 8601 text, always UTC, always with microseconds:
`2026-09-05T18:27:16.445447+00:00`. One fixed format means two stamps can be
compared as plain strings (the gauges' staleness check does `edited_at >
analysed_at`), and microseconds keep two edits in the same second in order.
Pure: no Django, no WriterVerse app imports.
"""
from __future__ import annotations

from datetime import UTC, datetime


def iso(dt: datetime | None) -> str | None:
    """`dt` as stamp text (converted to UTC). None stays None. A naive datetime
    is taken to be UTC already."""
    if dt is None:
        return None
    dt = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
    return dt.isoformat(timespec="microseconds")


def now_iso() -> str:
    """The current time as stamp text."""
    return iso(datetime.now(UTC))


def parse_iso(value, *, exact: bool = False) -> datetime | None:
    """Stamp text → an aware UTC datetime, or None if it is not ISO text.

    Accepts older stamps too: with or without microseconds, with an offset, a
    `Z`, or no zone at all (then read as UTC). With `exact=True` it returns
    None unless `value` is already in the one stamp format (so a caller that
    must give the text back unchanged keeps the raw text instead)."""
    if isinstance(value, datetime) and not exact:
        dt = value
    elif not isinstance(value, str) or not value:
        return None
    else:
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return None
    dt = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
    if exact and iso(dt) != value:
        return None
    return dt
