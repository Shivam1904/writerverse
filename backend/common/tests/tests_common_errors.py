"""Tests for the shared exception-reporting helper (P0-2 / Observability 1&2).

Guarantees: authors never see exception text; the server log carries the
real exception + structured context keyed by a correlation id the user can
quote back.
"""

import logging
from unittest.mock import MagicMock

from django.test import TestCase
from rest_framework import status

from common.errors import (
    DEFAULT_MESSAGE,
    error_response,
    report_exception,
    sse_error_data,
)


class ReportExceptionTests(TestCase):
    def test_traceback_goes_to_errors_logger_with_context_and_returns_id(self):
        log = MagicMock(spec=logging.Logger)
        with self.assertLogs("writerverse.errors", level="ERROR") as cm:
            cid = report_exception(
                ValueError("contains lookup is not supported on this database backend"),
                operation="chat.stream",
                project_id=42,
                user_action="ask_question",
                log=log,
            )

        self.assertRegex(cid, r"^[0-9a-f]{12}$")
        [record] = cm.records
        # The structured context is logged, and the traceback rides along.
        self.assertIn("chat.stream", record.args)
        self.assertIn(42, record.args)
        self.assertIn(cid, record.args)
        self.assertIsNotNone(record.exc_info)
        # The caller's own logger gets a one-line pointer with the same id.
        log.error.assert_called_once()
        self.assertIn(cid, log.error.call_args.args)


class ErrorResponseTests(TestCase):
    def test_response_hides_internals_and_carries_correlation_id(self):
        log = MagicMock(spec=logging.Logger)
        resp = error_response(
            RuntimeError("psycopg2.errors.UndefinedColumn: column does not exist"),
            operation="synopsis.generate",
            project_id=7,
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            log=log,
        )

        self.assertEqual(resp.status_code, 500)
        body = resp.data
        self.assertEqual(body["error"], DEFAULT_MESSAGE)
        self.assertNotIn("psycopg2", body["error"])
        self.assertRegex(body["correlation_id"], r"^[0-9a-f]{12}$")
        log.error.assert_called_once()

    def test_traceback_reaches_errors_logger_even_with_caller_logger(self):
        # SA-260: every call site passes its own module logger; the traceback
        # must still land on writerverse.errors (→ error.log).
        caller = logging.getLogger("characters.views.character")
        with self.assertLogs("writerverse.errors", level="ERROR") as cm:
            try:
                raise RuntimeError("boom")
            except RuntimeError as exc:
                resp = error_response(
                    exc, operation="character.commit_generated",
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR, log=caller,
                )
        [record] = cm.records
        self.assertIn(resp.data["correlation_id"], record.args)
        self.assertIn("RuntimeError: boom", cm.output[0])
        self.assertIn("Traceback", cm.output[0])

    def test_custom_message_is_used_but_never_the_exception_text(self):
        log = MagicMock(spec=logging.Logger)
        resp = error_response(
            Exception("secret stack frame at /srv/app/x.py line 9"),
            operation="onboarding.classify",
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="I couldn't read your story just now — your work is safe.",
            log=log,
        )
        self.assertEqual(
            resp.data["error"],
            "I couldn't read your story just now — your work is safe.",
        )
        self.assertNotIn("secret stack frame", resp.data["error"])


class SseErrorDataTests(TestCase):
    def test_sse_payload_is_user_safe(self):
        log = MagicMock(spec=logging.Logger)
        data = sse_error_data(
            Exception("OperationalError: no such table"),
            operation="chat.stream",
            project_id=1,
            log=log,
        )
        self.assertEqual(data["message"], DEFAULT_MESSAGE)
        self.assertNotIn("OperationalError", data["message"])
        self.assertIn("correlation_id", data)
        log.error.assert_called_once()
