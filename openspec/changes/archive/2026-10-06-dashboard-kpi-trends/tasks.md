## 1. Backend

- [x] 1.1 Modell `DashboardKpiSnapshot` + Migration
- [x] 1.2 Task `capture_dashboard_kpi_snapshots` (taeglich, upsert laufender Monat) + Beat-Eintrag
- [x] 1.3 Rueckrechnung: aktive Vertraege, ARR je Monatsende; kumulierte Jahreswerte (YTD, New Business x4, Preiserhoehungen x3)
- [x] 1.4 Query `dashboardKpiTrends(year, months)` nach Vertrag in design.md, Snapshots ueberschreiben Rueckrechnung
- [x] 1.5 Cache-Praefix + Invalidierung
- [x] 1.6 pytest: Monatsreihen (Kuendigung im Mai, Preisperiode ab 1.7., Deal gewonnen im Maerz), letzter Punkt == Kachelwert, Snapshot-Upsert, Mandantentrennung, Cache-Invalidierung
- [x] 1.7 `seed_demo_data`: einige Snapshots der Vormonate fuer die Demo (nur Demo-Mandant)

## 2. Frontend

- [x] 2.1 `Sparkline` (recharts AreaChart, ab 3 Punkten)
- [x] 2.2 `KPICard`: `icon`, `href`, `trend`; Titel-Link mit Overlay ueber die ganze Karte (kein Link um Bedienelemente herum); Info-Knopf liegt darueber und navigiert nicht
- [x] 2.3 Dashboard: alle 16 Kacheln mit Icon/Link/Trend, New Business und Umsatzziele auf KPICard
- [x] 2.4 i18n de/en
- [x] 2.5 Vitest (Link, Icon, keine Linie unter 3 Punkten, Info-Knopf), E2E Dashboard mobil + Desktop

## 3. Abschluss

- [x] 3.1 Mobil-Suite gruen, Desktop-Vergleich; ausgeliefert mit 2.40.1, Snapshot-Zeit seit 2.41.1 fest 23:30
- [x] 3.2 Changelog-Eintrag
