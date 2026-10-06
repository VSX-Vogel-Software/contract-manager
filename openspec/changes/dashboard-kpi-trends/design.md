## Context

Kennzahlen kommen aus `calculate_dashboard_kpis` (`apps/contracts/schema.py`), `calculate_new_business_metrics`, `price_increase_impact`, `revenue_by_stream`. Es gibt keine Historie; Muster fuer Snapshots ist `FteDistributionSnapshot` + `capture_monthly_fte_snapshots` (banking). Forecast-Cache: `apps/contracts/forecast_cache.py` (Redis, 60 min, Invalidierung per Signals).

## Goals / Non-Goals

**Goals:** Trend auf einen Blick, Kachel als Einstieg zu den Daten, ehrliche Daten (keine geratenen Verlaeufe fuer Prognosen).
**Non-Goals:** Achsen, Tooltips, Vergleichszahlen in der Sparkline; Backfill von Snapshots fuer nicht rekonstruierbare Werte.

## Decisions

1. **GraphQL-Vertrag** (verbindlich fuer Backend und Frontend):

```graphql
type KpiTrendPoint {
  month: String!   # "YYYY-MM"
  value: Float!
}

type KpiStreamTrend {
  stream: String!  # Schluessel wie in revenueByStream (z. B. "recurring")
  points: [KpiTrendPoint!]!
}

type DashboardKpiTrends {
  # rueckgerechnet, letzte `months` Monate (Monatsende bzw. heute fuer den laufenden Monat);
  # vorhandene Snapshots ersetzen den rueckgerechneten Wert des jeweiligen Monats
  activeContracts: [KpiTrendPoint!]!
  annualRecurringRevenue: [KpiTrendPoint!]!
  # nur Snapshots
  totalContractValue: [KpiTrendPoint!]!
  currentYearForecast: [KpiTrendPoint!]!
  nextYearForecast: [KpiTrendPoint!]!
  revenueStreamForecast: [KpiStreamTrend!]!
  # Jahr `year`, kumuliert je Monat (Januar .. aktueller Monat bzw. Dezember fuer vergangene Jahre)
  yearToDateRevenue: [KpiTrendPoint!]!
  wonNewArr: [KpiTrendPoint!]!
  backToBaseArr: [KpiTrendPoint!]!
  wonDevelopmentRevenue: [KpiTrendPoint!]!
  wonDealCount: [KpiTrendPoint!]!
  priceIncreaseTotal: [KpiTrendPoint!]!
  priceIncreaseInflation: [KpiTrendPoint!]!
  priceIncreaseNegotiated: [KpiTrendPoint!]!
}

# Query, gleiche Berechtigung wie dashboardKpis
dashboardKpiTrends(year: Int!, months: Int = 12): DashboardKpiTrends!
```

   Leere Liste = kein Verlauf. Das Frontend zeigt erst ab 3 Punkten eine Linie.

2. **Rueckrechnung** in einem Durchlauf: Vertraege aller Status einmal mit Prefetch laden, je Monatsende Status aus Datumsfeldern ableiten (aktiv = gestartet, nicht beendet/gekuendigt/geloescht zum Stichtag), ARR mit den Preisperioden zum Stichtag. Kumulierte Jahreswerte aus denselben Funktionen wie die Kacheln, je Monat aufgeteilt - die Summe im letzten Punkt MUSS dem Kachelwert entsprechen.
3. **Snapshots:** `DashboardKpiSnapshot(TenantModel)` mit `year_month` (Datum, Monatserster), `metrics` (JSON: alle Kachelwerte + Forecast je Erloesart), eindeutig je (tenant, year_month). Taeglicher Beat-Task aktualisiert die Zeile des laufenden Monats (upsert); kein Backfill.
4. **Cache:** eigenes Praefix im Forecast-Cache, Invalidierung zusammen mit dem Forecast (gleiche Signals).
5. **Frontend:** Trends per eigener Query, damit die Werte nicht warten. `KPICard` bekommt `icon`, `href`, `trend`; der Titel ist der Link, seine Klickflaeche spannt per `::after` ueber die Karte (Overlay-Muster). Kein `<a>` um die Karte: Info-Knopf und Links im Inhalt waeren sonst verschachtelte Bedienelemente. Bedienelemente liegen mit `z-10` ueber der Klickflaeche. New-Business- und Ziel-Kacheln nutzen dieselbe Karte. `Sparkline` mit recharts `AreaChart`, ohne Achsen/Tooltip/Animation, `aria-hidden`.
6. **Links:** Aktive Vertraege/TCV -> `/contracts`; ARR/YTD/Forecasts -> `/forecasts`; New Business -> `/dashboard/new-business/<metric>?year=`; Preiserhoehungen -> `/contracts?priceIncrease=true&year=`; Umsatzziele -> `/forecasts?tab=goals`.

## Risks / Trade-offs

- ARR-Rueckrechnung mit heutigen Preisen/Positionen ist fuer die Vergangenheit ungenau (bewusst ohne Hinweis, Entscheidung bk 06.10.2026); Snapshots korrigieren das ab Einfuehrung.
- Rechenzeit ~12x der KPI-Schleife -> Cache.

## Migration Plan

Migration legt die Tabelle an; Beat-Eintrag in `config/settings/base.py`. Rueckweg: Task aus dem Beat nehmen, Tabelle bleibt ungenutzt.
