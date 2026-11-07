"""Signals projects sends so higher layers can react without projects importing them.

`domains_changed`: a plain REST write changed these story domains of a project
(e.g. ["characters"] or ["project_meta"]). The actions app listens and bumps
the domain versions, so other open tabs refetch (actions/apps.py).

    domains_changed.send(sender=SomeView, project_id=7, domains=["characters"])

A receiver error propagates to the sender, so senders wrap the send.
"""
from django.dispatch import Signal

domains_changed = Signal()  # kwargs: project_id: int, domains: list[str]
