"""Skip smoke tests when no LLM API key is available."""
import os

import pytest


def pytest_collection_modifyitems(config, items):
    """Skip every smoke test if no LLM API key is available."""
    if os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"):
        return
    skip_marker = pytest.mark.skip(
        reason="No OPENAI_API_KEY / ANTHROPIC_API_KEY set — smoke requires live LLM access."
    )
    for item in items:
        if "smoke" in item.keywords:
            item.add_marker(skip_marker)
