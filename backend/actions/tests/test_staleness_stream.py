"""The live-update stream reads changes from the database (SA-213, SA-201).

A write in "another process" is just a `ProjectDomainVersion` bump: there is no
in-memory registry, so whatever bumps the row is what the stream sees.
"""
import json
import time
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework.test import APIClient

from actions import domain_versions, staleness_stream
from actions.staleness_stream import changed_domains, stream_events

User = get_user_model()


def _events(chunks):
    return [json.loads(c[6:]) for c in chunks if c.startswith("data: ")]


class StreamEventsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="s@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        fast = mock.patch.multiple(
            staleness_stream, _POLL_SECONDS=0.001, _KEEPALIVE_SECONDS=0.05, _MAX_SECONDS=0.3,
        )
        fast.start()
        self.addCleanup(fast.stop)

    def test_first_event_is_snapshot_of_db_versions(self):
        v = domain_versions.bump(self.project.id, ["outline"])
        gen = stream_events(self.project.id, None)
        self.assertEqual(_events([next(gen)]),
                         [{"type": "snapshot", "versions": {"outline": v}}])

    def test_bump_from_another_process_reaches_the_stream(self):
        gen = stream_events(self.project.id, None)
        next(gen)  # snapshot
        v = domain_versions.bump(self.project.id, ["characters"])  # any process
        chunk = next(c for c in gen if c.startswith("data: "))
        self.assertEqual(json.loads(chunk[6:]), {
            "type": "invalidates", "data": ["characters"],
            "versions": {"characters": v},
        })

    def test_reconnect_with_since_replays_missed_domains(self):
        old = domain_versions.bump(self.project.id, ["outline", "characters"])
        since = {"outline": old, "characters": old}
        time.sleep(0.001)
        new = domain_versions.bump(self.project.id, ["outline", "braindumps"])
        gen = stream_events(self.project.id, since)
        events = _events([next(gen), next(gen)])
        self.assertEqual(events[0]["type"], "snapshot")
        self.assertEqual(events[1]["type"], "invalidates")
        self.assertEqual(events[1]["data"], ["braindumps", "outline"])
        self.assertEqual(events[1]["versions"]["outline"], new)

    def test_reconnect_with_nothing_missed_sends_only_snapshot(self):
        v = domain_versions.bump(self.project.id, ["outline"])
        chunks = list(stream_events(self.project.id, {"outline": v}))
        self.assertEqual([e["type"] for e in _events(chunks)], ["snapshot"])

    def test_stream_ends_by_itself_before_the_time_limit(self):
        started = time.monotonic()
        chunks = list(stream_events(self.project.id, None))  # returns, not forever
        self.assertLess(time.monotonic() - started, 2)
        self.assertIn(": keepalive\n\n", chunks)

    def test_changed_domains(self):
        self.assertEqual(changed_domains({"a": "1", "b": "1"}, {"a": "2", "b": "1", "c": "1"}),
                         ["a", "c"])
        self.assertEqual(changed_domains({"a": "1"}, {}), ["a"])  # reset wiped it


class StreamLimitsTests(TestCase):
    def test_default_limit_is_below_vercel_max_duration(self):
        self.assertLess(staleness_stream._MAX_SECONDS, 300)
        self.assertLess(staleness_stream._POLL_SECONDS, staleness_stream._KEEPALIVE_SECONDS)


class StreamViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="v@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = f"/api/consistency/projects/{self.project.id}/staleness/stream/"

    def test_other_users_project_is_404(self):
        other = User.objects.create_user(email="o@x.io", password="pw")
        theirs = Project.objects.create(user=other, title="Q")
        res = self.client.get(f"/api/consistency/projects/{theirs.id}/staleness/stream/")
        self.assertEqual(res.status_code, 404)

    def test_since_param_is_passed_through(self):
        old = domain_versions.bump(self.project.id, ["outline"])
        time.sleep(0.001)
        domain_versions.bump(self.project.id, ["outline"])
        res = self.client.get(self.url, {"since": json.dumps({"outline": old})})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "text/event-stream")
        it = iter(res.streaming_content)
        events = _events([next(it).decode(), next(it).decode()])
        self.assertEqual(events[1]["data"], ["outline"])

    def test_bad_since_is_treated_as_fresh_connect(self):
        res = self.client.get(self.url, {"since": "not json"})
        first = next(iter(res.streaming_content)).decode()
        self.assertEqual(_events([first])[0]["type"], "snapshot")


class RestWritesBumpVersionsTests(TestCase):
    """Writes outside dispatch must bump too, or other tabs never hear of them."""

    def setUp(self):
        self.user = User.objects.create_user(email="r@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _versions(self):
        return domain_versions.versions_for(self.project.id)

    def test_rest_character_create_bumps_characters(self):
        res = self.client.post(f"/api/projects/{self.project.id}/characters/",
                               {"name": "Ann"}, format="json")
        self.assertLess(res.status_code, 400, res.content)
        self.assertIn("characters", self._versions())

    def test_rest_read_does_not_bump(self):
        self.client.get(f"/api/projects/{self.project.id}/characters/")
        self.assertEqual(self._versions(), {})

    def test_rest_project_patch_bumps_project_meta(self):
        res = self.client.patch(f"/api/projects/{self.project.id}/",
                                {"synopsis": "New"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn("project_meta", self._versions())

    def test_ai_usage_bumps_ai_usage_not_project_meta(self):
        domain_versions.bump_ai_usage(self.project.id)
        self.assertEqual(sorted(self._versions()), ["ai_usage"])

    def test_failed_bump_does_not_fail_a_saved_rest_write(self):
        with mock.patch("actions.domain_versions.bump", side_effect=RuntimeError("db blip")), \
                self.assertLogs("projects.scoping", level="ERROR"):
            res = self.client.post(f"/api/projects/{self.project.id}/characters/",
                                   {"name": "Bo"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)

    def test_failed_bump_does_not_fail_a_saved_project_patch(self):
        with mock.patch("actions.domain_versions.bump", side_effect=RuntimeError("db blip")):
            res = self.client.patch(f"/api/projects/{self.project.id}/",
                                    {"synopsis": "New"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)


class StreamConnectionTests(TestCase):
    def test_db_connection_is_given_back_once_when_the_stream_ends(self):
        user = User.objects.create_user(email="c@x.io", password="pw")
        project = Project.objects.create(user=user, title="P")
        with mock.patch.multiple(staleness_stream, _POLL_SECONDS=0.001, _MAX_SECONDS=0.05), \
                mock.patch.object(staleness_stream, "_close_db_connection") as close:
            list(stream_events(project.id, None))
        close.assert_called_once()
