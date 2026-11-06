"""DEBUG-gated persistence breadcrumb log (Observability part 3).

Answers "did it actually save?" from a log file instead of a code spelunk —
the PA-P0-1 class of bug, where the author's story *was* persisted server-side
but nothing said so.

Privacy: this never writes user prose to disk. Per field it records the
name, length, a ~40-char preview and a short content hash — enough to prove
"synopsis written with 512 chars (hash ab12cd34) at T1; read back 0 chars at
T2" without mirroring the manuscript.

Off unless DEBUG (or PERSISTENCE_AUDIT=1). A hard no-op in production.
Retention: rotates daily, keeps ~2 days — it is a debugging breadcrumb, not
an audit trail; do not rely on it for older history.
Complements — does not replace — the AI/Postgres startup check (P0-1).
"""

import hashlib
import logging
import logging.handlers
import os

from django.conf import settings

_PREVIEW_CHARS = 40
_logger = logging.getLogger("writerverse.persistence")
_configured = False


def _enabled() -> bool:
    if os.environ.get("PERSISTENCE_AUDIT") == "1":
        return True
    return bool(getattr(settings, "DEBUG", False))


def _ensure_handler() -> None:
    """Attach a file handler lazily, only when enabled, so production (DEBUG
    off, often read-only FS) never opens the file."""
    global _configured
    if _configured:
        return
    _configured = True
    # Sit beside the existing django.log so the gitignored *.log / logs/
    # rules already cover it — no .gitignore change needed.
    log_dir = os.path.join(settings.BASE_DIR.parent, "db", "logs")
    try:
        os.makedirs(log_dir, exist_ok=True)
        # Rotate at midnight, keep 2 days of backups: this is a short-lived
        # debugging breadcrumb, not an audit trail — nothing older than ~2
        # days should linger on disk.
        handler = logging.handlers.TimedRotatingFileHandler(
            os.path.join(log_dir, "persistence.log"),
            when="midnight",
            interval=1,
            backupCount=2,
        )
        handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
        _logger.addHandler(handler)
        _logger.setLevel(logging.INFO)
        _logger.propagate = False
    except OSError:
        # Read-only FS or similar — degrade silently; this is a dev aid.
        pass


def _describe(value, *, with_preview: bool = True) -> str:
    text = "" if value is None else str(value)
    digest = hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()[:8]
    line = f"len={len(text)} hash={digest}"
    if with_preview:
        line += f" preview={text[:_PREVIEW_CHARS].replace(chr(10), ' ')!r}"
    return line


def audit_write(
    operation: str, *, project_id=None, correlation_id=None, with_preview: bool = True, **fields,
) -> None:
    """Record a persistence write: which fields, how big, content fingerprint.
    Pass with_preview=False for manuscript prose: length + hash only, no text."""
    if not _enabled():
        return
    _ensure_handler()
    parts = " ".join(
        f"{name}({_describe(val, with_preview=with_preview)})" for name, val in fields.items()
    )
    _logger.info(
        "WRITE op=%s project=%s cid=%s %s",
        operation, project_id, correlation_id, parts,
    )


def audit_empty_read(operation: str, field: str, *, project_id=None, correlation_id=None) -> None:
    """Record that a field expected to be populated read back empty — the
    exact asymmetry PA-P0-1 was (server had it; the UI read nothing)."""
    if not _enabled():
        return
    _ensure_handler()
    _logger.info(
        "EMPTY_READ op=%s project=%s cid=%s field=%s",
        operation, project_id, correlation_id, field,
    )
