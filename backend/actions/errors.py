"""A short helper for readers that raise a capability's user-facing error."""
from __future__ import annotations


def _capability_error(msg, code):
    # Imported lazily so domain readers can import this module without
    # loading the whole capabilities package at import time.
    from actions.capabilities.spec import CapabilityError
    return CapabilityError(msg, code)
