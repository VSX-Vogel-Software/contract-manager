"""Verlaeufe der Dashboard-Kennzahlen (Query ``dashboardKpiTrends``) und Monats-Snapshots.

Drei Arten von Reihen (siehe openspec/changes/dashboard-kpi-trends/design.md):

- **Rollierend** (aktive Vertraege, ARR): letzte ``months`` Monate, je Monatsende
  aus den Datumsfeldern der Vertraege rueckgerechnet; der laufende Monat ist der
  heutige Kachelwert. Vorhandene Snapshots ersetzen den rueckgerechneten Wert.
- **Nur Snapshots** (TCV, Forecasts, Forecast je Erloesart): nur gespeicherte
  Monatsstaende, keine Rueckrechnung.
- **Jahr kumuliert** (YTD-Umsatz, New Business, Preiserhoehungen): Januar bis
  laufender Monat (bzw. Dezember fuer vergangene Jahre), aufgeteilt aus
  denselben Funktionen wie die Kacheln. Der letzte Punkt des laufenden Jahres
  entspricht exakt dem Kachelwert; Werte spaeterer Monate (z. B. eine
  Preiserhoehung ab 1.12.) zaehlen deshalb in den laufenden Monat.

Alle Berechnungen nutzen ``date.today()`` wie die Kacheln selbst.
"""
import calendar
import logging
from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db.models import Prefetch, Q
from django.utils import timezone

from apps.contracts.forecast_cache import (
    KPI_TRENDS_PREFIX,
    get_cached_forecast,
    set_cached_forecast,
)

logger = logging.getLogger(__name__)

MAX_MONTHS = 60

# Kennzahlen, die nur aus Snapshots kommen (nicht rekonstruierbar)
SNAPSHOT_ONLY_KEYS = ("total_contract_value", "current_year_forecast", "next_year_forecast")

# Kumulierte Jahreskennzahlen; Schluessel = Feld in DashboardKpiTrends und in metrics
YEAR_KEYS = (
    "year_to_date_revenue",
    "won_new_arr",
    "back_to_base_arr",
    "won_development_revenue",
    "won_deal_count",
    "price_increase_total",
    "price_increase_inflation",
    "price_increase_negotiated",
)

ROLLING_KEYS = ("active_contracts", "annual_recurring_revenue")


def month_label(month_first: date) -> str:
    return f"{month_first.year:04d}-{month_first.month:02d}"


def _month_end(month_first: date) -> date:
    return month_first.replace(day=calendar.monthrange(month_first.year, month_first.month)[1])


def _point(month_first: date, value) -> dict:
    return {"month": month_label(month_first), "value": float(value)}


# ----------------------------------------------------------------
# Snapshots
# ----------------------------------------------------------------


def collect_snapshot_metrics(tenant) -> dict:
    """Alle Kachelwerte des Dashboards fuer heute (Betraege als Dezimal-Strings)."""
    from apps.contracts.schema import (
        calculate_dashboard_kpis,
        calculate_new_business_metrics,
        calculate_revenue_by_stream,
    )

    today = date.today()
    kpis = calculate_dashboard_kpis(tenant)
    nb_parts: dict = {}
    nb = calculate_new_business_metrics(tenant, today.year, by_month=nb_parts)
    price = nb_parts["price_increase_result"]
    streams = calculate_revenue_by_stream(tenant, today.year)

    return {
        "year": today.year,
        "captured_on": today.isoformat(),
        "active_contracts": kpis["total_active_contracts"],
        "total_contract_value": str(kpis["total_contract_value"]),
        "annual_recurring_revenue": str(kpis["annual_recurring_revenue"]),
        "year_to_date_revenue": str(kpis["year_to_date_revenue"]),
        "current_year_forecast": str(kpis["current_year_forecast"]),
        "current_year_one_off": str(kpis["current_year_one_off"]),
        "current_year_discounts": str(kpis["current_year_discounts"]),
        "next_year_forecast": str(kpis["next_year_forecast"]),
        "next_year_one_off": str(kpis["next_year_one_off"]),
        "next_year_discounts": str(kpis["next_year_discounts"]),
        "won_new_arr": str(nb["won_new_arr"]),
        "back_to_base_arr": str(nb["won_b2b_arr"]),
        "won_development_revenue": str(nb["won_development_revenue"]),
        "won_deal_count": nb["won_deal_count"],
        "price_increase_total": str(price.total_arr_impact),
        "price_increase_inflation": str(price.inflation_arr_impact),
        "price_increase_negotiated": str(price.negotiated_arr_impact),
        "price_increase_untagged": str(price.untagged_arr_impact),
        "revenue_stream_forecast": {
            s["revenue_type"]: str(s["full_year_forecast"]) for s in streams
        },
    }


def capture_snapshot(tenant):
    """Snapshot des laufenden Monats anlegen oder ueberschreiben (Upsert)."""
    from apps.contracts.models import DashboardKpiSnapshot

    month_first = date.today().replace(day=1)
    snapshot, _ = DashboardKpiSnapshot.objects.update_or_create(
        tenant=tenant,
        year_month=month_first,
        defaults={"metrics": collect_snapshot_metrics(tenant)},
    )
    return snapshot


# ----------------------------------------------------------------
# Rueckrechnung aktive Vertraege / ARR
# ----------------------------------------------------------------


def _inactive_from(contract) -> date | None:
    """Erster Tag, an dem der Vertrag nicht mehr aktiv ist (None = offen).

    - Ende: Tag nach end_date.
    - Gekuendigt: ab dem Tag der Kuendigung (cancelled_at), spaetestens nach
      cancellation_effective_date. Wie die Kachel, die einen gekuendigten
      Vertrag sofort nicht mehr zaehlt, auch wenn er noch bis zum
      Wirksamkeitsdatum laeuft. Nur fuer Vertraege, die nicht wieder aktiv sind.
    - Pausieren, Beenden und Loeschen haben kein eigenes Datumsfeld; das Datum
      stammt aus dem Amendment, das die Statusaenderung protokolliert. Fehlt es,
      gilt der Vertrag als nie aktiv (konservativ, wie die Kachel heute).
    """
    from apps.contracts.models import Contract

    status = contract.status
    candidates = []
    if contract.end_date:
        candidates.append(contract.end_date + timedelta(days=1))
    if status not in (Contract.Status.ACTIVE, Contract.Status.PAUSED):
        if contract.cancelled_at:
            candidates.append(timezone.localdate(contract.cancelled_at))
        if contract.cancellation_effective_date:
            candidates.append(contract.cancellation_effective_date + timedelta(days=1))

    if status in (Contract.Status.PAUSED, Contract.Status.ENDED, Contract.Status.DELETED):
        changed_on = None
        for amendment in contract.status_amendments:
            changes = amendment.changes or {}
            action = changes.get("action")
            if status == Contract.Status.DELETED and action == "deletion":
                if changes.get("previous_status") == Contract.Status.DRAFT:
                    return date.min
                changed_on = amendment.effective_date
            elif action == "status_change" and changes.get("new_status") == status:
                changed_on = amendment.effective_date
        if changed_on:
            candidates.append(changed_on)
        elif not (status == Contract.Status.ENDED and contract.end_date):
            return date.min

    return min(candidates) if candidates else None


def calculate_active_and_arr_at(tenant, stichtage: list[date]) -> list[tuple[int, Decimal]]:
    """Aktive Vertraege und ARR je Stichtag, in einem Durchlauf.

    Aktiv = gestartet und zum Stichtag nicht beendet, gekuendigt, pausiert oder
    geloescht (siehe _inactive_from). ARR wie in calculate_dashboard_kpis (Monatswert x 12) mit dem
    Preis der Preisperiode zum Stichtag; beruecksichtigt nur Positionen, die
    zum Stichtag schon begonnen und noch nicht geendet haben. Positionen, die
    inzwischen geloescht wurden, fehlen (bekannte Ungenauigkeit, design.md).
    """
    from apps.contracts.models import Contract, ContractAmendment

    if not stichtage:
        return []

    contracts = (
        Contract.objects.filter(tenant=tenant, start_date__lte=max(stichtage))
        .exclude(status=Contract.Status.DRAFT)
        .exclude(end_date__lt=min(stichtage))
        .prefetch_related(
            "items",
            "items__price_periods",
            Prefetch(
                "amendments",
                queryset=ContractAmendment.objects.filter(
                    type=ContractAmendment.AmendmentType.TERMS_CHANGED
                ).order_by("effective_date", "created_at"),
                to_attr="status_amendments",
            ),
        )
    )

    counts = [0] * len(stichtage)
    arrs = [Decimal("0")] * len(stichtage)

    for contract in contracts:
        inactive_from = _inactive_from(contract)
        recurring = [
            (item, list(item.price_periods.all()))
            for item in contract.items.all()
            if not item.is_one_off
        ]
        for idx, stichtag in enumerate(stichtage):
            if contract.start_date > stichtag:
                continue
            if inactive_from is not None and stichtag >= inactive_from:
                continue
            counts[idx] += 1
            monthly_value = Decimal("0")
            for item, price_periods in recurring:
                item_start = item.start_date or item.billing_start_date
                if item_start and item_start > stichtag:
                    continue
                if item.billing_end_date and item.billing_end_date < stichtag:
                    continue
                monthly_value += item.get_price_at_cached(
                    stichtag, price_periods, normalize_to_monthly=True
                ) * item.quantity
            arrs[idx] += monthly_value * 12

    return list(zip(counts, arrs, strict=True))


# ----------------------------------------------------------------
# Verlaeufe
# ----------------------------------------------------------------


def _cumulate(buckets: dict | None, last_month: int) -> list:
    """Monatswerte 1..last_month kumulieren; spaetere Monate zaehlen in last_month."""
    buckets = buckets or {}
    values = []
    running = 0
    for month in range(1, last_month + 1):
        running += buckets.get(month, 0)
        if month == last_month:
            running += sum(v for m, v in buckets.items() if m > last_month)
        values.append(running)
    return values


def _snapshot_value(snapshot: dict | None, key: str):
    if not snapshot or snapshot.get(key) is None:
        return None
    return Decimal(str(snapshot[key]))


def _stream_order(stream: str) -> tuple:
    from apps.core.models import RevenueType

    standard = [value for value, _ in RevenueType.choices]
    if stream in standard:
        return (0, standard.index(stream), stream)
    return (1, 0, stream)


def normalize_months(months) -> int:
    """Anzahl Monate der rollierenden Reihen: Standard 12, begrenzt auf 1..MAX_MONTHS."""
    return max(1, min(int(months or 12), MAX_MONTHS))


def calculate_kpi_trends(tenant, year: int, months: int = 12) -> dict:
    """Alle Verlaeufe als JSON-faehiges dict (Feldnamen wie DashboardKpiTrends)."""
    from apps.contracts.models import DashboardKpiSnapshot
    from apps.contracts.schema import (
        calculate_dashboard_kpis,
        calculate_new_business_metrics,
        calculate_revenue_by_stream,
    )

    today = date.today()
    months = normalize_months(months)
    current_first = today.replace(day=1)
    window = [current_first - relativedelta(months=i) for i in range(months - 1, -1, -1)]

    year_first = date(year, 1, 1)
    snapshots = {
        s.year_month: s.metrics or {}
        for s in DashboardKpiSnapshot.objects.filter(tenant=tenant).filter(
            Q(year_month__gte=window[0], year_month__lte=current_first)
            | Q(year_month__gte=year_first, year_month__lte=date(year, 12, 1))
        )
    }

    result: dict = {}

    # Laufender Monat = heutiger Kachelwert; liefert zugleich den YTD-Umsatz je Monat
    ytd_buckets: dict = {}
    kpis = calculate_dashboard_kpis(
        tenant, ytd_by_month=ytd_buckets if year == today.year else None
    )

    # --- Rollierend: aktive Vertraege, ARR ---
    past_months = window[:-1]
    history = calculate_active_and_arr_at(tenant, [_month_end(m) for m in past_months])
    live = {
        "active_contracts": kpis["total_active_contracts"],
        "annual_recurring_revenue": kpis["annual_recurring_revenue"],
    }
    for pos, key in enumerate(ROLLING_KEYS):
        points = []
        for month_first, values in zip(past_months, history, strict=True):
            snap_value = _snapshot_value(snapshots.get(month_first), key)
            points.append(_point(month_first, snap_value if snap_value is not None else values[pos]))
        points.append(_point(current_first, live[key]))
        result[key] = points

    # --- Nur Snapshots ---
    for key in SNAPSHOT_ONLY_KEYS:
        result[key] = [
            _point(m, _snapshot_value(snapshots.get(m), key))
            for m in window
            if _snapshot_value(snapshots.get(m), key) is not None
        ]

    stream_months = [m for m in window if isinstance(snapshots.get(m, {}).get("revenue_stream_forecast"), dict)]
    stream_names = sorted(
        {name for m in stream_months for name in snapshots[m]["revenue_stream_forecast"]},
        key=_stream_order,
    )
    result["revenue_stream_forecast"] = [
        {
            "stream": name,
            "points": [
                _point(m, Decimal(str(snapshots[m]["revenue_stream_forecast"].get(name, "0"))))
                for m in stream_months
            ],
        }
        for name in stream_names
    ]

    # --- Jahr kumuliert ---
    if year > today.year:
        for key in YEAR_KEYS:
            result[key] = []
        return result

    last_month = today.month if year == today.year else 12
    if year != today.year:
        calculate_revenue_by_stream(tenant, year, ytd_by_month=ytd_buckets)
    nb_parts: dict = {}
    calculate_new_business_metrics(tenant, year, by_month=nb_parts)
    price_parts = nb_parts.get("price_increase") or {}

    year_buckets = {
        "year_to_date_revenue": ytd_buckets,
        "won_new_arr": nb_parts.get("won_new_arr"),
        "back_to_base_arr": nb_parts.get("won_b2b_arr"),
        "won_development_revenue": nb_parts.get("won_development_revenue"),
        "won_deal_count": nb_parts.get("won_deal_count"),
        "price_increase_total": price_parts.get("total"),
        "price_increase_inflation": price_parts.get("inflation"),
        "price_increase_negotiated": price_parts.get("negotiated"),
    }
    for key, buckets in year_buckets.items():
        points = []
        for month, value in enumerate(_cumulate(buckets, last_month), start=1):
            month_first = date(year, month, 1)
            if month_first != current_first:
                snapshot = snapshots.get(month_first)
                if snapshot and snapshot.get("year") == year:
                    snap_value = _snapshot_value(snapshot, key)
                    if snap_value is not None:
                        value = snap_value
            points.append(_point(month_first, value))
        result[key] = points

    return result


def get_kpi_trends(tenant, year: int, months: int = 12) -> dict:
    """calculate_kpi_trends mit Forecast-Cache (Praefix kpi_trends).

    Der Tag ist Teil des Schluessels, damit der laufende Monat nach
    Mitternacht nicht aus dem Vortag stammt.
    """
    months = normalize_months(months)
    params = {"year": year, "months": months, "as_of": date.today().isoformat()}
    cached = get_cached_forecast(KPI_TRENDS_PREFIX, tenant.id, **params)
    if cached is not None:
        return cached
    result = calculate_kpi_trends(tenant, year, months)
    set_cached_forecast(KPI_TRENDS_PREFIX, tenant, result, **params)
    return result
