"""The capability contract must not change by accident.

Every registered capability's public shape (what the frontend and Night Eyes
call) is pinned in `contract_snapshot.json`. Moving code between apps must
leave this test green. If you changed the contract on purpose, regenerate:

    UPDATE_CONTRACT_SNAPSHOT=1 uv run python manage.py test actions.tests.test_contract_snapshot
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from django.test import SimpleTestCase

from actions.capabilities import registry

SNAPSHOT = Path(__file__).with_name("contract_snapshot.json")


def build_contract() -> list[dict]:
    return sorted(
        (
            {
                "name": c.name,
                "route": c.route.value,
                "actors": sorted(a.value for a in c.actors),
                "args": dict(sorted(c.args.items())),
                "tool_name": c.tool_name,
                "chat_exposure": c.chat_exposure,
                "stub": c.stub,
            }
            for c in registry.all_capabilities()
        ),
        key=lambda d: d["name"],
    )


def render(contract: list[dict]) -> str:
    return json.dumps(contract, indent=2, sort_keys=True) + "\n"


class ContractSnapshotTests(SimpleTestCase):
    def test_contract_matches_snapshot(self):
        current = render(build_contract())
        if os.environ.get("UPDATE_CONTRACT_SNAPSHOT") == "1":
            SNAPSHOT.write_text(current)
        self.assertEqual(
            current, SNAPSHOT.read_text(),
            "Capability contract changed. If on purpose, rerun with "
            "UPDATE_CONTRACT_SNAPSHOT=1 and commit contract_snapshot.json.",
        )
