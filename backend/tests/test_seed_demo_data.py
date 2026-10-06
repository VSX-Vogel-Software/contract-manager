"""Tests fuer das Demo-Daten-Kommando (Layout-Tests mobil)."""
from io import StringIO

import pytest
from django.core.management import call_command

from apps.banking.models import BankTransaction, IncomingInvoice, InvoiceInbox
from apps.contracts.models import (
    AbsenceReport,
    Contract,
    ContractAmendment,
    ContractAttachment,
    ContractComment,
    ContractItem,
    DashboardKpiSnapshot,
)
from apps.contracts.order_confirmation_models import OrderConfirmation
from apps.customers.models import Customer, CustomerAttachment
from apps.invoices.models import ImportedInvoice, InvoiceImportBatch, InvoicePaymentMatch, InvoiceRecord
from apps.offers.models import OfferRecord
from apps.products.models import Product
from apps.tenants.management.commands.seed_demo_data import FRONTEND_PERMISSIONS
from apps.tenants.models import APIKey, User
from apps.todos.models import TodoItem


def _counts():
    return {
        "customers": Customer.objects.filter(netsuite_customer_number__startswith="DEMO-K-").count(),
        "products": Product.objects.filter(sku__startswith="DEMO-P-").count(),
        "contracts": Contract.objects.filter(po_number__startswith="DEMO-PO-").count(),
        "items": ContractItem.objects.filter(contract__po_number__startswith="DEMO-PO-").count(),
        "amendments": ContractAmendment.objects.count(),
        "invoices": InvoiceRecord.objects.filter(invoice_number__startswith="DEMO-").count(),
        "offers": OfferRecord.objects.filter(offer_number__startswith="DEMO-AN-").count(),
        "todos": TodoItem.objects.count(),
        "transactions": BankTransaction.objects.count(),
        "incoming": IncomingInvoice.objects.count(),
        "imported": ImportedInvoice.objects.filter(invoice_number__startswith="DEMO-IMP-").count(),
        "batches": InvoiceImportBatch.objects.count(),
        "payment_matches": InvoicePaymentMatch.objects.count(),
        "order_confirmations": OrderConfirmation.objects.count(),
        "contract_attachments": ContractAttachment.objects.count(),
        "customer_attachments": CustomerAttachment.objects.count(),
        "comments": ContractComment.objects.count(),
        "inboxes": InvoiceInbox.objects.count(),
        "api_keys": APIKey.objects.count(),
        "absence_reports": AbsenceReport.objects.count(),
        "kpi_snapshots": DashboardKpiSnapshot.objects.filter(metrics__source="DEMO-SEED").count(),
    }


@pytest.fixture
def media_tmp(settings, tmp_path):
    # Eingangsrechnungen schreiben ein PDF; nicht ins echte media/ legen.
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


@pytest.mark.django_db
class TestSeedDemoData:
    def test_seeds_once_and_is_idempotent(self, media_tmp):
        call_command("seed_demo_data", stdout=StringIO())
        first = _counts()

        assert first["customers"] == 40
        assert first["products"] == 25
        assert first["contracts"] == 60
        assert first["invoices"] >= 30
        assert first["offers"] == 11
        assert first["todos"] == 20
        assert first["amendments"] > 0
        assert first["incoming"] == 5
        assert first["kpi_snapshots"] == 5
        assert Customer.objects.filter(name__startswith="Gebrüder Müller-Lüdenscheidt").exists()

        call_command("seed_demo_data", stdout=StringIO())
        assert _counts() == first

    def test_seeds_records_for_detail_routes(self, media_tmp):
        call_command("seed_demo_data", stdout=StringIO())

        imported = {
            inv.invoice_number: inv
            for inv in ImportedInvoice.objects.filter(invoice_number__startswith="DEMO-IMP-")
        }
        assert len(imported) == 3
        no_customer, no_contract, paid = (imported[k] for k in sorted(imported))
        assert no_customer.customer_id is None and no_customer.customer_name
        assert no_contract.customer_id is not None and no_contract.contract_id is None
        assert paid.extraction_status == "paid" and paid.is_paid
        assert all(inv.pdf_file and inv.import_batch_id for inv in imported.values())
        assert InvoiceImportBatch.objects.get().total_uploaded == 3

        offer = OfferRecord.objects.get(offer_number__endswith="-PDF1")
        assert offer.status == "draft" and offer.pdf_file

        ab = OrderConfirmation.objects.get()
        assert ab.contract.status == "active" and ab.pdf_file
        contract = ab.contract
        assert contract.comments.count() > 3

        attachment = ContractAttachment.objects.get(contract=contract)
        assert attachment.content_type == "application/pdf"
        assert (media_tmp / attachment.file.name).read_bytes().startswith(b"%PDF")
        assert CustomerAttachment.objects.filter(customer=contract.customer).exists()

        inbox = InvoiceInbox.objects.get()
        assert not inbox.is_active and not inbox.password and not inbox.username

        key = APIKey.objects.get()
        assert key.user.email == "admin@test.local" and key.is_valid

        report = AbsenceReport.objects.get()
        assert report.status == "finalized" and report.pdf_file
        assert report.entries.count() > 0

    def test_admin_gets_every_frontend_permission(self, media_tmp):
        call_command("seed_demo_data", stdout=StringIO())

        admin = User.objects.get(email="admin@test.local")
        assert set(FRONTEND_PERMISSIONS) <= admin.effective_permissions

    def test_reset_recreates_only_demo_data(self, media_tmp):
        call_command("seed_demo_data", stdout=StringIO())
        before = _counts()
        e2e = Customer.objects.get(name="E2E Overdue Customer")

        call_command("seed_demo_data", "--reset", stdout=StringIO())

        assert _counts() == before
        assert Customer.objects.filter(pk=e2e.pk).exists()
