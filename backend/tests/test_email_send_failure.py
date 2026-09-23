"""Ein fehlgeschlagener Mailversand muss am Dokument stehen, nicht nur im Log.

Anlass: Vom 17.08. bis 21.09.2026 verschickte die Anwendung keine Mail, weil das
Entra-Secret abgelaufen war - und an keinem Beleg war zu sehen, warum. Die vier
Versandpfade laufen als Celery-Task; eine Ausnahme saehe dort niemand, also
gehoert der Grund an den Beleg.

Siehe openspec/changes/email-send-failure-visible/.
"""
from datetime import date
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.core.email_state import (
    MAX_ERROR_LENGTH,
    record_send_failure,
    record_send_success,
)
from apps.core.m365 import M365Error
from apps.customers.models import Customer
from apps.invoices.models import InvoiceRecord


@pytest.fixture
def customer(db, tenant):
    return Customer.objects.create(tenant=tenant, name="Testkunde", is_active=True)


@pytest.fixture
def invoice(db, tenant, customer):
    return InvoiceRecord.objects.create(
        tenant=tenant,
        customer=customer,
        invoice_number="INV-TEST-001",
        billing_date=date(2026, 9, 1),
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        total_net=100,
        tax_rate=19,
        tax_amount=19,
        total_gross=119,
        line_items_snapshot=[],
        company_data_snapshot={},
    )


class TestRecordSendFailure:
    def test_grund_und_zeitpunkt_landen_am_beleg(self, invoice):
        record_send_failure(invoice, M365Error("AADSTS7000222: client secret expired"))

        invoice.refresh_from_db()
        assert "AADSTS7000222" in invoice.email_error
        assert invoice.email_last_attempt_at is not None

    def test_gescheiterter_versuch_macht_keine_zustellung_rueckgaengig(self, invoice):
        """Ein spaeterer Fehlschlag darf eine frueher zugestellte Mail nicht tilgen."""
        invoice.email_sent_at = timezone.now()
        invoice.save(update_fields=["email_sent_at"])

        record_send_failure(invoice, M365Error("boom"))

        invoice.refresh_from_db()
        assert invoice.email_sent_at is not None
        assert invoice.email_error == "boom"

    def test_ungewoehnlich_langer_grund_wird_gekuerzt(self, invoice):
        record_send_failure(invoice, M365Error("x" * (MAX_ERROR_LENGTH + 500)))

        invoice.refresh_from_db()
        assert len(invoice.email_error) == MAX_ERROR_LENGTH

    def test_frisches_dokument_traegt_keinen_fehler(self, invoice):
        assert invoice.email_error == ""
        assert invoice.email_last_attempt_at is None


class TestRecordSendSuccess:
    def test_erfolg_raeumt_den_alten_fehler_ab(self, invoice):
        """Sonst klebt an einer zugestellten Rechnung der Fehler des ersten Versuchs."""
        record_send_failure(invoice, M365Error("erster Versuch ging schief"))

        record_send_success(invoice)

        invoice.refresh_from_db()
        assert invoice.email_error == ""
        assert invoice.email_last_attempt_at is not None

    def test_gibt_die_gesetzten_felder_zurueck(self, invoice):
        fields = record_send_success(
            invoice, extra_fields=["email_sent_at"], save=False
        )
        assert fields == ["email_sent_at", "email_error", "email_last_attempt_at"]


class TestInvoiceTaskWritesFailure:
    """Der Versandpfad selbst, nicht nur der Helfer."""

    @patch("apps.core.m365.send_mail")
    def test_task_haelt_den_grund_fest(self, mock_send_mail, db, tenant, invoice):
        from django.core.files.base import ContentFile

        from apps.invoices.tasks import send_invoice_email_task

        mock_send_mail.side_effect = M365Error("AADSTS7000222: client secret expired")
        invoice.status = InvoiceRecord.Status.FINALIZED
        invoice.pdf_file.save("test.pdf", ContentFile(b"%PDF-fake"), save=True)
        invoice.customer.billing_emails = ["kunde@example.com"]
        invoice.customer.save(update_fields=["billing_emails"])

        result = send_invoice_email_task(invoice.id)

        assert result is False
        invoice.refresh_from_db()
        assert "AADSTS7000222" in invoice.email_error
        assert invoice.email_last_attempt_at is not None
        assert invoice.email_sent_at is None


class TestGraphQLExposesSendFailure:
    """Was das Backend nicht ausliefert, kann die Oberflaeche nicht zeigen."""

    def test_rechnung_liefert_fehler_und_zeitpunkt(self, db, tenant, user, invoice):
        from unittest.mock import Mock

        from apps.core.context import Context
        from config.schema import schema

        record_send_failure(invoice, M365Error("AADSTS7000222: client secret expired"))

        result = schema.execute_sync(
            """
            query ($id: Int!) {
              invoiceRecord(id: $id) {
                id
                emailError
                emailLastAttemptAt
                emailSentAt
              }
            }
            """,
            variable_values={"id": invoice.id},
            context_value=Context(request=Mock(), user=user),
        )

        assert result.errors is None, result.errors
        data = result.data["invoiceRecord"]
        assert "AADSTS7000222" in data["emailError"]
        assert data["emailLastAttemptAt"] is not None
        assert data["emailSentAt"] is None

    def test_frische_rechnung_liefert_leeren_fehler(self, db, tenant, user, invoice):
        from unittest.mock import Mock

        from apps.core.context import Context
        from config.schema import schema

        result = schema.execute_sync(
            "query ($id: Int!) { invoiceRecord(id: $id) { emailError emailLastAttemptAt } }",
            variable_values={"id": invoice.id},
            context_value=Context(request=Mock(), user=user),
        )

        assert result.errors is None, result.errors
        assert result.data["invoiceRecord"]["emailError"] == ""
        assert result.data["invoiceRecord"]["emailLastAttemptAt"] is None

    def test_felder_stehen_an_allen_vier_typen_im_schema(self):
        """Der Durchstich oben deckt die Rechnung ab; hier die drei uebrigen."""
        from config.schema import schema

        sdl = schema.as_str()
        for typ in ("InvoiceRecordType", "OfferRecordType",
                    "PaymentReminderType", "OrderConfirmationType"):
            start = sdl.index("type %s " % typ)
            block = sdl[start:sdl.index("\n}", start)]
            assert "emailError" in block, "%s ohne emailError" % typ
            assert "emailLastAttemptAt" in block, "%s ohne emailLastAttemptAt" % typ
