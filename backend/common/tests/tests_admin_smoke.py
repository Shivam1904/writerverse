"""Every admin page loads. Catches a removed/renamed model that is still linked
from the admin sidebar (settings.UNFOLD) or registered in an admin.py."""
from django.conf import settings
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class AdminSmokeTest(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_superuser(email="su@x.io", password="pw")
        self.client.force_login(user)

    def test_index_and_every_changelist_load(self):
        if not settings.ADMIN_PATH:
            self.skipTest("admin not routed in this settings profile")
        urls = [reverse("admin:index")] + [
            reverse(f"admin:{m._meta.app_label}_{m._meta.model_name}_changelist")
            for m in admin.site._registry
        ]
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)
