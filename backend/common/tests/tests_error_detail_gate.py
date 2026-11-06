"""The raw exception text goes into error answers only on a developer's own machine."""
from django.test import SimpleTestCase, override_settings

from common.errors import error_response


class ErrorDetailGateTests(SimpleTestCase):
    def _payload(self):
        return error_response(ValueError("db host secret"), operation="t", status=500).data

    @override_settings(DEBUG=True, LOCAL_DEV=False)
    def test_debug_on_a_public_server_hides_detail(self):
        self.assertNotIn("detail", self._payload())

    @override_settings(DEBUG=True, LOCAL_DEV=True)
    def test_local_dev_shows_detail(self):
        self.assertEqual(self._payload()["detail"], "db host secret")
