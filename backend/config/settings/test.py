"""Test settings."""
from .base import *  # noqa: F401, F403

DEBUG = False

# Use in-memory SQLite for faster tests
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Wahlweise gegen Postgres (DATABASE_URL, Test-DB "test_<name>"), etwa fuer
# die Suche mit cm_fold/pg_trgm:  TEST_POSTGRES=1 pytest tests/test_global_search*.py
if env.bool("TEST_POSTGRES", default=False):  # noqa: F405
    DATABASES = {"default": env.db("DATABASE_URL")}  # noqa: F405

# Faster password hashing in tests
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Disable audit log in tests (unless explicitly needed)
AUDITLOG_INCLUDE_ALL_MODELS = False

# Use in-memory cache for tests (no Redis dependency)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Run Celery tasks synchronously in tests (no Redis/broker dependency)
CELERY_TASK_ALWAYS_EAGER = True
