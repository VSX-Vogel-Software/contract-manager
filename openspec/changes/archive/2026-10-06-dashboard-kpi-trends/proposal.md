## Why

Die Kacheln im Dashboard zeigen nur den heutigen Wert. Ob eine Zahl steigt oder faellt, sieht man nicht, und von der Kachel kommt man nicht zu den Daten dahinter. Auf dem Telefon, wo das Dashboard der Einstieg ist, faellt beides besonders auf.

## What Changes

- **Icon** je Kachel, abgestimmt auf die Symbole der Navigation.
- **Link** je Kachel: die ganze Kachel fuehrt zur passenden Seite (Vertragsliste, Prognosen, New-Business-Detail, Vertragsliste mit Preiserhoehungs-Filter, Umsatzziele).
- **Verlauf** als kleine Linie (Sparkline) unter dem Wert, letzte 12 Monate bzw. Monate des gewaehlten Jahres:
  - rueckwirkend berechnet: aktive Vertraege, ARR, Umsatz lfd. Jahr (kumuliert), New Business (4 Kennzahlen, kumuliert), Preiserhoehungen (3, kumuliert)
  - aus monatlichen Snapshots: TCV, Forecast lfd. und naechstes Jahr, Forecast je Erloesart (Umsatzziele); ausserdem ersetzen Snapshots die rueckgerechneten Werte, sobald sie vorliegen
  - unter 3 Datenpunkten keine Linie
- **Neue Tabelle `DashboardKpiSnapshot`** und ein taeglicher Celery-Beat-Job, der den Stand des laufenden Monats festhaelt (letzter Lauf im Monat = Monatswert).
- Neue GraphQL-Abfrage `dashboardKpiTrends(year, months)`, gecacht wie der Forecast.

## Capabilities

### New Capabilities
- `dashboard-kpi-trends`: Verlauf, Icon und Link an den Dashboard-Kacheln; monatliche KPI-Snapshots

### Modified Capabilities
- Keine (die Kennzahlen selbst rechnen unveraendert)

## Impact

- Backend: Modell + Migration, Task + Beat-Eintrag, Query, Cache-Praefix.
- Frontend: `KPICard`, `Dashboard`, neue `Sparkline`.
- Rueckgerechneter ARR-Verlauf nutzt heutige Preise und Positionen (geloeschte Positionen fehlen) - bewusst ohne Hinweis in der Oberflaeche; mit den Snapshots wird er ab Einfuehrung exakt.
