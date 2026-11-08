"""Chat SSE forwards a direct WRITE's staleness domains (D31).

A Night Eyes direct WRITE accumulates its `result.invalidates` onto the shared
session (tools.py); the SSE generator drains that into one `invalidates` event
at end-of-turn so the acting tab's TanStack cache refetches. Before this, only
the proposal-accept path and the token meter emitted `invalidates`, so chat
direct writes (update_plot_thread, update_character, add_braindump, …) silently
left the page stale. These are pure tests — no DB, no LLM: a fake `chat` whose
`stream()` mutates `session._chat_invalidates` exactly like the tool wrapper.
"""
import json
import unittest

from night_eyes.stream import stream_chat_sse


class _Chunk:
    def __init__(self, content):
        self.content = content


class _FakeSession:
    """Stand-in for the chat's ProjectScope — only the transient sink matters."""


class _FakeThread:
    # project_id None → _settle_chat_turn no-ops, so the turn never touches the
    # ORM and these stay pure unit tests.
    project_id = None


class _FakeChat:
    """Mimics ConsistencyChat: holds `.session` and an async `stream()` that, on
    each named write, accumulates onto `session._chat_invalidates` the way the
    real tool wrapper (tools.py `_wrap`) does."""

    def __init__(self, session, writes):
        self.session = session
        self._writes = writes  # list[list[str]] — domains per write tool call

    async def stream(self, message, thread_id, resume=None):
        # a little assistant text, then the tool writes accumulate their domains
        yield {"event": "on_chat_model_stream", "data": {"chunk": _Chunk("ok")}}
        for domains in self._writes:
            sink = getattr(self.session, "_chat_invalidates", None)
            if sink is None:
                sink = set()
                self.session._chat_invalidates = sink
            sink.update(domains)


def _invalidates_events(chat):
    """Run a turn and return the list of `invalidates` payloads emitted."""
    out = "".join(stream_chat_sse(chat, _FakeThread(), thread_id="t1", message="hi"))
    events = [
        json.loads(line[6:])
        for line in out.split("\n")
        if line.startswith("data: ")
    ]
    return [e["data"] for e in events if e.get("type") == "invalidates"]


class StreamInvalidatesTests(unittest.TestCase):
    def test_direct_write_emits_its_domain(self):
        chat = _FakeChat(_FakeSession(), writes=[["plot_threads"]])
        inv = _invalidates_events(chat)
        self.assertIn(["plot_threads"], inv)

    def test_multiple_writes_aggregate_sorted_and_deduped(self):
        chat = _FakeChat(
            _FakeSession(),
            writes=[["plot_threads"], ["worldbuilding", "gauges"], ["plot_threads"]],
        )
        inv = _invalidates_events(chat)
        # one combined event, sorted + deduped
        self.assertIn(["gauges", "plot_threads", "worldbuilding"], inv)

    def test_no_write_emits_no_data_domain(self):
        # only the token-meter project_meta event, never an empty/data domain
        chat = _FakeChat(_FakeSession(), writes=[])
        inv = _invalidates_events(chat)
        self.assertNotIn(["plot_threads"], inv)
        for payload in inv:
            self.assertTrue(payload, "no empty invalidates payload should be emitted")


if __name__ == "__main__":
    unittest.main()
