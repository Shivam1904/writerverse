#!/usr/bin/env python3
"""
Generate a JSON snapshot of the GAUGES launch lens configs for the /dev/configs viewer.

Reads the authored launch set (spec/consistency/lenses/launch/*.yml) + the shared
vocab (config-samples/_shared.yml) and writes a single JSON the React page imports.
The frontend has no YAML parser, so this is the seam: re-run after editing any config.

    python3 frontend/scripts/gen-gauges-configs.py

Output: frontend/src/pages/devConfigs.generated.ts  (a TS module — always typechecks)
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required: uv sync (or run with the project venv).")

SCRIPT_DIR = Path(__file__).resolve().parent
REPO = SCRIPT_DIR.parent.parent
LAUNCH = REPO / "spec/consistency/lenses/launch"
EXTENDED = REPO / "spec/consistency/lenses/extended"
SHARED = REPO / "spec/consistency/lenses/config-samples/_shared.yml"
OUT = REPO / "frontend/src/pages/devConfigs.generated.ts"

# Display order for the type files (and the human label for each).
TYPE_ORDER = [
    ("arc", "Arcs", "arc.yml"),
    ("map", "Maps", "map.yml"),
    ("tracker", "Trackers", "tracker.yml"),
    ("checklist", "Checklists", "checklist.yml"),
    ("setup_payoff", "Setup → Payoff", "setup-payoff.yml"),
]


def load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f) or {}


def main() -> None:
    if not LAUNCH.exists():
        sys.exit(f"launch config dir not found: {LAUNCH}")

    shared = load_yaml(SHARED) if SHARED.exists() else {}

    types = []
    total_lenses = 0
    by_tier: dict[str, int] = {}
    by_pack: dict[str, int] = {}
    for type_id, type_label, fname in TYPE_ORDER:
        path = LAUNCH / fname
        if not path.exists():
            continue
        doc = load_yaml(path)
        archetype = doc.get("archetype", {})
        lenses = []
        # launch lenses (carry the type archetype)
        for ln in (doc.get("lenses") or []):
            lenses.append({**ln, "pack": "launch"})
        # extended pack — lenses-only files; archetype is inherited from launch
        ext_path = EXTENDED / fname
        if ext_path.exists():
            for ln in (load_yaml(ext_path).get("lenses") or []):
                lenses.append({**ln, "pack": "extended"})
        for ln in lenses:
            total_lenses += 1
            by_pack[ln["pack"]] = by_pack.get(ln["pack"], 0) + 1
            if ln["pack"] == "launch":
                t = ln.get("tier", "—")
                by_tier[t] = by_tier.get(t, 0) + 1
        types.append({
            "type_id": type_id,
            "type_label": type_label,
            "file": fname,
            "archetype": archetype,
            "lenses": lenses,
        })

    payload = {
        "generated_from": "spec/consistency/lenses/{launch,extended}/",
        "regen_cmd": "python3 frontend/scripts/gen-gauges-configs.py",
        "summary": {
            "total_lenses": total_lenses,
            "total_types": len(types),
            "by_pack": by_pack,
            "by_tier": by_tier,
        },
        "shared": shared,
        "types": types,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    ts = (
        "/* eslint-disable */\n"
        "// AUTO-GENERATED — do not edit by hand.\n"
        f"// Source: {payload['generated_from']}  ·  Regen: {payload['regen_cmd']}\n"
        "const GAUGES_CONFIGS: any = " + body + ";\n\n"
        "export default GAUGES_CONFIGS;\n"
    )
    with open(OUT, "w") as f:
        f.write(ts)
    print(f"wrote {OUT.relative_to(REPO)} — {total_lenses} lenses across {len(types)} types")


if __name__ == "__main__":
    main()
