## Why

Auf dem Telefon funktioniert "Runterziehen zum Neuladen" nicht. Die Browser-Geste greift nur, wenn das ganze Dokument scrollt; im Layout scrollt aber nur der Inhaltsbereich `<main>` (Kopfleiste und Seitenleiste stehen fest), zusaetzlich mit `overscroll-contain`. Ausserdem oeffnet die Navigationsschublade spuerbar traege (500 ms).

## What Changes

- Eigene Ziehgeste im Inhaltsbereich: am Seitenanfang nach unten ziehen, ueber der Schwelle loslassen -> alle aktiven Abfragen der Seite werden neu geladen (kein Seiten-Reload; Filter, Tabs, Eingaben bleiben).
- Schubladen (Sheet) oeffnen in 200 ms statt 500 ms, schliessen in 150 ms statt 300 ms.

## Capabilities

### Modified Capabilities

- `mobile-support`
