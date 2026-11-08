"""SA-74: portraits go to Cloudflare R2 in prod, local disk otherwise.

No real network: R2 is faked with moto, other storage calls with mocks.
"""
import re
from unittest.mock import MagicMock, patch

import boto3
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase
from moto import mock_aws
from projects.models import Project

from characters.models import Character
from characters.portraits import (
    delete_portrait,
    key_from_url,
    portrait_key,
    save_portrait,
)
from config.storage import build_storages

R2_ENV = {
    "R2_ACCOUNT_ID": "acct123",
    "R2_ACCESS_KEY_ID": "key",
    "R2_SECRET_ACCESS_KEY": "secret",
    "R2_BUCKET_NAME": "writerverse-media",
    "R2_PUBLIC_URL": "https://pub-abc.r2.dev/",
}


class StorageSelectionTest(SimpleTestCase):
    def test_no_env_is_local_disk(self):
        s = build_storages({})
        self.assertEqual(s["default"]["BACKEND"], "django.core.files.storage.FileSystemStorage")
        self.assertIn("staticfiles", s)

    def test_full_env_is_r2(self):
        s = build_storages(R2_ENV)["default"]
        self.assertEqual(s["BACKEND"], "storages.backends.s3.S3Storage")
        opts = s["OPTIONS"]
        self.assertEqual(opts["endpoint_url"], "https://acct123.r2.cloudflarestorage.com")
        self.assertEqual(opts["bucket_name"], "writerverse-media")
        self.assertEqual(opts["custom_domain"], "pub-abc.r2.dev")
        self.assertFalse(opts["querystring_auth"])

    def test_half_set_up_fails_loudly(self):
        env = dict(R2_ENV, R2_SECRET_ACCESS_KEY="")
        with self.assertRaisesMessage(ImproperlyConfigured, "R2_SECRET_ACCESS_KEY"):
            build_storages(env)

    def test_public_url_must_be_a_url(self):
        with self.assertRaises(ImproperlyConfigured):
            build_storages(dict(R2_ENV, R2_PUBLIC_URL="pub-abc.r2.dev"))


@mock_aws
class R2SaveTest(SimpleTestCase):
    """A real S3Storage against a moto-faked bucket: the URL the API returns."""

    def test_saved_portrait_url_is_public_and_unsigned(self):
        from storages.backends.s3 import S3Storage

        opts = dict(build_storages(R2_ENV)["default"]["OPTIONS"])
        opts.pop("endpoint_url")  # moto fakes the AWS endpoint
        opts["region_name"] = "us-east-1"
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket=opts["bucket_name"])
        storage = S3Storage(**opts)

        with patch("characters.portraits.default_storage", storage):
            url = save_portrait(7, 42, b"\x89PNG fake")

        self.assertRegex(
            url, r"^https://pub-abc\.r2\.dev/character_portraits/7/42-[0-9a-f]{32}\.png$",
        )
        key = key_from_url(url)
        body = boto3.client("s3", region_name="us-east-1").get_object(
            Bucket=opts["bucket_name"], Key=key,
        )["Body"].read()
        self.assertEqual(body, b"\x89PNG fake")


class KeyTest(SimpleTestCase):
    def test_key_is_scoped_and_unguessable(self):
        a, b = portrait_key(1, 2), portrait_key(1, 2)
        self.assertTrue(re.fullmatch(r"character_portraits/1/2-[0-9a-f]{32}\.png", a))
        self.assertNotEqual(a, b)

    def test_key_from_url(self):
        self.assertEqual(
            key_from_url("/media/character_portraits/1/2-ab.png"),
            "character_portraits/1/2-ab.png",
        )
        self.assertEqual(
            key_from_url("https://pub-abc.r2.dev/character_portraits/1/2-ab.png"),
            "character_portraits/1/2-ab.png",
        )
        self.assertIsNone(key_from_url("https://elsewhere.com/cat.png"))
        self.assertIsNone(key_from_url("/media/character_portraits/../secret"))
        self.assertIsNone(key_from_url(""))

    def test_delete_never_raises(self):
        storage = MagicMock()
        storage.delete.side_effect = OSError("down")
        with patch("characters.portraits.default_storage", storage):
            delete_portrait("/media/character_portraits/1/2-ab.png")  # no raise
        storage.delete.assert_called_once_with("character_portraits/1/2-ab.png")


class PortraitFileLifecycleTest(TestCase):
    """Old files are removed on regenerate and on hard delete; soft delete keeps them."""

    def setUp(self):
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.create_user(email="pf@example.com", password="x")
        self.project = Project.objects.create(title="P", user=user)
        self.old_url = "/media/character_portraits/1/2-old.png"
        self.char = Character.objects.create(
            project=self.project, name="Light", portrait_url=self.old_url,
        )
        self.storage = MagicMock()
        p = patch("characters.portraits.default_storage", self.storage)
        p.start()
        self.addCleanup(p.stop)

    def _commit(self, new_url):
        from characters.capabilities.commit import commit_generate_portrait

        ctx = MagicMock(project_id=self.project.id)
        commit_generate_portrait(ctx, {"character_id": self.char.id, "portrait_url": new_url})

    def test_regenerate_removes_the_old_file(self):
        with self.captureOnCommitCallbacks(execute=True):
            self._commit("/media/character_portraits/1/2-new.png")
        self.storage.delete.assert_called_once_with("character_portraits/1/2-old.png")

    def test_failed_commit_removes_the_new_file(self):
        from actions.capabilities.spec import CapabilityError

        from characters import readers

        readers.delete_character(self.project.id, self.char.id)  # soft: commit can't find it
        with self.assertRaises(CapabilityError), self.captureOnCommitCallbacks(execute=True):
            self._commit("/media/character_portraits/1/2-new.png")
        self.storage.delete.assert_called_once_with("character_portraits/1/2-new.png")

    def test_soft_delete_keeps_the_file(self):
        from characters import readers

        with self.captureOnCommitCallbacks(execute=True):
            readers.delete_character(self.project.id, self.char.id)
        self.storage.delete.assert_not_called()

    def test_project_delete_removes_the_file(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.project.delete()
        self.storage.delete.assert_called_once_with("character_portraits/1/2-old.png")
