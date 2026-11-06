"""Observability part 3 — DEBUG-gated persistence breadcrumb log.

The point of the log is to answer "did it save?" without leaking the
manuscript. So the two things worth testing: it is silent when disabled,
and when enabled it records a fingerprint, never the prose.
"""

from django.test import TestCase, override_settings

from common import persistence_audit
from common.persistence_audit import _describe, audit_empty_read, audit_write

SECRET = "The drowned village rises every century to claim a christening gown " * 5


class DescribeTests(TestCase):
    def test_describe_never_contains_the_full_value(self):
        line = _describe(SECRET)
        self.assertNotIn(SECRET, line)
        self.assertIn(f"len={len(SECRET)}", line)
        self.assertIn("hash=", line)
        # preview is capped and single-lined
        self.assertNotIn("\n", _describe("a\nb\nc"))
        self.assertIn(SECRET[:40], line)
        self.assertNotIn(SECRET[:60], line)

    def test_none_is_safe(self):
        self.assertIn("len=0", _describe(None))


@override_settings(DEBUG=False)
class DisabledTests(TestCase):
    def setUp(self):
        persistence_audit._configured = False

    def test_write_is_a_no_op_when_disabled(self):
        with self.assertNoLogs("writerverse.persistence", level="INFO"):
            audit_write("onboarding.classify", project_id=1, synopsis=SECRET)
            audit_empty_read("onboarding.classify", "synopsis", project_id=1)


@override_settings(DEBUG=True)
class EnabledTests(TestCase):
    def setUp(self):
        persistence_audit._configured = False

    def test_write_logs_a_fingerprint_not_the_prose(self):
        with self.assertLogs("writerverse.persistence", level="INFO") as cm:
            audit_write("onboarding.classify", project_id=7, synopsis=SECRET)
        output = "\n".join(cm.output)
        self.assertIn("WRITE op=onboarding.classify", output)
        self.assertIn("project=7", output)
        self.assertIn("synopsis(", output)
        self.assertNotIn(SECRET, output)

    def test_empty_read_is_recorded(self):
        with self.assertLogs("writerverse.persistence", level="INFO") as cm:
            audit_empty_read("onboarding.classify", "synopsis", project_id=7)
        self.assertIn("EMPTY_READ op=onboarding.classify", "\n".join(cm.output))
        self.assertIn("field=synopsis", "\n".join(cm.output))
