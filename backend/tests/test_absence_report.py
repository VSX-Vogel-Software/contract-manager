"""Tests for absence report feature."""
import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.core.files.base import ContentFile

from apps.contracts.models import AbsenceReport, AbsenceReportEntry, Contract
from apps.contracts.services.absence_report import AbsenceReportService, ABSENCE_LABELS
from apps.contracts.services.time_tracking import TimeTrackingProvider
from apps.contracts.services.clockodo_provider import ClockodoProvider
from apps.customers.models import Customer


# ---- Provider Normalization ----

class TestAbsenceTypeNormalization:
    def test_base_provider_returns_other(self):
        """ABC default normalize_absence_type returns 'other'."""
        class DummyProvider(TimeTrackingProvider):
            def test_connection(self): return {"success": True}
            def get_projects(self): return []
            def get_time_summary(self, *a, **kw): return None

        provider = DummyProvider()
        assert provider.normalize_absence_type(0) == "other"
        assert provider.normalize_absence_type(99) == "other"

    def test_clockodo_vacation(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(1) == "vacation"

    def test_clockodo_special_leave(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(2) == "special_leave"
        assert provider.normalize_absence_type(10) == "special_leave"

    def test_clockodo_overtime_reduction(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(3) == "overtime_reduction"

    def test_clockodo_sick(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(4) == "sick"
        assert provider.normalize_absence_type(11) == "sick"  # unbezahlt
        assert provider.normalize_absence_type(15) == "sick"  # Krankengeld

    def test_clockodo_sick_child(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(5) == "sick_child"
        assert provider.normalize_absence_type(12) == "sick_child"  # unbezahlt

    def test_clockodo_sick_certificate_from_sick_note(self):
        """Die AU steht in Clockodo im Feld sick_note, nicht im Typ."""
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(4, sick_note=True) == "sick_certificate"
        assert provider.normalize_absence_type(11, sick_note=True) == "sick_certificate"
        assert provider.normalize_absence_type(5, sick_note=True) == "sick_child_certificate"
        assert provider.normalize_absence_type(4, sick_note=False) == "sick"

    def test_clockodo_sick_note_ignored_for_non_sick(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(1, sick_note=True) == "vacation"

    def test_clockodo_get_absences_keeps_sick_note(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        with patch.object(provider, "_get", return_value={"data": [
            {"users_id": 7, "date_since": "2026-02-03", "date_until": "2026-02-03",
             "count_days": 1, "type": 4, "status": 1, "sick_note": True},
            {"users_id": 7, "date_since": "2026-02-04", "date_until": "2026-02-04",
             "count_days": 1, "type": 4, "status": 1, "sick_note": None},
        ]}):
            absences = provider.get_absences(2026)
        assert [a["sick_note"] for a in absences] == [True, False]

    def test_clockodo_education(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(6) == "education"

    def test_clockodo_home_office(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(8) == "other"
        assert provider.normalize_absence_type(9) == "other"

    def test_clockodo_unknown_type(self):
        provider = ClockodoProvider({"api_user": "x", "api_key": "y"})
        assert provider.normalize_absence_type(999) == "other"


# ---- Model ----

class TestAbsenceReportModel:
    def test_create(self, db, tenant):
        report = AbsenceReport.objects.create(
            tenant=tenant,
            year=2026,
            month=2,
        )
        assert str(report) == "Absence Report 2026-02 (Draft)"
        assert report.status == AbsenceReport.Status.DRAFT

    def test_unique_constraint(self, db, tenant):
        AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)
        with pytest.raises(Exception):
            AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)

    def test_entry_creation(self, db, tenant):
        report = AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)
        entry = AbsenceReportEntry.objects.create(
            tenant=tenant,
            report=report,
            user_name="Alice",
            external_user_id="123",
            absence_type="sick",
            date_from=date(2026, 2, 3),
            date_to=date(2026, 2, 5),
            days_count=Decimal("3.00"),
            raw_data={"type": 1, "status": 1},
        )
        assert str(entry) == "Alice: Sick (2026-02-03 - 2026-02-05)"
        assert report.entries.count() == 1


# ---- Service ----

def _make_mock_provider(absences=None, users=None):
    """Create a mock provider with given absences and users."""
    provider = MagicMock()
    provider.get_absences.return_value = absences or []
    provider.get_users.return_value = users or []
    # Use real Clockodo mapping for normalize_absence_type
    clockodo = ClockodoProvider({"api_user": "x", "api_key": "y"})
    provider.normalize_absence_type.side_effect = clockodo.normalize_absence_type
    return provider


class TestAbsenceReportService:
    def test_generate_report_basic(self, db, tenant):
        """Generate a report with one sick absence."""
        provider = _make_mock_provider(
            absences=[{
                "user_id": "1",
                "date_since": "2026-02-03",
                "date_until": "2026-02-05",
                "count_days": 3,
                "type": 4,  # sick
                "status": 1,  # approved
            }],
            users=[{"id": "1", "name": "Alice"}],
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, '_get_provider', return_value=provider):
            report = service.generate_report(2026, 2)

        assert report.year == 2026
        assert report.month == 2
        assert report.status == AbsenceReport.Status.DRAFT
        assert report.entries.count() == 1
        entry = report.entries.first()
        assert entry.user_name == "Alice"
        assert entry.absence_type == "sick"
        assert entry.days_count == Decimal("3.00")

    def test_generate_splits_sick_by_sick_note(self, db, tenant):
        """Krank mit und ohne AU landen als getrennte Arten im Report."""
        provider = _make_mock_provider(
            absences=[
                {"user_id": "1", "date_since": "2026-02-02", "date_until": "2026-02-02",
                 "count_days": 1, "type": 4, "status": 1, "sick_note": False},
                {"user_id": "1", "date_since": "2026-02-03", "date_until": "2026-02-05",
                 "count_days": 3, "type": 4, "status": 1, "sick_note": True},
                {"user_id": "1", "date_since": "2026-02-10", "date_until": "2026-02-10",
                 "count_days": 1, "type": 5, "status": 1, "sick_note": True},
            ],
            users=[{"id": "1", "name": "Alice"}],
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, '_get_provider', return_value=provider):
            report = service.generate_report(2026, 2)

        by_type = {e.absence_type: e.days_count for e in report.entries.all()}
        assert by_type == {
            "sick": Decimal("1.00"),
            "sick_certificate": Decimal("3.00"),
            "sick_child_certificate": Decimal("1.00"),
        }

    def test_generate_dedup_across_sick_note(self, db, tenant):
        """Ein Einzeltag ohne AU innerhalb eines AU-Zeitraums zaehlt nicht doppelt."""
        provider = _make_mock_provider(
            absences=[
                {"user_id": "1", "date_since": "2026-02-03", "date_until": "2026-02-05",
                 "count_days": 3, "type": 4, "status": 1, "sick_note": True},
                {"user_id": "1", "date_since": "2026-02-03", "date_until": "2026-02-03",
                 "count_days": 1, "type": 4, "status": 1, "sick_note": False},
            ],
            users=[{"id": "1", "name": "Alice"}],
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, '_get_provider', return_value=provider):
            report = service.generate_report(2026, 2)

        assert report.entries.count() == 1
        assert report.entries.first().absence_type == "sick_certificate"

    def test_generate_excludes_declined(self, db, tenant):
        """Declined absences are excluded."""
        provider = _make_mock_provider(
            absences=[{
                "user_id": "1",
                "date_since": "2026-02-03",
                "date_until": "2026-02-05",
                "count_days": 3,
                "type": 1,
                "status": 2,  # declined
            }],
            users=[{"id": "1", "name": "Alice"}],
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, '_get_provider', return_value=provider):
            report = service.generate_report(2026, 2)

        assert report.entries.count() == 0

    def test_generate_excludes_home_office(self, db, tenant):
        """Home office (type=8) is excluded."""
        provider = _make_mock_provider(
            absences=[{
                "user_id": "1",
                "date_since": "2026-02-03",
                "date_until": "2026-02-05",
                "count_days": 3,
                "type": 8,  # home office
                "status": 1,
            }],
            users=[{"id": "1", "name": "Alice"}],
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, '_get_provider', return_value=provider):
            report = service.generate_report(2026, 2)

        assert report.entries.count() == 0

    def test_generate_prorates_cross_month(self, db, tenant):
        """Absence spanning Jan 28 - Feb 3 is pro-rated for February."""
        provider = _make_mock_provider(
            absences=[{
                "user_id": "1",
                "date_since": "2026-01-28",
                "date_until": "2026-02-03",
                "count_days": 5,  # 5 working days across 7 calendar days
                "type": 1,
                "status": 1,
            }],
            users=[{"id": "1", "name": "Alice"}],
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, '_get_provider', return_value=provider):
            report = service.generate_report(2026, 2)

        assert report.entries.count() == 1
        entry = report.entries.first()
        # Werktage: Mi-Fr im Januar, Mo+Di im Februar -> 2 (nicht 5 * 3/7 = 2.14)
        assert entry.days_count == Decimal("2.00")
        assert entry.date_from == date(2026, 2, 1)
        assert entry.date_to == date(2026, 2, 3)

    def test_prorate_rounds_to_half_days(self):
        """Mit Feiertag im Zeitraum (count_days < Werktage) bleibt es bei halben Tagen."""
        from apps.contracts.services.absence_report import prorate_absence_days
        # Mo 28.12.2026 - Fr 08.01.2027: 10 Werktage, 9 gebucht (Neujahr), 4 im Dezember
        days = prorate_absence_days(9, date(2026, 12, 28), date(2027, 1, 8), date(2026, 12, 1), date(2026, 12, 31))
        assert days == 3.5  # 9 * 4/10 = 3.6
        assert days * 2 == int(days * 2)

    def test_cannot_regenerate_finalized_without_permission(self, db, tenant):
        """Cannot regenerate a finalized report without allow_reset_finalized."""
        AbsenceReport.objects.create(
            tenant=tenant, year=2026, month=2,
            status=AbsenceReport.Status.FINALIZED,
        )

        service = AbsenceReportService(tenant)
        with pytest.raises(ValueError, match="already finalized"):
            service.generate_report(2026, 2)

    def test_regenerate_finalized_with_permission_resets_status(self, db, tenant):
        """Regenerating a finalized report with allow_reset_finalized resets to draft."""
        report = AbsenceReport.objects.create(
            tenant=tenant, year=2026, month=2,
            status=AbsenceReport.Status.FINALIZED,
        )

        service = AbsenceReportService(tenant)
        # Will reset to draft, then fail on provider — but status should be reset
        try:
            service.generate_report(2026, 2, allow_reset_finalized=True)
        except ValueError as e:
            if "provider" in str(e):
                pass  # Expected — no provider in test
            else:
                raise

        report.refresh_from_db()
        assert report.status == AbsenceReport.Status.DRAFT

    def test_regenerate_draft_replaces_entries(self, db, tenant):
        """Regenerating a draft replaces old entries."""
        report = AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)
        AbsenceReportEntry.objects.create(
            tenant=tenant, report=report, user_name="Old",
            external_user_id="99", absence_type="sick",
            date_from=date(2026, 2, 1), date_to=date(2026, 2, 1),
            days_count=Decimal("1"),
        )

        provider = _make_mock_provider(
            absences=[{
                "user_id": "1",
                "date_since": "2026-02-10",
                "date_until": "2026-02-12",
                "count_days": 3,
                "type": 1,
                "status": 1,
            }],
            users=[{"id": "1", "name": "Bob"}],
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, '_get_provider', return_value=provider):
            updated = service.generate_report(2026, 2)

        assert updated.id == report.id
        assert updated.entries.count() == 1
        assert updated.entries.first().user_name == "Bob"

    def test_render_html_german(self, db, tenant):
        """German HTML rendering contains expected labels."""
        report = AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)
        AbsenceReportEntry.objects.create(
            tenant=tenant, report=report, user_name="Alice",
            external_user_id="1", absence_type="sick",
            date_from=date(2026, 2, 3), date_to=date(2026, 2, 5),
            days_count=Decimal("3.00"),
        )

        service = AbsenceReportService(tenant)
        html = service.render_html(report, language="de")
        assert "Fehlzeiten-Report" in html
        assert "Februar" in html
        assert "Alice" in html
        assert "Krank ohne AU" in html

    def test_render_html_days_by_type(self, db, tenant):
        """Je Mitarbeiter und gesamt stehen die Fehltage nach Art, AU getrennt."""
        report = AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)
        for name, uid, absence_type, day, days in [
            ("Alice", "1", "sick", 2, "1.00"),
            ("Alice", "1", "sick_certificate", 3, "3.00"),
            ("Bob", "2", "sick_certificate", 9, "2.00"),
            ("Bob", "2", "vacation", 16, "5.00"),
        ]:
            AbsenceReportEntry.objects.create(
                tenant=tenant, report=report, user_name=name,
                external_user_id=uid, absence_type=absence_type,
                date_from=date(2026, 2, day), date_to=date(2026, 2, day),
                days_count=Decimal(days),
            )

        service = AbsenceReportService(tenant)
        grouped = service._build_grouped_entries(report, "de")
        alice = next(g for g in grouped if g["user_name"] == "Alice")
        assert [(t["type_label"], t["days"]) for t in alice["days_by_type"]] == [
            ("Krank mit AU", Decimal("3.00")),
            ("Krank ohne AU", Decimal("1.00")),
        ]
        bob = next(g for g in grouped if g["user_name"] == "Bob")
        assert [(t["type_label"], t["days"]) for t in bob["days_by_type"]] == [
            ("Krank mit AU", Decimal("2.00")),
            ("Krank ohne AU", Decimal("0")),
            ("Urlaub", Decimal("5.00")),
        ]
        totals = service._days_by_type((e for g in grouped for e in g["entries"]), ABSENCE_LABELS["de"])
        assert [(t["type_label"], t["days"]) for t in totals] == [
            ("Krank mit AU", Decimal("5.00")),
            ("Krank ohne AU", Decimal("1.00")),
            ("Urlaub", Decimal("5.00")),
        ]

        html = service.render_html(report, language="de")
        assert "Fehltage nach Art" in html
        assert "Krank mit AU" in html

    def test_render_html_english(self, db, tenant):
        """English HTML rendering contains expected labels."""
        report = AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)
        AbsenceReportEntry.objects.create(
            tenant=tenant, report=report, user_name="Alice",
            external_user_id="1", absence_type="sick_child",
            date_from=date(2026, 2, 10), date_to=date(2026, 2, 11),
            days_count=Decimal("2.00"),
        )

        service = AbsenceReportService(tenant)
        html = service.render_html(report, language="en")
        assert "Absence Report" in html
        assert "February" in html
        assert "Alice" in html
        assert "Sick child, no certificate" in html

    def test_finalize_report(self, db, tenant, user):
        """Finalizing locks the report."""
        report = AbsenceReport.objects.create(tenant=tenant, year=2026, month=3)
        AbsenceReportEntry.objects.create(
            tenant=tenant, report=report, user_name="Alice",
            external_user_id="1", absence_type="vacation",
            date_from=date(2026, 3, 1), date_to=date(2026, 3, 5),
            days_count=Decimal("5.00"),
        )

        service = AbsenceReportService(tenant)
        with patch.object(service, 'generate_pdf', return_value=b'%PDF-fake'):
            finalized = service.finalize_report(report.id, user)

        assert finalized.status == AbsenceReport.Status.FINALIZED
        assert finalized.finalized_at is not None
        assert finalized.finalized_by == user
        assert finalized.pdf_file

    def test_cannot_finalize_twice(self, db, tenant, user):
        """Cannot finalize an already finalized report."""
        report = AbsenceReport.objects.create(
            tenant=tenant, year=2026, month=3,
            status=AbsenceReport.Status.FINALIZED,
        )

        service = AbsenceReportService(tenant)
        with pytest.raises(ValueError, match="already finalized"):
            service.finalize_report(report.id, user)

    @patch("apps.core.m365.send_mail")
    def test_send_report(self, mock_send_mail, db, tenant):
        """Send a finalized report."""
        mock_send_mail.return_value = "msg-123"
        report = AbsenceReport.objects.create(
            tenant=tenant, year=2026, month=2,
            status=AbsenceReport.Status.FINALIZED,
        )
        report.pdf_file.save("test.pdf", ContentFile(b"%PDF-fake"), save=True)

        service = AbsenceReportService(tenant)
        result = service.send_report(report.id, ["hr@example.com"])
        assert result is True
        mock_send_mail.assert_called_once()

    def test_cannot_send_draft(self, db, tenant):
        """Cannot send a draft report."""
        report = AbsenceReport.objects.create(tenant=tenant, year=2026, month=2)

        service = AbsenceReportService(tenant)
        with pytest.raises(ValueError, match="finalized"):
            service.send_report(report.id, ["hr@example.com"])


# ---- Failure propagation ----


class TestAbsenceReportSendFailure:
    """A failed send must reach the caller, not only the log.

    An expired M365 client secret went unnoticed for five weeks because
    send_report swallowed the error and "send now" reported success anyway.
    """

    @patch("apps.core.m365.send_mail")
    def test_send_report_propagates_m365_error(self, mock_send_mail, db, tenant):
        from apps.core.m365 import M365Error

        mock_send_mail.side_effect = M365Error("Authentication failed: keys are expired")
        report = AbsenceReport.objects.create(
            tenant=tenant, year=2026, month=2,
            status=AbsenceReport.Status.FINALIZED,
        )
        report.pdf_file.save("test.pdf", ContentFile(b"%PDF-fake"), save=True)

        service = AbsenceReportService(tenant)
        with pytest.raises(M365Error, match="keys are expired"):
            service.send_report(report.id, ["hr@example.com"])

    @patch("apps.core.m365.send_mail")
    def test_send_report_now_reports_the_reason(self, mock_send_mail, db, tenant, user):
        """The "send now" mutation must not claim success when nothing was sent."""
        from unittest.mock import Mock

        from apps.core.context import Context
        from apps.core.m365 import M365Error
        from apps.tenants.models import ReportSchedule
        from config.schema import schema

        mock_send_mail.side_effect = M365Error("Authentication failed: keys are expired")
        ReportSchedule.objects.create(
            tenant=tenant, report_type="absence", enabled=True,
            recipients=["hr@example.com"], auto_finalize=True,
        )
        report = AbsenceReport.objects.create(
            tenant=tenant, year=2026, month=2,
            status=AbsenceReport.Status.FINALIZED,
        )
        report.pdf_file.save("test.pdf", ContentFile(b"%PDF-fake"), save=True)

        result = schema.execute_sync(
            """
            mutation($reportType: String!, $year: Int!, $month: Int!) {
                sendReportNow(reportType: $reportType, year: $year, month: $month) {
                    success
                    error
                }
            }
            """,
            variable_values={"reportType": "absence", "year": 2026, "month": 2},
            context_value=Context(request=Mock(), user=user),
        )

        assert result.errors is None
        payload = result.data["sendReportNow"]
        assert payload["success"] is False
        assert "keys are expired" in payload["error"]


class TestSendAbsenceReportToUser:
    """Report per Knopf an einen Benutzer schicken, der Abwesenheiten sehen darf."""

    QUERY = "{ absenceReportRecipients { id name email } }"
    MUTATION = """
        mutation($reportId: ID!, $userId: ID!) {
            sendAbsenceReportToUser(reportId: $reportId, userId: $userId) { success error }
        }
    """

    @staticmethod
    def _execute(query, user, variables=None):
        from unittest.mock import Mock

        from apps.core.context import Context
        from config.schema import schema

        return schema.execute_sync(
            query, variable_values=variables, context_value=Context(request=Mock(), user=user),
        )

    @staticmethod
    def _make_user(tenant, email, role_name=None, active=True, perms=None):
        from apps.tenants.models import Role, User

        u = User.objects.create_user(
            email=email, password="x", tenant=tenant, first_name=email.split("@")[0], is_active=active,
        )
        if role_name:
            u.roles.add(Role.objects.get(tenant=tenant, name=role_name))
        if perms is not None:
            role = Role.objects.create(tenant=tenant, name=f"r-{email}", permissions=perms)
            u.roles.add(role)
        return u

    @staticmethod
    def _finalized_report(tenant):
        report = AbsenceReport.objects.create(
            tenant=tenant, year=2026, month=9, status=AbsenceReport.Status.FINALIZED,
        )
        report.pdf_file.save("test.pdf", ContentFile(b"%PDF-fake"), save=True)
        return report

    def test_recipients_only_users_who_may_read_absences(self, db, tenant, user):
        from apps.tenants.models import Tenant

        self._make_user(tenant, "hr@example.com", perms={"department_analysis.read": True})
        self._make_user(tenant, "sales@example.com", perms={"contracts.read": True})
        self._make_user(tenant, "gone@example.com", perms={"department_analysis.read": True}, active=False)
        other = Tenant.objects.create(name="Other", currency="EUR")
        self._make_user(other, "foreign@example.com", perms={"department_analysis.read": True})

        result = self._execute(self.QUERY, user)

        assert result.errors is None
        emails = {r["email"] for r in result.data["absenceReportRecipients"]}
        assert "hr@example.com" in emails
        assert "test@example.com" in emails  # Admin darf lesen
        assert not emails & {"sales@example.com", "gone@example.com", "foreign@example.com"}

    def test_recipients_require_send_permission(self, db, tenant):
        reader = self._make_user(tenant, "hr@example.com", perms={"department_analysis.read": True})
        result = self._execute(self.QUERY, reader)
        assert result.errors

    @patch("apps.core.m365.send_mail")
    def test_send_to_user_with_read_permission(self, mock_send_mail, db, tenant, user):
        hr = self._make_user(tenant, "hr@example.com", perms={"department_analysis.read": True})
        report = self._finalized_report(tenant)

        result = self._execute(self.MUTATION, user, {"reportId": str(report.id), "userId": str(hr.id)})

        assert result.errors is None
        assert result.data["sendAbsenceReportToUser"] == {"success": True, "error": None}
        assert mock_send_mail.call_args.kwargs["to"] == ["hr@example.com"]

    @patch("apps.core.m365.send_mail")
    def test_send_refused_without_read_permission(self, mock_send_mail, db, tenant, user):
        sales = self._make_user(tenant, "sales@example.com", perms={"contracts.read": True})
        report = self._finalized_report(tenant)

        result = self._execute(self.MUTATION, user, {"reportId": str(report.id), "userId": str(sales.id)})

        assert result.data["sendAbsenceReportToUser"]["success"] is False
        mock_send_mail.assert_not_called()

    @patch("apps.core.m365.send_mail")
    def test_send_refused_for_other_tenant(self, mock_send_mail, db, tenant, user):
        from apps.tenants.models import Tenant

        other = Tenant.objects.create(name="Other", currency="EUR")
        foreign = self._make_user(other, "foreign@example.com", perms={"department_analysis.read": True})
        report = self._finalized_report(tenant)

        result = self._execute(self.MUTATION, user, {"reportId": str(report.id), "userId": str(foreign.id)})

        assert result.data["sendAbsenceReportToUser"]["success"] is False
        mock_send_mail.assert_not_called()

    @patch("apps.core.m365.send_mail")
    def test_send_reports_mail_failure(self, mock_send_mail, db, tenant, user):
        from apps.core.m365 import M365Error

        mock_send_mail.side_effect = M365Error("keys are expired")
        hr = self._make_user(tenant, "hr@example.com", perms={"department_analysis.read": True})
        report = self._finalized_report(tenant)

        result = self._execute(self.MUTATION, user, {"reportId": str(report.id), "userId": str(hr.id)})

        payload = result.data["sendAbsenceReportToUser"]
        assert payload["success"] is False
        assert "keys are expired" in payload["error"]
