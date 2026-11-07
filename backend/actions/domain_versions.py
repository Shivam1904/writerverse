""""What changed when" for a project, one timestamp per domain.

A domain is a part of the story the AI reads, like "outline" or "characters"
(the list is in `actions/config/staleness.yml`). Every WRITE dispatch that
changes a domain calls `bump()`; READ dispatches call `version_of()` to stamp
the result. Night Eyes compares the two to warn the chat that something it
read earlier has since changed, and the live-update stream
(`actions/staleness_stream.py`) polls these rows to tell other open tabs.

Versions are ISO-8601 strings (e.g. "2026-09-05T18:27:16.445447+00:00").
Comparisons are plain string equality, so always build them with
`common.timeutil.iso()`.
"""
from __future__ import annotations

from datetime import UTC, datetime

from common.timeutil import iso

from actions.models import ProjectDomainVersion


def bump(project_id: int, domains: list[str]) -> str:
    """Set every domain in `domains` to "changed now". Returns the new version."""
    now = datetime.now(UTC)
    for domain in domains:
        ProjectDomainVersion.objects.update_or_create(
            project_id=project_id, domain=domain,
            defaults={"changed_at": now},
        )
    return iso(now)


def version_of(project_id: int, domain: str) -> str:
    """The domain's current version, or "" if it never changed."""
    dt = (
        ProjectDomainVersion.objects
        .filter(project_id=project_id, domain=domain)
        .values_list("changed_at", flat=True)
        .first()
    )
    return iso(dt) if dt else ""


def versions_for(project_id: int) -> dict[str, str]:
    """All of the project's domain versions: {domain: iso_string}."""
    return {
        domain: iso(dt)
        for domain, dt in ProjectDomainVersion.objects
        .filter(project_id=project_id)
        .values_list("domain", "changed_at")
    }


# Not a story domain (it is not in staleness.yml, so Night Eyes never reads it
# and never warns about it). Settling AI usage (`usage/services.py`) bumps it so
# other open tabs refresh usage views via the live-update stream.
AI_USAGE_DOMAIN = "ai_usage"


def bump_ai_usage(project_id: int) -> str:
    """Record "AI usage was settled now" for this project."""
    return bump(project_id, [AI_USAGE_DOMAIN])
