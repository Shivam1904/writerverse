"""The public health check hides error details from the caller (wrt-89)."""
from unittest import mock

from django.test import TestCase


class HealthCheckTests(TestCase):
    def test_healthy(self):
        resp = self.client.get('/health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['checks']['database'], 'healthy')

    def test_failure_is_generic_for_the_caller_and_detailed_in_logs(self):
        secret = 'password authentication failed for user "wv_admin" at db.internal:5432'
        with mock.patch('config.views.connection.cursor', side_effect=Exception(secret)), \
                self.assertLogs('config.views', level='ERROR') as logs:
            resp = self.client.get('/health/')
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.json()['checks']['database'], 'unhealthy')
        self.assertNotIn('wv_admin', resp.content.decode())
        self.assertIn('wv_admin', '\n'.join(logs.output))
