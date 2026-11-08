"""Night Eyes checkpointer — persists conversation state in Postgres.

Each chat request opens a short-lived async connection via
`AsyncPostgresSaver.from_conn_string`. The first connection of the process
runs `.setup()` once to create LangGraph's internal tables; subsequent
connections skip it.
"""
from contextlib import asynccontextmanager

from django.conf import settings
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

_setup_done = False


def _conn_string() -> str:
    db = settings.DATABASES["default"]
    user = db.get("USER", "")
    pwd = db.get("PASSWORD", "")
    host = db.get("HOST", "") or "localhost"
    port = db.get("PORT", "") or "5432"
    name = db.get("NAME", "")
    auth = f"{user}:{pwd}@" if user else ""
    return f"postgresql://{auth}{host}:{port}/{name}"


@asynccontextmanager
async def open_checkpointer():
    global _setup_done
    async with AsyncPostgresSaver.from_conn_string(_conn_string()) as saver:
        if not _setup_done:
            await saver.setup()
            _setup_done = True
        yield saver
