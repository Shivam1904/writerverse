"""Where user files (generated portraits) are stored.

Two modes, picked from env vars at startup:

- **Cloudflare R2** (S3-compatible) when the R2 vars are set. Used in prod:
  Vercel's disk is read-only and wiped between requests, so files must live
  in a bucket. Files are public-read through the bucket's public URL
  (custom domain or r2.dev). The key holds a random uuid, so a URL can't be
  guessed. URLs are plain (unsigned) because the URL is saved on the row
  (`Character.portrait_url`); a signed URL would stop working when it expires.
- **Local disk** (`MEDIA_ROOT`) when none of them are set: dev, tests, CI.

Setting only some of the R2 vars is a mistake, so it fails loudly at startup
instead of quietly writing to a disk that loses the files.
"""
from __future__ import annotations

from collections.abc import Mapping
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured

# Required for R2 mode. R2_PUBLIC_URL is the bucket's public base URL,
# e.g. https://pub-1234.r2.dev or https://media.example.com
R2_REQUIRED = (
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
)

STATICFILES = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}
LOCAL_DEFAULT = {"BACKEND": "django.core.files.storage.FileSystemStorage"}


def build_storages(env: Mapping[str, str]) -> dict:
    """The Django STORAGES setting for these env vars."""
    values = {name: (env.get(name) or "").strip() for name in R2_REQUIRED}
    present = [name for name, v in values.items() if v]
    if not present:
        return {"default": LOCAL_DEFAULT, "staticfiles": STATICFILES}
    missing = [name for name, v in values.items() if not v]
    if missing:
        raise ImproperlyConfigured(
            "File storage is half set up. Set all of these or none: "
            + ", ".join(missing)
        )

    public = urlparse(values["R2_PUBLIC_URL"])
    if public.scheme not in ("http", "https") or not public.netloc:
        raise ImproperlyConfigured(
            "R2_PUBLIC_URL must be a full URL, e.g. https://pub-1234.r2.dev"
        )
    # django-storages builds "<url_protocol>//<custom_domain>/<key>".
    custom_domain = public.netloc + public.path.rstrip("/")

    return {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "bucket_name": values["R2_BUCKET_NAME"],
                "access_key": values["R2_ACCESS_KEY_ID"],
                "secret_key": values["R2_SECRET_ACCESS_KEY"],
                "endpoint_url": (
                    f"https://{values['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
                ),
                "region_name": "auto",  # R2 has no regions; "auto" is its name
                "signature_version": "s3v4",
                "custom_domain": custom_domain,
                "url_protocol": f"{public.scheme}:",
                "querystring_auth": False,  # plain public URLs (see top)
                "file_overwrite": False,
                "default_acl": None,  # R2 ignores ACLs; public access is per bucket
                "object_parameters": {"CacheControl": "public, max-age=31536000"},
            },
        },
        "staticfiles": STATICFILES,
    }
