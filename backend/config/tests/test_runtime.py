"""Where the server runs, and the required-settings check (config/runtime.py)."""
import os
import subprocess
import sys
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.runtime import (
    LOCAL,
    PREVIEW,
    PRODUCTION,
    Required,
    check_database_runtime,
    check_required_settings,
    check_secret_key,
    detect_runtime,
    is_local_dev,
    missing_settings,
)

# Everything a production deployment needs.
FULL_PROD_ENV = {
    "DJANGO_SECRET_KEY": "k",
    "DATABASE_URL": "postgres://u:p@h/db",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
    "FRONTEND_URL": "https://app.example.com",
    "DEFAULT_FROM_EMAIL": "hq@example.com",
}


class DetectRuntimeTests(SimpleTestCase):
    def test_vercel_env_names_the_runtime(self):
        self.assertEqual(detect_runtime({"VERCEL": "1", "VERCEL_ENV": "production"}), PRODUCTION)
        self.assertEqual(detect_runtime({"VERCEL": "1", "VERCEL_ENV": "preview"}), PREVIEW)

    def test_laptop_tests_and_vercel_dev_are_local(self):
        self.assertEqual(detect_runtime({}), LOCAL)
        self.assertEqual(detect_runtime({"VERCEL": "1", "VERCEL_ENV": "development"}), LOCAL)

    def test_on_vercel_with_unknown_stage_counts_as_deployed(self):
        self.assertEqual(detect_runtime({"VERCEL": "1"}), PREVIEW)


class SelfHostRuntimeTests(SimpleTestCase):
    """A server off Vercel declares itself with WRITERVERSE_ENV."""

    def test_writerverse_env_marks_a_self_hosted_server_deployed(self):
        self.assertEqual(detect_runtime({"WRITERVERSE_ENV": "production"}), PRODUCTION)
        self.assertEqual(detect_runtime({"WRITERVERSE_ENV": " Preview "}), PREVIEW)
        self.assertEqual(detect_runtime({"WRITERVERSE_ENV": "local"}), LOCAL)

    def test_writerverse_env_typo_stops_startup(self):
        with self.assertRaises(ImproperlyConfigured):
            detect_runtime({"WRITERVERSE_ENV": "prod"})

    def test_local_dev_needs_local_runtime_debug_and_localhost_frontend(self):
        self.assertTrue(is_local_dev(LOCAL, True, "http://localhost:5555"))
        self.assertTrue(is_local_dev(LOCAL, True, "http://127.0.0.1:5600"))
        # A VPS that copied .env.example: DEBUG on, real frontend domain.
        self.assertFalse(is_local_dev(LOCAL, True, "https://books.example.com"))
        self.assertFalse(is_local_dev(LOCAL, False, "http://localhost:5555"))
        self.assertFalse(is_local_dev(PRODUCTION, True, "http://localhost:5555"))


class SecretKeyTests(SimpleTestCase):
    def test_local_dev_may_use_the_example_key(self):
        check_secret_key("local-dev-only-change-me", local_dev=True)
        check_secret_key("", local_dev=True)

    def test_any_other_server_refuses_empty_or_public_keys(self):
        for key in ("", "  ", "local-dev-only-change-me", "insecure-local-dev-key",
                    "django-insecure-abc123"):
            with self.subTest(key=key), self.assertRaises(ImproperlyConfigured):
                check_secret_key(key, local_dev=False)

    def test_a_real_key_is_fine_anywhere(self):
        check_secret_key("ci-test-secret-key-not-used-in-production", local_dev=False)


class RequiredSettingsTests(SimpleTestCase):
    def test_local_needs_nothing(self):
        self.assertEqual(missing_settings(LOCAL, {}), [])
        check_required_settings(LOCAL, {})  # does not raise

    def test_every_missing_name_is_reported_together(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            check_required_settings(PRODUCTION, {})
        message = str(ctx.exception)
        for name in FULL_PROD_ENV:
            self.assertIn(name, message)

    def test_blank_counts_as_missing(self):
        env = dict(FULL_PROD_ENV, FRONTEND_URL="  ")
        self.assertEqual(missing_settings(PRODUCTION, env), ["FRONTEND_URL"])

    def test_a_production_only_setting_is_not_required_in_preview(self):
        required = (Required("ONLY_IN_PROD", runtimes=(PRODUCTION,)),)
        self.assertEqual(missing_settings(PRODUCTION, {}, required), ["ONLY_IN_PROD"])
        self.assertEqual(missing_settings(PREVIEW, {}, required), [])

    def test_secret_key_alias_counts(self):
        env = {k: v for k, v in FULL_PROD_ENV.items() if k != "DJANGO_SECRET_KEY"}
        env["SECRET_KEY"] = "k"
        self.assertEqual(missing_settings(PRODUCTION, env), [])

    def test_fully_configured_production_starts(self):
        check_required_settings(PRODUCTION, FULL_PROD_ENV)  # does not raise


# Made-up Neon-style endpoint ids (not real databases).
PROD_EP = "ep-made-up-prod111"
PROD_DIRECT = f"postgres://u:p@{PROD_EP}.us-east-1.aws.neon.tech/db?sslmode=require"
PROD_POOLED = f"postgres://u:p@{PROD_EP}-pooler.us-east-1.aws.neon.tech/db"
DEV_BRANCH = "postgres://u:p@ep-made-up-dev222-pooler.us-east-1.aws.neon.tech/db"
LOCALHOST = "postgres://writerverse_user:password@localhost:5432/writerverse"
# The guard names the production endpoints in an env var.
GUARD = {"PRODUCTION_DB_ENDPOINTS": f" ep-made-up-other999 , {PROD_EP} "}


class ProductionDatabaseGuardTests(SimpleTestCase):
    def test_local_run_on_production_host_stops(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            check_database_runtime(LOCAL, {**GUARD, "DATABASE_URL": PROD_DIRECT})
        self.assertIn("ALLOW_PRODUCTION_DATABASE", str(ctx.exception))

    def test_local_run_on_production_pooler_host_stops(self):
        with self.assertRaises(ImproperlyConfigured):
            check_database_runtime(LOCAL, {**GUARD, "DATABASE_URL": PROD_POOLED})

    def test_explicit_override_allows_it(self):
        for value in ("true", "True", "1", "yes"):
            env = {**GUARD, "DATABASE_URL": PROD_POOLED, "ALLOW_PRODUCTION_DATABASE": value}
            check_database_runtime(LOCAL, env)  # does not raise

    def test_false_override_still_stops(self):
        env = {**GUARD, "DATABASE_URL": PROD_DIRECT, "ALLOW_PRODUCTION_DATABASE": "false"}
        with self.assertRaises(ImproperlyConfigured):
            check_database_runtime(LOCAL, env)

    def test_local_postgres_dev_branch_and_no_url_are_fine(self):
        for url in (LOCALHOST, DEV_BRANCH, "", "sqlite:///db.sqlite3"):
            check_database_runtime(LOCAL, {**GUARD, "DATABASE_URL": url})  # does not raise

    def test_no_endpoints_named_means_no_guard(self):
        # A fork with no production database sets nothing.
        check_database_runtime(LOCAL, {"DATABASE_URL": PROD_DIRECT})  # does not raise

    def test_deployed_runtimes_use_production_host(self):
        for runtime in (PRODUCTION, PREVIEW):
            check_database_runtime(runtime, {**GUARD, "DATABASE_URL": PROD_POOLED})  # does not raise


class SelfHostSettingsTests(SimpleTestCase):
    """Load config/settings.py in a fresh process with a self-host's env.

    Environment variables win over backend/.env (python-decouple), so these
    runs don't depend on the developer's own .env.
    """

    BACKEND = Path(__file__).resolve().parents[2]
    SAFE_KEY = "a-real-random-key-for-this-test-only-0123456789"

    def _load(self, **env):
        base = {k: v for k, v in os.environ.items() if k not in ("VERCEL", "VERCEL_ENV")}
        base.update(env)
        code = (
            "import os; os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'\n"
            "from django.conf import settings\n"
            "print(settings.DEV_SHORTCUTS_ENABLED, settings.LOCAL_DEV, settings.IS_DEPLOYED)"
        )
        return subprocess.run(
            [sys.executable, "-c", code], cwd=self.BACKEND, env=base,
            capture_output=True, text=True, timeout=60,
        )

    def test_copied_example_env_on_a_public_server_has_no_dev_shortcuts(self):
        # DEBUG=True from .env.example, but FRONTEND_URL is the server's real domain.
        run = self._load(DJANGO_DEBUG="True", DJANGO_SECRET_KEY=self.SAFE_KEY,
                         FRONTEND_URL="https://books.example.com", WRITERVERSE_ENV="")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(run.stdout.split()[-3:], ["False", "False", "False"])

    def test_example_secret_key_off_a_dev_machine_stops_startup(self):
        run = self._load(DJANGO_DEBUG="True", DJANGO_SECRET_KEY="local-dev-only-change-me",
                         FRONTEND_URL="https://books.example.com", WRITERVERSE_ENV="")
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY", run.stderr)

    def test_writerverse_env_production_with_example_key_stops_startup(self):
        run = self._load(
            WRITERVERSE_ENV="production", DJANGO_DEBUG="False",
            DJANGO_SECRET_KEY="local-dev-only-change-me",
            DATABASE_URL="postgres://u:p@db.example.com/w",
            CORS_ALLOWED_ORIGINS="https://books.example.com",
            FRONTEND_URL="https://books.example.com",
            DEFAULT_FROM_EMAIL="hq@example.com",
        )
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY", run.stderr)

    def test_local_dev_keeps_its_shortcuts(self):
        run = self._load(DJANGO_DEBUG="True", DJANGO_SECRET_KEY="local-dev-only-change-me",
                         FRONTEND_URL="http://localhost:5555", WRITERVERSE_ENV="")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(run.stdout.split()[-3:], ["True", "True", "False"])
