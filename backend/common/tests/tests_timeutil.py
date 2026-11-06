"""common.timeutil and common.ids."""
import re
from datetime import UTC, datetime, timedelta, timezone

from django.test import SimpleTestCase

from common.ids import new_id
from common.timeutil import iso, now_iso, parse_iso


class TimeutilTests(SimpleTestCase):
    def test_one_format_utc_with_micros(self):
        dt = datetime(2026, 10, 1, 12, 0, 0, tzinfo=timezone(timedelta(hours=2)))
        self.assertEqual(iso(dt), "2026-10-01T10:00:00.000000+00:00")
        self.assertRegex(now_iso(), r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}\+00:00$")
        self.assertIsNone(iso(None))

    def test_parses_old_formats(self):
        want = datetime(2026, 10, 1, 10, 0, tzinfo=UTC)
        for s in ("2026-10-01T10:00:00+00:00", "2026-10-01T10:00:00Z",
                  "2026-10-01T10:00:00", "2026-10-01T12:00:00+02:00",
                  "2026-10-01T10:00:00.000000+00:00"):
            self.assertEqual(parse_iso(s), want, s)
        for bad in (None, "", "yesterday", 42):
            self.assertIsNone(parse_iso(bad))

    def test_exact_only_accepts_the_one_format(self):
        self.assertIsNotNone(parse_iso("2026-10-01T10:00:00.123456+00:00", exact=True))
        self.assertIsNone(parse_iso("2026-10-01T10:00:00+00:00", exact=True))

    def test_string_order_is_time_order(self):
        a = datetime(2026, 10, 1, 10, 0, 0, 100, tzinfo=UTC)
        b = a + timedelta(microseconds=5)
        self.assertLess(iso(a), iso(b))


class NewIdTests(SimpleTestCase):
    def test_format(self):
        self.assertRegex(new_id("sc"), re.compile(r"^sc-[0-9a-f]{8}$"))

    def test_retries_while_taken(self):
        seen = []

        def taken(uid):
            seen.append(uid)
            return len(seen) < 3

        uid = new_id("bt", taken=taken)
        self.assertEqual(len(seen), 3)
        self.assertEqual(uid, seen[-1])
