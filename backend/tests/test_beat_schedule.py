"""Zeitplan von Celery Beat.

Intervalle (z. B. 86400) zaehlen ab dem Start von Beat - jedes Deploy setzt
sie zurueck, und ein "taeglicher" Job lief bei mehreren Deploys am Tag nie.
Deshalb nur feste Uhrzeiten (crontab).
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from celery import current_app
from celery.schedules import crontab
from django.conf import settings

import config.celery  # noqa: F401 - registriert die Tasks


def test_all_beat_jobs_use_fixed_times():
    for name, entry in settings.CELERY_BEAT_SCHEDULE.items():
        assert isinstance(entry["schedule"], crontab), f"{name}: Intervall statt fester Uhrzeit"


def test_all_beat_jobs_point_to_registered_tasks():
    current_app.loader.import_default_modules()
    for name, entry in settings.CELERY_BEAT_SCHEDULE.items():
        assert entry["task"] in current_app.tasks, f"{name}: Task {entry['task']} unbekannt"


def test_daily_jobs_run_once_per_day_at_expected_time():
    expected = {
        "capture-dashboard-kpi-snapshots": (23, 30),
        "send-scheduled-reports": (7, 0),
        "capture-fte-snapshots": (6, 30),
        "auto-link-time-tracking": (6, 0),
    }
    for name, (hour, minute) in expected.items():
        schedule = settings.CELERY_BEAT_SCHEDULE[name]["schedule"]
        assert schedule.hour == {hour}, name
        assert schedule.minute == {minute}, name


def test_kpi_snapshot_runs_on_the_same_calendar_day_in_utc():
    # Der Task nimmt date.today() (Container laeuft in UTC): 23:30 Berlin muss
    # in UTC noch derselbe Tag sein - im Sommer wie im Winter.
    berlin = ZoneInfo(settings.CELERY_TIMEZONE)
    for month in (1, 7):
        local = datetime(2026, month, 31 if month == 1 else 31, 23, 30, tzinfo=berlin)
        assert local.astimezone(ZoneInfo("UTC")).date() == local.date()
