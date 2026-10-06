"""Signal handlers for forecast cache invalidation.

Invalidiert wird nur, wenn sich ein fuer Forecast, Kacheln oder Verlaeufe
relevantes Feld aendert. Saves mit ``update_fields`` werden ausgewertet; ein
Save ohne ``update_fields`` gilt immer als relevant. ``QuerySet.update()``
loest keine Signale aus und muss selbst ``invalidate_tenant_forecast`` rufen.
"""

import logging

from django.db.models.signals import post_delete, post_init, post_save
from django.dispatch import receiver

from apps.contracts.forecast_cache import KPI_TRENDS_PREFIX, invalidate_tenant_forecast

logger = logging.getLogger(__name__)

# Felder, die nie in eine Berechnung eingehen (Zeitstempel zaehlen nie)
_ALWAYS_IRRELEVANT = frozenset({"updated_at", "created_at"})

# Vertrag/Position: fast alles ist relevant, daher Liste der irrelevanten Felder
CONTRACT_IRRELEVANT_FIELDS = _ALWAYS_IRRELEVANT | {
    "notes",
    "invoice_text",
    "po_number",
    "order_confirmation_number",
    "offer_number",
    "netsuite_sales_order_number",
    "netsuite_contract_number",
    "netsuite_url",
    "payment_term_days",
    "group",
}
CONTRACT_ITEM_IRRELEVANT_FIELDS = _ALWAYS_IRRELEVANT | {
    "description",
    "order_confirmation_number",
    "sort_order",
}

# Rechnungen: Felder, die Forecast (_find_best_invoice_for_period,
# _determine_cell_invoice_status) und Kacheln (_customers_with_prior_year_revenue)
# lesen. PDF-, E-Mail-Empfaenger-, Nummern- und Snapshot-Felder zaehlen nicht.
INVOICE_RECORD_RELEVANT_FIELDS = frozenset({
    "tenant",
    "contract",
    "customer",
    "document_type",
    "status",
    "billing_date",
    "invoice_date",
    "period_start",
    "period_end",
    "total_net",
    "email_sent_at",
})
# Importierte Rechnungen: _merge_imported_invoices / _ImportedInvoiceAdapter
IMPORTED_INVOICE_RELEVANT_FIELDS = frozenset({
    "tenant",
    "contract",
    "billing_date",
    "invoice_date",
    "extraction_status",
})
# Nur diese Extraktionsstatus erscheinen im Forecast; Wechsel zwischen den
# uebrigen (pending, extracting, extracted, ...) aendern nichts.
FORECAST_EXTRACTION_STATUSES = frozenset({"confirmed", "sent", "paid"})


def _touches_relevant(update_fields, *, relevant=None, irrelevant=None) -> bool:
    """True, wenn ein Save mit diesen update_fields den Cache betreffen kann."""
    if update_fields is None:
        return True
    if relevant is not None:
        return bool(set(update_fields) & relevant)
    return bool(set(update_fields) - irrelevant)


@receiver(post_save, sender="contracts.Contract")
def invalidate_on_contract_save(sender, instance, update_fields=None, **kwargs):
    if _touches_relevant(update_fields, irrelevant=CONTRACT_IRRELEVANT_FIELDS):
        invalidate_tenant_forecast(instance.tenant_id)


@receiver(post_save, sender="contracts.ContractItem")
def invalidate_on_contract_item_save(sender, instance, update_fields=None, **kwargs):
    if _touches_relevant(update_fields, irrelevant=CONTRACT_ITEM_IRRELEVANT_FIELDS):
        invalidate_tenant_forecast(instance.tenant_id)


@receiver(post_save, sender="contracts.ContractItemPrice")
def invalidate_on_contract_item_price_save(sender, instance, update_fields=None, **kwargs):
    if _touches_relevant(update_fields, irrelevant=_ALWAYS_IRRELEVANT):
        invalidate_tenant_forecast(instance.tenant_id)


@receiver(post_delete, sender="contracts.Contract")
@receiver(post_delete, sender="contracts.ContractItem")
@receiver(post_delete, sender="contracts.ContractItemPrice")
@receiver(post_delete, sender="invoices.InvoiceRecord")
@receiver(post_delete, sender="invoices.ImportedInvoice")
def invalidate_on_delete(sender, instance, **kwargs):
    invalidate_tenant_forecast(instance.tenant_id)


@receiver(post_save, sender="invoices.InvoiceRecord")
def invalidate_on_invoice_record_save(sender, instance, update_fields=None, **kwargs):
    if _touches_relevant(update_fields, relevant=INVOICE_RECORD_RELEVANT_FIELDS):
        invalidate_tenant_forecast(instance.tenant_id)


@receiver(post_init, sender="invoices.ImportedInvoice")
def remember_imported_invoice_status(sender, instance, **kwargs):
    # Geladenen Status merken; ueber __dict__, damit ein per only()/defer()
    # ausgelassenes Feld keine Query ausloest.
    instance._forecast_extraction_status = instance.__dict__.get("extraction_status")


def _imported_invoice_relevant(instance, update_fields) -> bool:
    if update_fields is None:
        return True
    fields = set(update_fields) & IMPORTED_INVOICE_RELEVANT_FIELDS
    if fields - {"extraction_status"}:
        return True
    if not fields:
        return False
    # Nur extraction_status: relevant, wenn der alte oder neue Wert im Forecast zaehlt
    previous = getattr(instance, "_forecast_extraction_status", None)
    return (
        instance.extraction_status in FORECAST_EXTRACTION_STATUSES
        or previous in FORECAST_EXTRACTION_STATUSES
    )


@receiver(post_save, sender="invoices.ImportedInvoice")
def invalidate_on_imported_invoice_save(sender, instance, update_fields=None, **kwargs):
    relevant = _imported_invoice_relevant(instance, update_fields)
    instance._forecast_extraction_status = instance.extraction_status
    if relevant:
        invalidate_tenant_forecast(instance.tenant_id)


@receiver(post_save, sender="invoices.InvoicePaymentMatch")
@receiver(post_delete, sender="invoices.InvoicePaymentMatch")
def invalidate_on_payment_match_change(sender, instance, **kwargs):
    # Zahlungszuordnungen faerben Forecast-Zellen als bezahlt; Zuordnungen zu
    # Eingangsrechnungen (incoming_invoice) gehen in keine Berechnung ein.
    if instance.invoice_id or instance.invoice_record_id:
        invalidate_tenant_forecast(instance.tenant_id)


@receiver(post_save, sender="contracts.DashboardKpiSnapshot")
@receiver(post_delete, sender="contracts.DashboardKpiSnapshot")
def invalidate_on_kpi_snapshot_change(sender, instance, **kwargs):
    # Snapshots aendern nur die Verlaeufe, nicht den Forecast
    invalidate_tenant_forecast(instance.tenant_id, prefixes=(KPI_TRENDS_PREFIX,))
