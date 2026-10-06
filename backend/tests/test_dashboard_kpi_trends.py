"""Tests fuer die Verlaeufe der Dashboard-Kacheln (dashboardKpiTrends) und die KPI-Snapshots."""
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
from django.core.cache import cache

from apps.contracts.kpi_trends import calculate_kpi_trends, capture_snapshot, get_kpi_trends
from apps.contracts.models import (
    Contract,
    ContractAmendment,
    ContractItem,
    ContractItemPrice,
    DashboardKpiSnapshot,
)
from apps.contracts.schema import (
    calculate_dashboard_kpis,
    calculate_new_business_metrics,
    calculate_price_increase_impact,
)
from apps.contracts.tasks import capture_dashboard_kpi_snapshots
from apps.core.context import Context
from apps.customers.models import Customer
from apps.tenants.models import Tenant
from config.schema import schema

TODAY = date(2026, 10, 15)


@pytest.fixture(autouse=True)
def fixed_today():
    """Heute = 15.10.2026 in Kachel- und Verlaufsberechnung."""
    with patch("apps.contracts.schema.date") as schema_date, patch("apps.contracts.kpi_trends.date") as trends_date:
        for mocked in (schema_date, trends_date):
            mocked.today.return_value = TODAY
            mocked.side_effect = lambda *args, **kw: date(*args, **kw)
            mocked.min = date.min
        yield


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def customer(db, tenant):
    return Customer.objects.create(tenant=tenant, name="Bestandskunde", is_active=True)


def make_contract(tenant, customer, name, start, status=Contract.Status.ACTIVE, **kwargs):
    return Contract.objects.create(
        tenant=tenant,
        customer=customer,
        name=name,
        status=status,
        start_date=start,
        billing_start_date=start,
        billing_interval=Contract.BillingInterval.MONTHLY,
        **kwargs,
    )


def make_item(tenant, contract, price, **kwargs):
    return ContractItem.objects.create(
        tenant=tenant,
        contract=contract,
        description="Lizenz",
        quantity=1,
        unit_price=Decimal(price),
        price_period="monthly",
        **kwargs,
    )


def values(points):
    return {p["month"]: p["value"] for p in points}


@pytest.fixture
def portfolio(tenant, customer):
    """Vertrag A seit 2025 mit Preiserhoehung ab 1.7.2026, Vertrag B gekuendigt zum 15.5.2026."""
    a = make_contract(tenant, customer, "A", date(2025, 1, 1))
    item_a = make_item(tenant, a, "100.00")
    ContractItemPrice.objects.create(
        tenant=tenant,
        item=item_a,
        valid_from=date(2026, 7, 1),
        unit_price=Decimal("120.00"),
        price_period="monthly",
        source="fixed",
        increase_type="inflation",
    )
    b = make_contract(
        tenant, customer, "B", date(2025, 1, 1),
        status=Contract.Status.CANCELLED,
        cancelled_at=datetime(2026, 5, 2, 10, 0, tzinfo=UTC),
        cancellation_effective_date=date(2026, 5, 15),
    )
    make_item(tenant, b, "50.00")
    return a, b


@pytest.mark.django_db
class TestRollingSeries:
    def test_cancellation_in_may_and_price_period_from_july(self, tenant, portfolio):
        trends = calculate_kpi_trends(tenant, 2026, 12)

        active = values(trends["active_contracts"])
        arr = values(trends["annual_recurring_revenue"])
        assert list(active) == [
            "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
            "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
        ]
        assert active["2026-04"] == 2
        assert active["2026-05"] == 1  # gekuendigt zum 15.5.
        assert active["2026-10"] == 1
        assert arr["2026-04"] == 1800.0  # (100 + 50) x 12
        assert arr["2026-05"] == 1200.0
        assert arr["2026-06"] == 1200.0
        assert arr["2026-07"] == 1440.0  # Preisperiode ab 1.7.
        assert arr["2026-10"] == 1440.0

    def test_cancelled_contract_drops_out_when_cancelled(self, tenant, customer):
        """Wie die Kachel: gekuendigt zaehlt ab der Kuendigung nicht mehr, auch wenn
        der Vertrag noch bis zum Wirksamkeitsdatum laeuft."""
        c = make_contract(
            tenant, customer, "Gekuendigt", date(2025, 1, 1),
            status=Contract.Status.CANCELLED,
            cancelled_at=datetime(2026, 8, 20, 9, 0, tzinfo=UTC),
            cancellation_effective_date=date(2026, 12, 31),
        )
        make_item(tenant, c, "10.00")

        trends = calculate_kpi_trends(tenant, 2026, 4)

        assert values(trends["active_contracts"]) == {"2026-07": 1, "2026-08": 0, "2026-09": 0, "2026-10": 0}
        assert trends["active_contracts"][-1]["value"] == calculate_dashboard_kpis(tenant)["total_active_contracts"]

    def test_contract_not_started_yet_is_not_counted(self, tenant, customer):
        c = make_contract(tenant, customer, "Spaeter", date(2026, 8, 1))
        make_item(tenant, c, "10.00")

        active = values(calculate_kpi_trends(tenant, 2026, 4)["active_contracts"])

        assert active == {"2026-07": 0, "2026-08": 1, "2026-09": 1, "2026-10": 1}

    def test_deleted_contract_counts_until_deletion(self, tenant, customer):
        c = make_contract(tenant, customer, "Geloescht", date(2025, 1, 1), status=Contract.Status.DELETED)
        ContractAmendment.objects.create(
            tenant=tenant,
            contract=c,
            effective_date=date(2026, 8, 20),
            type=ContractAmendment.AmendmentType.TERMS_CHANGED,
            description="Contract deleted (was: active)",
            changes={"action": "deletion", "previous_status": "active"},
        )

        active = values(calculate_kpi_trends(tenant, 2026, 4)["active_contracts"])

        assert active == {"2026-07": 1, "2026-08": 0, "2026-09": 0, "2026-10": 0}

    def test_last_point_matches_tile(self, tenant, portfolio):
        trends = calculate_kpi_trends(tenant, 2026, 12)
        kpis = calculate_dashboard_kpis(tenant)

        assert trends["active_contracts"][-1]["value"] == kpis["total_active_contracts"]
        assert trends["annual_recurring_revenue"][-1]["value"] == float(kpis["annual_recurring_revenue"])


@pytest.mark.django_db
class TestYearSeries:
    @pytest.fixture
    def won_deal(self, tenant):
        new_customer = Customer.objects.create(tenant=tenant, name="Neukunde", is_active=True)
        c = make_contract(
            tenant, new_customer, "Neu", date(2026, 4, 1),
            hubspot_deal_id="deal-1", deal_won_date=date(2026, 3, 10),
        )
        make_item(tenant, c, "200.00")
        return c

    def test_deal_won_in_march(self, tenant, won_deal):
        trends = calculate_kpi_trends(tenant, 2026, 12)

        won = values(trends["won_new_arr"])
        count = values(trends["won_deal_count"])
        assert list(won) == [f"2026-{m:02d}" for m in range(1, 11)]
        assert won["2026-02"] == 0
        assert won["2026-03"] == 2400.0
        assert won["2026-10"] == 2400.0
        assert count["2026-02"] == 0
        assert count["2026-03"] == 1

    def test_price_increase_from_july(self, tenant, portfolio):
        trends = calculate_kpi_trends(tenant, 2026, 12)

        total = values(trends["price_increase_total"])
        inflation = values(trends["price_increase_inflation"])
        assert total["2026-06"] == 0
        assert total["2026-07"] == 240.0
        assert inflation["2026-10"] == 240.0
        assert values(trends["price_increase_negotiated"])["2026-10"] == 0

    def test_last_points_match_tiles(self, tenant, portfolio, won_deal):
        # Verhandelte Erhoehung im Dezember: zaehlt im letzten Punkt mit (wie die Kachel)
        item = make_item(tenant, portfolio[0], "80.00")
        ContractItemPrice.objects.create(
            tenant=tenant, item=item, valid_from=date(2026, 12, 1), unit_price=Decimal("90.00"),
            price_period="monthly", source="fixed", increase_type="negotiated",
        )
        make_item(
            tenant, portfolio[0], "1000.00", is_one_off=True, start_date=date(2026, 2, 1),
            billing_start_date=date(2026, 2, 1),
        )

        trends = calculate_kpi_trends(tenant, 2026, 12)
        kpis = calculate_dashboard_kpis(tenant)
        nb = calculate_new_business_metrics(tenant, 2026)
        price = calculate_price_increase_impact(tenant, 2026)

        expected = {
            "year_to_date_revenue": kpis["year_to_date_revenue"],
            "won_new_arr": nb["won_new_arr"],
            "back_to_base_arr": nb["won_b2b_arr"],
            "won_development_revenue": nb["won_development_revenue"],
            "won_deal_count": nb["won_deal_count"],
            "price_increase_total": price.total_arr_impact,
            "price_increase_inflation": price.inflation_arr_impact,
            "price_increase_negotiated": price.negotiated_arr_impact,
        }
        assert kpis["year_to_date_revenue"] > 0
        assert price.negotiated_arr_impact == Decimal("120")
        for key, tile in expected.items():
            assert trends[key][-1] == {"month": "2026-10", "value": float(tile)}, key

    def test_ytd_is_cumulative(self, tenant, portfolio):
        ytd = [p["value"] for p in calculate_kpi_trends(tenant, 2026, 12)["year_to_date_revenue"]]
        assert len(ytd) == 10
        assert ytd == sorted(ytd)
        assert ytd[0] > 0

    def test_past_year_runs_through_december(self, tenant, portfolio):
        trends = calculate_kpi_trends(tenant, 2025, 12)
        assert [p["month"] for p in trends["year_to_date_revenue"]][-1] == "2025-12"
        assert len(trends["won_new_arr"]) == 12

    def test_future_year_is_empty(self, tenant, portfolio):
        trends = calculate_kpi_trends(tenant, 2027, 12)
        assert trends["year_to_date_revenue"] == []
        assert trends["active_contracts"]  # rollierende Reihen bleiben


@pytest.mark.django_db
class TestSnapshots:
    def test_upsert_keeps_one_snapshot_per_month(self, tenant, portfolio):
        capture_snapshot(tenant)
        make_contract(tenant, portfolio[0].customer, "C", date(2026, 9, 1))

        capture_dashboard_kpi_snapshots()

        snapshots = DashboardKpiSnapshot.objects.filter(tenant=tenant)
        assert snapshots.count() == 1
        snapshot = snapshots.get()
        assert snapshot.year_month == date(2026, 10, 1)
        assert snapshot.metrics["active_contracts"] == 2  # Stand des letzten Laufs
        assert snapshot.metrics["year"] == 2026
        assert set(snapshot.metrics["revenue_stream_forecast"]) >= {
            "recurring", "advanced_development", "training_implementation",
        }

    def test_snapshots_replace_backcalculation_and_feed_snapshot_series(self, tenant, portfolio):
        DashboardKpiSnapshot.objects.create(
            tenant=tenant,
            year_month=date(2026, 8, 1),
            metrics={
                "year": 2026,
                "active_contracts": 7,
                "current_year_forecast": "999.50",
                "won_new_arr": "5000",
                "revenue_stream_forecast": {"recurring": "800", "advanced_development": "200"},
            },
        )

        trends = calculate_kpi_trends(tenant, 2026, 12)

        assert values(trends["active_contracts"])["2026-08"] == 7
        assert values(trends["active_contracts"])["2026-09"] == 1  # rueckgerechnet
        assert trends["current_year_forecast"] == [{"month": "2026-08", "value": 999.5}]
        assert trends["total_contract_value"] == []
        assert values(trends["won_new_arr"])["2026-08"] == 5000.0
        streams = {s["stream"]: s["points"] for s in trends["revenue_stream_forecast"]}
        assert streams["recurring"] == [{"month": "2026-08", "value": 800.0}]
        assert streams["advanced_development"] == [{"month": "2026-08", "value": 200.0}]

    def test_current_month_stays_live(self, tenant, portfolio):
        DashboardKpiSnapshot.objects.create(
            tenant=tenant, year_month=date(2026, 10, 1),
            metrics={"year": 2026, "active_contracts": 99, "year_to_date_revenue": "1", "next_year_forecast": "5"},
        )

        trends = calculate_kpi_trends(tenant, 2026, 12)

        assert trends["active_contracts"][-1]["value"] == 1
        assert trends["year_to_date_revenue"][-1]["value"] != 1.0
        assert trends["next_year_forecast"] == [{"month": "2026-10", "value": 5.0}]

    def test_without_snapshots_snapshot_series_are_empty(self, tenant, portfolio):
        trends = calculate_kpi_trends(tenant, 2026, 12)
        for key in ("total_contract_value", "current_year_forecast", "next_year_forecast", "revenue_stream_forecast"):
            assert trends[key] == [], key


@pytest.mark.django_db
class TestTenantIsolation:
    def test_other_tenant_data_is_ignored(self, tenant, portfolio):
        other = Tenant.objects.create(name="Andere Firma", currency="EUR")
        other_customer = Customer.objects.create(tenant=other, name="Fremd", is_active=True)
        c = make_contract(other, other_customer, "Fremd", date(2025, 1, 1))
        make_item(other, c, "999.00")
        DashboardKpiSnapshot.objects.create(
            tenant=other, year_month=date(2026, 8, 1),
            metrics={"year": 2026, "active_contracts": 50, "current_year_forecast": "1"},
        )
        capture_snapshot(other)

        trends = calculate_kpi_trends(tenant, 2026, 12)

        assert values(trends["active_contracts"])["2026-08"] == 1
        assert trends["current_year_forecast"] == []
        assert DashboardKpiSnapshot.objects.filter(tenant=tenant).count() == 0


@pytest.mark.django_db
class TestCache:
    def test_cached_until_contract_changes(self, tenant, portfolio):
        first = get_kpi_trends(tenant, 2026, 12)
        assert first["active_contracts"][-1]["value"] == 1

        with patch("apps.contracts.kpi_trends.calculate_kpi_trends") as calc:
            assert get_kpi_trends(tenant, 2026, 12) == first
            calc.assert_not_called()

        make_contract(tenant, portfolio[0].customer, "C", date(2026, 9, 1))  # Signal invalidiert

        assert get_kpi_trends(tenant, 2026, 12)["active_contracts"][-1]["value"] == 2

    def test_snapshot_write_invalidates(self, tenant, portfolio):
        assert get_kpi_trends(tenant, 2026, 12)["current_year_forecast"] == []

        capture_snapshot(tenant)

        assert len(get_kpi_trends(tenant, 2026, 12)["current_year_forecast"]) == 1


QUERY = """
    query Trends($year: Int!, $months: Int) {
        dashboardKpiTrends(year: $year, months: $months) {
            activeContracts { month value }
            annualRecurringRevenue { month value }
            totalContractValue { month value }
            currentYearForecast { month value }
            nextYearForecast { month value }
            revenueStreamForecast { stream points { month value } }
            yearToDateRevenue { month value }
            wonNewArr { month value }
            backToBaseArr { month value }
            wonDevelopmentRevenue { month value }
            wonDealCount { month value }
            priceIncreaseTotal { month value }
            priceIncreaseInflation { month value }
            priceIncreaseNegotiated { month value }
        }
    }
"""


@pytest.mark.django_db
class TestGraphQL:
    def test_query_returns_contract_shape(self, user, tenant, portfolio):
        result = schema.execute_sync(
            QUERY, variable_values={"year": 2026}, context_value=Context(request=Mock(), user=user)
        )

        assert result.errors is None
        data = result.data["dashboardKpiTrends"]
        assert len(data["activeContracts"]) == 12
        assert data["activeContracts"][-1] == {"month": "2026-10", "value": 1.0}
        assert data["priceIncreaseInflation"][-1]["value"] == 240.0
        assert data["revenueStreamForecast"] == []

    def test_months_null_falls_back_to_twelve(self, user, tenant, portfolio):
        result = schema.execute_sync(
            QUERY, variable_values={"year": 2026, "months": None},
            context_value=Context(request=Mock(), user=user),
        )

        assert result.errors is None
        assert len(result.data["dashboardKpiTrends"]["annualRecurringRevenue"]) == 12

    def test_requires_contract_read_permission(self, db, tenant):
        from apps.tenants.models import User

        no_perm = User.objects.create_user(email="ohne@example.com", password="x", tenant=tenant)
        result = schema.execute_sync(
            QUERY, variable_values={"year": 2026}, context_value=Context(request=Mock(), user=no_perm)
        )

        assert result.errors
