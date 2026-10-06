"""Redis caching for revenue and recognition forecast queries.

Invalidierung ueber Versionszaehler je Tenant: Die Version steckt im Schluessel,
``invalidate_tenant_forecast`` erhoeht sie atomar per ``cache.incr``. Alte
Eintraege werden nie mehr gelesen und laufen ueber ihre TTL aus; es gibt keine
Tracker-Liste (read-modify-write) und kein ``delete_many`` mehr.
"""
import hashlib
import json
import logging
import time
from decimal import Decimal
from typing import Optional

from django.core.cache import cache
from django.db import transaction

logger = logging.getLogger(__name__)

DEFAULT_CACHE_TTL_MINUTES = 60

# Praefix der Dashboard-Verlaeufe (dashboardKpiTrends); wird zusammen mit dem
# Forecast invalidiert.
KPI_TRENDS_PREFIX = "kpi_trends"
# Praefix der Dashboard-Kacheln (dashboardKpis); die Verlaeufe nutzen dasselbe Ergebnis.
DASHBOARD_KPIS_PREFIX = "dashboard_kpis"
CACHE_PREFIXES = ("forecast", "recognition", KPI_TRENDS_PREFIX, DASHBOARD_KPIS_PREFIX)

# Bereich des Versionszaehlers, der alle Praefixe eines Tenants umfasst
_ALL_SCOPE = "_all"


def _build_cache_key(prefix: str, tenant_id: int, **params) -> str:
    """Build a deterministic cache key from query parameters.

    Forecast/recognition pass view, months, quarters, pro_rata and
    exclude_one_off; the KPI trends pass their own parameters.
    """
    params_json = json.dumps(params, sort_keys=True)
    query_hash = hashlib.md5(params_json.encode()).hexdigest()[:12]
    return f"{prefix}:v1:{tenant_id}:{query_hash}"


def _version_key(tenant_id: int, scope: str) -> str:
    """Schluessel eines Versionszaehlers (scope = Praefix oder _ALL_SCOPE)."""
    return f"forecast_version:v1:{tenant_id}:{scope}"


def _initial_version() -> int:
    """Startwert fuer einen fehlenden Zaehler.

    Zeitbasiert statt 0: Wird der Zaehler verdraengt (Redis-Eviction), darf der
    Neustart nicht auf eine schon benutzte Version zurueckfallen und alte
    Eintraege wieder sichtbar machen.
    """
    return int(time.time() * 1000)


def _current_version(tenant_id: int, prefix: str) -> str:
    """Version fuer Schluessel eines Praefixes: Tenant-Zaehler + Praefix-Zaehler."""
    keys = [_version_key(tenant_id, _ALL_SCOPE), _version_key(tenant_id, prefix)]
    found = cache.get_many(keys)
    parts = []
    for key in keys:
        value = found.get(key)
        if value is None:
            # add() ist atomar: bei gleichzeitigem Anlegen gewinnt ein Wert
            cache.add(key, _initial_version(), None)
            value = cache.get(key, 0)
        parts.append(str(value))
    return ".".join(parts)


def _bump_version(key: str) -> None:
    """Zaehler atomar erhoehen; fehlt er, neu anlegen."""
    try:
        cache.incr(key)
    except ValueError:
        if not cache.add(key, _initial_version(), None):
            cache.incr(key)


def _versioned_key(prefix: str, tenant_id: int, **params) -> str:
    return f"{_build_cache_key(prefix, tenant_id, **params)}:{_current_version(tenant_id, prefix)}"


def get_cache_ttl(tenant) -> int:
    """Read cache TTL from tenant settings (in seconds). Default: 60 minutes."""
    minutes = (tenant.settings or {}).get(
        "forecast_cache_ttl", DEFAULT_CACHE_TTL_MINUTES
    )
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        minutes = DEFAULT_CACHE_TTL_MINUTES
    return max(minutes, 1) * 60  # Convert to seconds


def get_cached_forecast(
    prefix: str,
    tenant_id: int,
    **params,
) -> Optional[dict]:
    """Retrieve a cached forecast result. Returns None on miss."""
    key = _versioned_key(prefix, tenant_id, **params)
    data = cache.get(key)
    if data is not None:
        logger.debug("Forecast cache hit: %s", key)
    return data


def set_cached_forecast(
    prefix: str,
    tenant,
    result_dict: dict,
    **params,
) -> None:
    """Store a forecast result in cache with tenant-specific TTL."""
    key = _versioned_key(prefix, tenant.id, **params)
    ttl = get_cache_ttl(tenant)

    cache.set(key, result_dict, ttl)

    logger.debug("Forecast cached: %s (TTL=%ds)", key, ttl)


def _bump_versions(tenant_id: int, prefixes: tuple[str, ...]) -> None:
    if set(CACHE_PREFIXES) <= set(prefixes):
        _bump_version(_version_key(tenant_id, _ALL_SCOPE))
    else:
        for prefix in prefixes:
            _bump_version(_version_key(tenant_id, prefix))


def invalidate_tenant_forecast(tenant_id: int, prefixes: tuple[str, ...] = CACHE_PREFIXES) -> None:
    """Alle Cache-Eintraege der Praefixe fuer einen Tenant verwerfen (Version +1).

    Innerhalb einer Transaktion wird nach dem Commit ein zweites Mal erhoeht:
    Eine parallele Anfrage, die zwischen Signal und Commit noch den alten
    Datenstand gelesen und unter der neuen Version gecacht hat, wird so
    ebenfalls verworfen.
    """
    _bump_versions(tenant_id, prefixes)
    if transaction.get_connection().in_atomic_block:
        transaction.on_commit(lambda: _bump_versions(tenant_id, prefixes))
    logger.debug("Invalidated forecast cache %s for tenant %s", prefixes, tenant_id)


# ----------------------------------------------------------------
# Serialization helpers
# ----------------------------------------------------------------


def forecast_result_to_dict(result) -> dict:
    """Serialize a RevenueForecastResult to a JSON-safe dict."""
    return {
        "month_columns": result.month_columns,
        "monthly_totals": [
            {
                "month": mt.month,
                "amount": str(mt.amount),
                "invoice_status": mt.invoice_status,
            }
            for mt in result.monthly_totals
        ],
        "contracts": [
            {
                "contract_id": c.contract_id,
                "contract_name": c.contract_name,
                "customer_id": c.customer_id,
                "customer_name": c.customer_name,
                "customer_number": c.customer_number,
                "months": [
                    {
                        "month": m.month,
                        "amount": str(m.amount),
                        "invoice_status": m.invoice_status,
                    }
                    for m in c.months
                ],
                "total": str(c.total),
            }
            for c in result.contracts
        ],
        "grand_total": str(result.grand_total),
        "error": result.error,
    }


def dict_to_forecast_result(data: dict):
    """Deserialize a dict back to a RevenueForecastResult."""
    from apps.contracts.schema import (
        ContractRevenueRow,
        RevenueMonthData,
        RevenueForecastResult,
    )

    return RevenueForecastResult(
        month_columns=data["month_columns"],
        monthly_totals=[
            RevenueMonthData(
                month=mt["month"],
                amount=Decimal(mt["amount"]),
                invoice_status=mt.get("invoice_status"),
            )
            for mt in data["monthly_totals"]
        ],
        contracts=[
            ContractRevenueRow(
                contract_id=c["contract_id"],
                contract_name=c["contract_name"],
                customer_id=c["customer_id"],
                customer_name=c["customer_name"],
                customer_number=c.get("customer_number"),
                months=[
                    RevenueMonthData(
                        month=m["month"],
                        amount=Decimal(m["amount"]),
                        invoice_status=m.get("invoice_status"),
                    )
                    for m in c["months"]
                ],
                total=Decimal(c["total"]),
            )
            for c in data["contracts"]
        ],
        grand_total=Decimal(data["grand_total"]),
        error=data.get("error"),
    )
