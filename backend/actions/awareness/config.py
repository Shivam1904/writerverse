"""Awareness config — the governance knob.

Per-rule mode + degree, tunable without touching rule logic. `mode` is
auto | suggest | gate | off; the extra keys are the degree ("by how much").
PoC dict; could become YAML later. `max_per_session` is recognised by the
contract but not yet enforced in the PoC.
"""

CONFIG = {
    "withhold_verdict": {"mode": "gate", "threshold": 6},
    "show_verdict":     {"mode": "gate", "threshold": 15},
    "stale_mark":       {"mode": "auto"},                     # deterministic flag, no LLM
    "reanalyse_stale":  {"mode": "suggest", "min_changed": 1},
    "wobble_nudge":     {"mode": "suggest"},
}
