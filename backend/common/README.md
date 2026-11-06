# common

Shared utilities — error handling, XSS sanitization, persistence audit logging, and small pure helpers (ids, timestamps, TipTap text). `common` is the bottom layer: it imports no other WriterVerse app.

## Role in the System

Common is a utility app with no models of its own (its only table is the rate-limit cache). It holds small pure helpers that used to be copied across apps, plus a few cross-cutting concerns: error responses with correlation IDs, HTML sanitization to prevent XSS, shared rate limits, and a DEBUG-gated persistence audit log. Add a helper here only if it needs no other WriterVerse app.

## How It Connects

- Imported by every app that handles user-facing errors, content fields, or data persistence.
- `errors.py` provides the custom DRF exception handler wired into `settings.py`.
- `html_sanitizer.py` is called by serializers during validation to clean content fields.
- `persistence_audit.py` writes to `db/logs/persistence.log` for debugging data persistence issues.

## Key Patterns

- **Correlation IDs**: Every user-facing failure carries a short `correlation_id`. The server logs the full traceback; the user sees only a sanitized message. This makes debugging production issues possible without exposing internals.
- **Sanitization**: `sanitize_content_field()` accepts a field type (`rich_text`, `plain_text`, `markdown`) and applies appropriate cleaning via `bleach`.
- **Persistence audit**: Gated behind `DEBUG=True` or `PERSISTENCE_AUDIT=1`. Records field name, length, sha256 hash, and a ~40-char preview (never full prose). Daily-rotated, ~2 day retention.

## Source Map

| File | Purpose |
|------|---------|
| [errors.py](errors.py) | `report_exception()`, `error_response()`, `sse_error_data()`, `custom_exception_handler()` |
| [html_sanitizer.py](html_sanitizer.py) | `HTMLSanitizer` class, `sanitize_content_field()` |
| [persistence_audit.py](persistence_audit.py) | `audit_write()`, `audit_empty_read()` |
| [throttling.py](throttling.py) | `SharedScopedRateThrottle`: rate-limit counts kept in a Postgres cache table, so they hold across server processes |
| [ids.py](ids.py) | `new_id(prefix)`: `sc-1a2b3c4d`-style ids, with optional retry while an id is taken |
| [timeutil.py](timeutil.py) | `now_iso()`, `iso(dt)`, `parse_iso(s)`: the one stamp format (UTC, microseconds), so stamps compare as strings |
| [tiptap.py](tiptap.py) | `node_text`, `word_count`, `node_refs`, `iter_mentions` for TipTap prose docs (marks don't split words; blocks do) |
