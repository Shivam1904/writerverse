"""The per-project write lock + "what changed when" (ProjectDomainVersion).

- Every WRITE dispatch commits while holding `SELECT … FOR UPDATE` on the
  Project row, so two writes to the same project run one after the other.
- A write bumps the version of each domain it invalidates; a read reports the
  current version of its domain in `staleness`.
- Night Eyes compares the two and warns the chat with `[STALE]`.
"""
import threading
import uuid
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from night_eyes.graph import _stale_warning
from night_eyes.models import ChatThread
from night_eyes.tools import _update_read_baseline
from projects.models import Project

from actions import domain_versions
from actions.capabilities import (
    Actor,
    Capability,
    ProjectScope,
    Route,
    dispatch,
    registry,
)
from actions.models import ProjectDomainVersion

User = get_user_model()


def _write_cap(name, commit):
    return Capability(
        name=name, route=Route.WRITE, description="test write",
        gather=lambda ctx, args: dict(args), commit=commit,
    )


@skipUnless(connection.vendor == "postgresql", "row locks (SELECT … FOR UPDATE) need Postgres; CI uses SQLite")
class WriteLockTests(TransactionTestCase):
    """Real threads, real connections: needs committed rows, so no TestCase."""

    def setUp(self):
        user = User.objects.create_user(email="lock@test.com", password="x")
        self.project = Project.objects.create(title="Lock", user=user)
        self.other = Project.objects.create(title="Other", user=user)
        self._snap = registry.snapshot()
        self.order: list[str] = []
        self.first_in = threading.Event()
        self.release_first = threading.Event()

        def slow_commit(ctx, result):
            self.order.append("first:start")
            self.first_in.set()
            # Hold the lock until the test lets go (timeout = safety net).
            self.release_first.wait(timeout=10)
            self.order.append("first:end")

        def quick_commit(ctx, result):
            self.order.append(f"second:{ctx.project_id}")

        registry.register(_write_cap("_lock_slow", slow_commit))
        registry.register(_write_cap("_lock_quick", quick_commit))

    def tearDown(self):
        registry.restore(self._snap)

    def _in_thread(self, cap, project_id, errors):
        def run():
            try:
                res = dispatch(cap, {}, Actor.USER_BUTTON, ProjectScope(project_id))
                if res.status != "ran":
                    errors.append(res.error)
            except Exception as exc:  # noqa: BLE001 — surface in the main thread
                errors.append(repr(exc))
            finally:
                connection.close()
        t = threading.Thread(target=run)
        t.start()
        return t

    def test_second_write_to_same_project_waits_for_first(self):
        errors: list = []
        t1 = self._in_thread("_lock_slow", self.project.id, errors)
        self.assertTrue(self.first_in.wait(timeout=10))
        t2 = self._in_thread("_lock_quick", self.project.id, errors)
        t2.join(timeout=0.5)
        # Still blocked on the Project row lock while the first write holds it.
        self.assertTrue(t2.is_alive())
        self.assertEqual(self.order, ["first:start"])

        self.release_first.set()
        t1.join(timeout=10)
        t2.join(timeout=10)
        self.assertEqual(errors, [])
        self.assertEqual(
            self.order, ["first:start", "first:end", f"second:{self.project.id}"])

    def test_write_to_another_project_is_not_blocked(self):
        errors: list = []
        t1 = self._in_thread("_lock_slow", self.project.id, errors)
        self.assertTrue(self.first_in.wait(timeout=10))
        t2 = self._in_thread("_lock_quick", self.other.id, errors)
        t2.join(timeout=10)
        self.assertFalse(t2.is_alive())
        self.assertEqual(self.order, ["first:start", f"second:{self.other.id}"])

        self.release_first.set()
        t1.join(timeout=10)
        self.assertEqual(errors, [])


@skipUnless(connection.vendor == "postgresql", "row locks (SELECT … FOR UPDATE) need Postgres; CI uses SQLite")
class WriteLockQueryTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(email="lockq@test.com", password="x")
        self.project = Project.objects.create(title="LockQ", user=user)
        self._snap = registry.snapshot()
        registry.register(_write_cap("_lock_noop", lambda ctx, result: None))

    def tearDown(self):
        registry.restore(self._snap)

    def test_write_takes_for_update_on_the_project_row(self):
        with CaptureQueriesContext(connection) as q:
            res = dispatch("_lock_noop", {}, Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        # Only count ours (an AI policy may lock its own rows; a query profiler may
        # add an EXPLAIN copy of each query).
        locks = [x["sql"] for x in q.captured_queries
                 if x["sql"].startswith("SELECT") and x["sql"].endswith("FOR UPDATE")
                 and 'FROM "projects_project"' in x["sql"]]
        self.assertEqual(len(locks), 1, locks)


class DomainVersionTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(email="dv@test.com", password="x")
        self.project = Project.objects.create(title="DV", user=user)
        self.scope = ProjectScope(self.project.id)

    def test_read_before_any_write_reports_empty_version(self):
        res = dispatch("get_characters", {}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.staleness, {"characters": ""})

    def test_write_bumps_domain_and_read_returns_it(self):
        res = dispatch("add_character", {"name": "Mara"}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "ran")
        self.assertIn("characters", res.invalidates)
        row = ProjectDomainVersion.objects.get(project=self.project, domain="characters")

        read = dispatch("get_characters", {}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(read.staleness, {"characters": row.changed_at.isoformat()})
        self.assertEqual(domain_versions.versions_for(self.project.id),
                         {"characters": row.changed_at.isoformat()})

    def test_second_write_moves_the_version_forward_one_row_per_domain(self):
        dispatch("add_character", {"name": "A"}, Actor.USER_BUTTON, self.scope)
        v1 = domain_versions.version_of(self.project.id, "characters")
        dispatch("add_character", {"name": "B"}, Actor.USER_BUTTON, self.scope)
        v2 = domain_versions.version_of(self.project.id, "characters")
        self.assertGreater(v2, v1)
        self.assertEqual(
            ProjectDomainVersion.objects.filter(project=self.project).count(), 1)

    def test_versions_are_per_project(self):
        other = Project.objects.create(title="Other", user=self.project.user)
        dispatch("add_character", {"name": "A"}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(domain_versions.versions_for(other.id), {})


class StaleWarningTests(TestCase):
    """End to end: chat reads → baseline; a write elsewhere → [STALE]."""

    def setUp(self):
        user = User.objects.create_user(email="stale@test.com", password="x")
        self.project = Project.objects.create(title="Stale", user=user)
        self.scope = ProjectScope(self.project.id)
        self.thread = ChatThread.objects.create(
            project=self.project, thread_id=uuid.uuid4())

    def _chat_read(self):
        res = dispatch("get_characters", {}, Actor.CHAT, self.scope)
        _update_read_baseline(self.thread.thread_id, res.staleness)

    def test_no_warning_when_nothing_changed_since_the_read(self):
        dispatch("add_character", {"name": "A"}, Actor.USER_BUTTON, self.scope)
        self._chat_read()
        self.assertIsNone(_stale_warning(self.thread.thread_id, self.scope))

    def test_warning_after_a_write_to_a_read_domain(self):
        self._chat_read()
        dispatch("add_character", {"name": "A"}, Actor.USER_BUTTON, self.scope)
        warning = _stale_warning(self.thread.thread_id, self.scope)
        self.assertIsNotNone(warning)
        self.assertTrue(warning.startswith("[STALE] characters"))

    def test_a_fresh_read_clears_the_warning(self):
        self._chat_read()
        dispatch("add_character", {"name": "A"}, Actor.USER_BUTTON, self.scope)
        self._chat_read()
        self.assertIsNone(_stale_warning(self.thread.thread_id, self.scope))
