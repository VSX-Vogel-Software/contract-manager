"""Query-Anzahl und Cache-Invalidierung der Contracts-App (Performance-Audit 10/2026).

- Vertragsdetail, Forecast und Dashboard-Kacheln brauchen gleich viele Queries,
  egal wie viele Positionen bzw. Vertraege es gibt (kein N+1).
- Der Versionszaehler des Forecast-Caches steigt nur bei relevanten Feldern.
- dashboardKpiTrends verwendet das (gecachte) Ergebnis von dashboardKpis.
"""
from datetime import date
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.contracts import forecast_cache
from apps.contracts.forecast_cache import (
    DASHBOARD_KPIS_PREFIX,
    KPI_TRENDS_PREFIX,
    get_cached_forecast,
    invalidate_tenant_forecast,
    set_cached_forecast,
)
from apps.contracts.kpi_trends import calculate_kpi_trends, capture_snapshot, get_dashboard_kpis
from apps.contracts.models import Contract, ContractItem, ContractItemPrice
from apps.contracts.schema import calculate_contract_total_value, calculate_dashboard_kpis
from apps.core.context import Context
from apps.customers.models import Customer
from apps.invoices.models import ImportedInvoice, InvoiceRecord
from config.schema import schema


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def customer(db, tenant):
    return Customer.objects.create(tenant=tenant, name="Kunde", is_active=True)


def make_contract(tenant, customer, name="Vertrag", start=date(2025, 1, 1), **kwargs):
    return Contract.objects.create(
        tenant=tenant,
        customer=customer,
        name=name,
        status=Contract.Status.ACTIVE,
        start_date=start,
        billing_start_date=start,
        billing_interval=Contract.BillingInterval.MONTHLY,
        **kwargs,
    )


def make_item(tenant, contract, price="100.00", *, with_period=True, **kwargs):
    item = ContractItem.objects.create(
        tenant=tenant,
        contract=contract,
        description="Lizenz",
        quantity=1,
        unit_price=Decimal(price),
        price_period="monthly",
        start_date=contract.start_date,
        **kwargs,
    )
    if with_period:
        ContractItemPrice.objects.create(
            tenant=tenant,
            item=item,
            valid_from=date(2025, 1, 1),
            unit_price=Decimal(price) + 10,
            price_period="monthly",
        )
    return item


def count_queries(func) -> int:
    with CaptureQueriesContext(connection) as ctx:
        func()
    return len(ctx.captured_queries)


def execute(query, user, variables=None):
    result = schema.execute_sync(
        query, variable_values=variables or {}, context_value=Context(request=Mock(), user=user)
    )
    assert result.errors is None, result.errors
    return result.data


def version(tenant, prefix="forecast") -> str:
    return forecast_cache._current_version(tenant.id, prefix)


# ----------------------------------------------------------------
# Query-Anzahl konstant
# ----------------------------------------------------------------

CONTRACT_DETAIL_QUERY = """
    query Detail($id: ID!) {
        contract(id: $id) {
            id
            totalValue
            monthlyRecurringValue
            arr
            items {
                id
                effectivePrice
                effectivePricePeriod
                movedFromItemId
                movedFromContractName
                movedToContractName
                pricePeriods { id unitPrice }
            }
        }
    }
"""


@pytest.mark.django_db
class TestConstantQueryCount:
    def test_contract_detail_independent_of_item_count(self, user, tenant, customer):
        small = make_contract(tenant, customer, "Klein")
        make_item(tenant, small)

        large = make_contract(tenant, customer, "Gross")
        source = make_contract(tenant, customer, "Quelle")
        for i in range(6):
            item = make_item(tenant, large, price=f"{100 + i}.00", is_one_off=(i % 2 == 0))
            if i == 1:
                # Position, die aus einem anderen Vertrag verschoben wurde (moved_from)
                origin = make_item(tenant, source, with_period=False)
                origin.moved_to = item
                origin.save()

        # Aufwaermen: erster Aufruf laedt Rollen/Rechte des Users einmalig
        execute(CONTRACT_DETAIL_QUERY, user, {"id": small.id})
        n_small = count_queries(lambda: execute(CONTRACT_DETAIL_QUERY, user, {"id": small.id}))
        n_large = count_queries(lambda: execute(CONTRACT_DETAIL_QUERY, user, {"id": large.id}))

        assert n_large == n_small
        data = execute(CONTRACT_DETAIL_QUERY, user, {"id": large.id})["contract"]
        assert any(i["movedFromContractName"] == "Quelle" for i in data["items"])
        # Effektiver Preis kommt aus der Preisperiode (Basispreis + 10)
        assert {Decimal(i["effectivePrice"]) for i in data["items"]} == {Decimal(110 + i) for i in range(6)}

    @pytest.mark.parametrize("field", ["revenueForecast", "recognitionForecast"])
    def test_forecast_independent_of_contract_count(self, user, tenant, customer, field):
        query = f"""
            query {{ {field}(months: 12, view: "monthly", refresh: true) {{ grandTotal }} }}
        """
        make_item(tenant, make_contract(tenant, customer, "V0"))
        execute(query, user)  # Aufwaermen (Rollen/Rechte des Users)
        n_one = count_queries(lambda: execute(query, user))

        for i in range(1, 6):
            contract = make_contract(tenant, customer, f"V{i}")
            make_item(tenant, contract)
            make_item(tenant, contract, is_one_off=True)
        n_many = count_queries(lambda: execute(query, user))

        assert n_many == n_one

    def test_dashboard_kpis_independent_of_one_off_items(self, tenant, customer):
        contract = make_contract(tenant, customer)
        make_item(tenant, contract, is_one_off=True)
        n_one = count_queries(lambda: calculate_dashboard_kpis(tenant))

        for _ in range(5):
            make_item(tenant, contract, is_one_off=True)
        n_many = count_queries(lambda: calculate_dashboard_kpis(tenant))

        assert n_many == n_one

    def test_total_value_uses_prefetched_items(self, tenant, customer):
        contract = make_contract(tenant, customer)
        for _ in range(3):
            make_item(tenant, contract)
            make_item(tenant, contract, is_one_off=True)
        expected = calculate_contract_total_value(contract)

        prefetched = Contract.objects.prefetch_related("items__price_periods").get(pk=contract.pk)
        with CaptureQueriesContext(connection) as ctx:
            assert calculate_contract_total_value(prefetched) == expected
        assert len(ctx.captured_queries) == 0

    def test_effective_price_info_without_prefetch_unchanged(self, tenant, customer):
        item = make_item(tenant, make_contract(tenant, customer), price="50.00")
        ContractItemPrice.objects.create(
            tenant=tenant, item=item, valid_from=date(2025, 6, 1), valid_to=date(2025, 6, 30),
            unit_price=Decimal("75.00"), price_period="quarterly",
        )
        fresh = ContractItem.objects.get(pk=item.pk)
        prefetched = ContractItem.objects.prefetch_related("price_periods").get(pk=item.pk)

        for day in (date(2024, 12, 31), date(2025, 3, 1), date(2025, 6, 15), date(2025, 7, 1)):
            assert prefetched.get_effective_price_info(day) == fresh.get_effective_price_info(day)
            assert prefetched.get_price_at(day) == fresh.get_price_at(day)
        assert prefetched.get_effective_price_info(date(2025, 6, 15)) == (Decimal("75.00"), "quarterly")


# ----------------------------------------------------------------
# Versionszaehler / Invalidierung
# ----------------------------------------------------------------


@pytest.mark.django_db
class TestCacheVersion:
    def test_invalidate_hides_entries_and_keeps_other_tenants(self, tenant):
        class Other:
            id = tenant.id + 1000
            settings = {}

        set_cached_forecast("forecast", tenant, {"a": 1}, view="monthly")
        set_cached_forecast("forecast", Other(), {"b": 2}, view="monthly")

        invalidate_tenant_forecast(tenant.id)

        assert get_cached_forecast("forecast", tenant.id, view="monthly") is None
        assert get_cached_forecast("forecast", Other.id, view="monthly") == {"b": 2}

    def test_bump_works_without_existing_counter(self, tenant):
        cache.clear()
        invalidate_tenant_forecast(tenant.id)
        first = version(tenant)
        invalidate_tenant_forecast(tenant.id)
        assert version(tenant) != first

    def test_contract_irrelevant_fields_do_not_bump(self, tenant, customer):
        contract = make_contract(tenant, customer)
        before = version(tenant)

        contract.notes = "intern"
        contract.save(update_fields=["notes", "updated_at"])
        contract.order_confirmation_number = "AB-1"
        contract.save(update_fields=["order_confirmation_number", "updated_at"])
        assert version(tenant) == before

        contract.status = Contract.Status.PAUSED
        contract.save(update_fields=["status", "updated_at"])
        assert version(tenant) != before

    def test_full_save_always_bumps(self, tenant, customer):
        contract = make_contract(tenant, customer)
        before = version(tenant)
        contract.save()
        assert version(tenant) != before

    def test_item_sort_order_does_not_bump_but_price_does(self, tenant, customer):
        item = make_item(tenant, make_contract(tenant, customer))
        before = version(tenant)

        item.sort_order = 5
        item.save(update_fields=["sort_order"])
        assert version(tenant) == before

        item.unit_price = Decimal("1.00")
        item.save(update_fields=["unit_price"])
        assert version(tenant) != before

    def test_invoice_record_email_and_pdf_fields_do_not_bump(self, tenant, customer):
        contract = make_contract(tenant, customer)
        record = InvoiceRecord.objects.create(
            tenant=tenant, contract=contract, customer=customer, invoice_number="R-1",
            billing_date=date(2026, 1, 1), period_start=date(2026, 1, 1), period_end=date(2026, 1, 31),
            total_net=Decimal("100"), tax_rate=Decimal("19"), tax_amount=Decimal("19"),
            total_gross=Decimal("119"), line_items_snapshot=[], company_data_snapshot={},
            customer_name=customer.name, contract_name=contract.name,
        )
        before = version(tenant)

        record.email_sent_to = ["a@example.com"]
        record.email_message_id = "<id>"
        record.save(update_fields=["email_sent_to", "email_message_id", "updated_at"])
        record.pdf_file = "rechnung.pdf"
        record.save(update_fields=["pdf_file"])
        assert version(tenant) == before

        record.status = InvoiceRecord.Status.SENT
        record.save(update_fields=["status"])
        assert version(tenant) != before

    def test_imported_invoice_extraction_steps_do_not_bump(self, tenant, customer):
        imported = ImportedInvoice.objects.create(
            tenant=tenant, contract=make_contract(tenant, customer), invoice_number="I-1",
            invoice_date=date(2026, 1, 1), total_amount=Decimal("119"),
            pdf_file="i.pdf", original_filename="i.pdf", file_size=1,
        )
        imported = ImportedInvoice.objects.get(pk=imported.pk)
        before = version(tenant)

        for status in ("extracting", "extracted"):
            imported.extraction_status = status
            imported.extraction_error = ""
            imported.save(update_fields=["extraction_status", "extraction_error", "updated_at"])
        assert version(tenant) == before

        # Wechsel in einen Forecast-Status zaehlt ...
        imported.extraction_status = "confirmed"
        imported.save(update_fields=["extraction_status", "updated_at"])
        confirmed = version(tenant)
        assert confirmed != before

        # ... und das Verlassen ebenso (z. B. erneute Extraktion)
        reloaded = ImportedInvoice.objects.get(pk=imported.pk)
        reloaded.extraction_status = "extracting"
        reloaded.save(update_fields=["extraction_status", "updated_at"])
        assert version(tenant) != confirmed

    def test_snapshot_only_invalidates_trends(self, tenant, customer):
        make_item(tenant, make_contract(tenant, customer))
        set_cached_forecast("forecast", tenant, {"f": 1}, view="monthly")
        set_cached_forecast(KPI_TRENDS_PREFIX, tenant, {"t": 1}, year=2026)

        capture_snapshot(tenant)

        assert get_cached_forecast("forecast", tenant.id, view="monthly") == {"f": 1}
        assert get_cached_forecast(KPI_TRENDS_PREFIX, tenant.id, year=2026) is None

    def test_dashboard_kpis_invalidated_by_contract_change(self, tenant, customer):
        make_item(tenant, make_contract(tenant, customer))
        assert get_dashboard_kpis(tenant)[0]["total_active_contracts"] == 1
        assert get_cached_forecast(DASHBOARD_KPIS_PREFIX, tenant.id, as_of=date.today().isoformat())

        make_item(tenant, make_contract(tenant, customer, "Zweiter"))

        assert get_dashboard_kpis(tenant)[0]["total_active_contracts"] == 2


# ----------------------------------------------------------------
# KPI-Wiederverwendung in den Verlaeufen
# ----------------------------------------------------------------

KPIS_QUERY = "query { dashboardKpis { totalActiveContracts annualRecurringRevenue yearToDateRevenue } }"
TRENDS_QUERY = f"""
    query {{ dashboardKpiTrends(year: {date.today().year}) {{
        activeContracts {{ month value }}
        annualRecurringRevenue {{ month value }}
        yearToDateRevenue {{ month value }}
    }} }}
"""


@pytest.mark.django_db
class TestKpiReuse:
    def test_trends_reuse_kpi_result(self, user, tenant, customer):
        make_item(tenant, make_contract(tenant, customer))
        make_item(tenant, make_contract(tenant, customer, "Zweiter"), is_one_off=True)

        with patch(
            "apps.contracts.schema.calculate_dashboard_kpis", wraps=calculate_dashboard_kpis
        ) as calc:
            kpis = execute(KPIS_QUERY, user)["dashboardKpis"]
            trends = execute(TRENDS_QUERY, user)["dashboardKpiTrends"]
            # Zweiter Aufruf der Kacheln kommt ebenfalls aus dem Cache
            execute(KPIS_QUERY, user)

        assert calc.call_count == 1
        assert trends["activeContracts"][-1]["value"] == kpis["totalActiveContracts"]
        assert trends["annualRecurringRevenue"][-1]["value"] == float(kpis["annualRecurringRevenue"])
        assert trends["yearToDateRevenue"][-1]["value"] == float(kpis["yearToDateRevenue"])

    def test_uncached_trends_match_fresh_tiles(self, tenant, customer):
        make_item(tenant, make_contract(tenant, customer))

        trends = calculate_kpi_trends(tenant, date.today().year, 12)
        kpis = calculate_dashboard_kpis(tenant)

        assert trends["active_contracts"][-1]["value"] == kpis["total_active_contracts"]
        assert trends["year_to_date_revenue"][-1]["value"] == float(kpis["year_to_date_revenue"])
