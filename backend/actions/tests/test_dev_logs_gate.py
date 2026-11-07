"""The dev log viewer serves a cross-project log, so it must 404 outside local dev."""
from django.test import TestCase, override_settings


class DevLogsGateTests(TestCase):
    URLS = ("/api/consistency/dev/logs/", "/api/consistency/dev/registry/")

    @override_settings(DEBUG=False, LOCAL_DEV=True)
    def test_404_when_debug_off(self):
        for url in self.URLS:
            self.assertEqual(self.client.get(url).status_code, 404, url)

    @override_settings(DEBUG=True, LOCAL_DEV=False)
    def test_404_on_a_server_that_is_not_local_dev(self):
        # e.g. a VPS that copied .env.example (DEBUG=True) with a real FRONTEND_URL.
        for url in self.URLS:
            self.assertEqual(self.client.get(url).status_code, 404, url)

    @override_settings(DEBUG=True, LOCAL_DEV=True)
    def test_served_in_local_dev(self):
        for url in self.URLS:
            self.assertEqual(self.client.get(url).status_code, 200, url)
