"""Startup contract checks for the capability registry (`manage.py check`).

Runs after every app's `capabilities` module is imported (see apps.py), so the
registry is complete. Three rules:

  - actions.E001  staleness.yml names a capability that isn't registered.
  - actions.E002  a PROPOSE capability with an `accept` has no `stamp`
                  (Accept could not detect that the author changed the target).
  - actions.W001  a WRITE/PROPOSE capability maps to no staleness domain, so
                  other open tabs won't refetch after it runs.

W001 has a baseline (`KNOWN_NO_STALENESS`): capabilities that today map to no
domain. Some are fine on purpose (accept/reject raise their nested accept's
domains; scene pipelines and proposal-making tools change nothing the pages
read directly), others may be real gaps. Remove a name once it is mapped; never
add a new one without a reason.
"""
from __future__ import annotations

from django.core.checks import Error, Warning

KNOWN_NO_STALENESS = frozenset({
    # WRITE
    "accept_proposal", "reject_proposal", "update_proposed_outline_beat",
    "restore_scene_revision", "link_scene_entity", "unlink_scene_entity",
    "add_thread_beat", "update_thread_beat", "reorder_thread_beats",
    "analyze_scene", "analyze_scene__summary", "analyze_scene__resolve_nouns",
    "analyze_scene__pov_purity", "analyze_scene__hook_grade",
    "analyze_scene__subtext", "analyze_scene__voice",
    "analyze_scene__scene_properties",
    # PROPOSE
    "run_init_elements", "enrich_promoted_character", "draft_world_entity",
    "propose_character_edit", "propose_insert_beat", "propose_update_beat",
    "generate_thread_from_description",
})


def check_capability_contract(app_configs=None, **kwargs):
    from actions.awareness import staleness
    from actions.capabilities import registry
    from actions.capabilities.spec import Route

    issues = []
    caps = registry.all_capabilities()
    names = {c.name for c in caps}
    cfg = staleness._load()

    for name in sorted({*cfg["mutated_by"], *cfg["read_by"]} - names):
        issues.append(Error(
            f"staleness.yml names capability '{name}', which is not registered.",
            hint="Fix the name in actions/config/staleness.yml or remove it.",
            id="actions.E001",
        ))

    for c in sorted(caps, key=lambda c: c.name):
        if c.route is Route.PROPOSE and c.accept and c.stamp is None:
            issues.append(Error(
                f"Capability '{c.name}' has accept='{c.accept}' but no stamp.",
                hint="Give it a stamp (see actions/capabilities/stamps.py).",
                id="actions.E002",
            ))
        if (c.route in (Route.WRITE, Route.PROPOSE)
                and not staleness.invalidates_for(c.name)
                and c.name not in KNOWN_NO_STALENESS):
            issues.append(Warning(
                f"{c.route.name} capability '{c.name}' maps to no staleness domain.",
                hint="Add it to a domain's mutated_by in actions/config/staleness.yml.",
                id="actions.W001",
            ))
    return issues
