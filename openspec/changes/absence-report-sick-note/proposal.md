## Why

Der Fehlzeiten-Report soll die Kranktage getrennt nach „mit Krankenschein (AU)“ und „ohne AU“ ausweisen. Heute geht das nicht: Clockodo hält die AU nicht im Abwesenheitstyp, sondern im Feld `sick_note`, und der Provider hat dieses Feld verworfen. Die Zuordnung „Typ 11 = Krank mit AU“ war falsch, denn Typ 11 bedeutet in Clockodo „Krank, unbezahlt“. Deshalb blieb `sick_certificate` immer leer, im Report und in der Abteilungs-Auswertung (Spalte „Krank (AU)“).

## What Changes

- Der Clockodo-Provider reicht `sick_note` durch, `normalize_absence_type(type, sick_note)` macht daraus `sick_certificate` bzw. das neue `sick_child_certificate`
- Typtabelle nach der Clockodo-API v4 korrigiert: 11 → krank, 12 → Kind krank, 13 Quarantäne, 14 Wehrdienst, 15 Krankengeld → krank
- Report (PDF und UI): je Mitarbeiter und gesamt eine Summe „Fehltage nach Art“; Krankheit steht dort immer paarweise „mit AU“ und „ohne AU“, auch wenn eine Seite 0 ist
- Beschriftungen: „Krank mit AU“, „Krank ohne AU“, „Kind krank mit AU“, „Kind krank ohne AU“
- Monatsübergreifende Abwesenheiten werden nach Werktagen (Mo–Fr) statt Kalendertagen aufgeteilt und auf halbe Tage gerundet. Bisher entstanden Werte wie 2,14 oder 0,33, obwohl höchstens halbe Tage buchbar sind. Gilt auch für die Abteilungs-Auswertung
- **Kein freier Versand mehr:** Dialog und Mutation `sendAbsenceReport` (beliebige Adressen) entfallen. Der Report enthält Krankheitstage und geht nur noch
  - automatisch über den Report-Zeitplan an die in den Einstellungen hinterlegten Adressen (Standard-Versandtag für Fehlzeiten jetzt der 7., also sieben Tage nach Monatsende) und
  - per Knopf „An Benutzer senden“ an einen Benutzer des Mandanten, der Abwesenheiten sehen darf (`department_analysis.read`). Das prüft der Server, nicht nur die Auswahlliste.
- Beim Entdoppeln zählen „mit AU“ und „ohne AU“ als dieselbe Art, damit ein Einzeltag innerhalb eines AU-Zeitraums nicht doppelt zählt

## Capabilities

### New Capabilities
- Keine

### Modified Capabilities
- `absence-report`: Kranktage nach AU getrennt, Summen je Art

## Impact

- **Backend**: `clockodo_provider.py`, `time_tracking.py`, `absence_report.py`, Template `absence_report.html`, `schema.py` (Abteilungs-Auswertung), Migration `0056` (nur Choices)
- **Frontend**: `AbsenceReport.tsx`, Locales
- **Bestehende Reports**: festgeschriebene Reports bleiben unverändert; ein Entwurf zeigt die Trennung nach „Neu erzeugen“
