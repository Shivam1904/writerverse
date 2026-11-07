"""SA-202 — the frontend's proposal surfaces match the backend's PROPOSE routes.

Only Route.PROPOSE capabilities create Proposal rows, so the frontend map
`PROPOSAL_SURFACES` (how a pending proposal reads on the rail card and in its
accept receipt) must only list those. It used to carry 11 dead keys for
capabilities that were unregistered or Route.WRITE.
"""
import re
from pathlib import Path
from unittest import skipUnless

from django.test import SimpleTestCase

from actions.capabilities import Route, registry

REGISTRY_TS = (Path(__file__).resolve().parents[3]
               / "frontend/src/app/modules/proposal/registry.ts")

# PROPOSE capabilities that have no surface entry yet, so their rail card falls
# back to the raw capability name. Keep this empty; a name here is a known gap
# to close, and must come out once it gets an entry.
NO_SURFACE_YET: set[str] = set()


def frontend_surface_keys() -> set[str]:
    src = REGISTRY_TS.read_text()
    m = re.search(r"PROPOSAL_SURFACES[^=]*=\s*\{(.*)\n\};", src, re.S)
    assert m, "PROPOSAL_SURFACES not found in registry.ts"
    return set(re.findall(r"^  ([a-z_]+): \{", m.group(1), re.M))


def propose_capabilities() -> set[str]:
    return {c.name for c in registry.all_capabilities() if c.route is Route.PROPOSE}


@skipUnless(REGISTRY_TS.exists(), 'frontend source not present (backend-only checkout)')
class ProposalSurfacesTests(SimpleTestCase):
    def test_every_surface_is_a_propose_capability(self):
        keys = frontend_surface_keys()
        self.assertTrue(keys)
        self.assertEqual(sorted(keys - propose_capabilities()), [])

    def test_every_propose_capability_has_a_surface(self):
        missing = propose_capabilities() - frontend_surface_keys()
        self.assertEqual(sorted(missing - NO_SURFACE_YET), [])
        # Keep the waiver list honest: nothing in it may already have an entry.
        self.assertEqual(sorted(NO_SURFACE_YET - missing), [])
