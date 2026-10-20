## 1. Backend

- [x] 1.1 Clockodo-Provider: `sick_note` durchreichen, Typtabelle nach API v4 korrigieren
- [x] 1.2 `normalize_absence_type(type, sick_note)` in Basisklasse und Clockodo
- [x] 1.3 `AbsenceType.SICK_CHILD_CERTIFICATE` + Migration 0056
- [x] 1.4 Report-Service: Summen je Art, Krank-Paare, Entdoppeln über die Familie
- [x] 1.5 PDF-Template: Zeile je Mitarbeiter + Tabelle „Fehltage nach Art“
- [x] 1.5a `prorate_absence_days`: Werktage statt Kalendertage, auf halbe Tage gerundet (Report + Abteilungs-Auswertung)
- [x] 1.6 Abteilungs-Auswertung: `sick_note` berücksichtigen

## 2. Frontend

- [x] 2.1 Beschriftungen und Summen je Art in `AbsenceReport.tsx`, Locales DE/EN

- [x] 2.2 Freien Versand (Dialog + `sendAbsenceReport`) entfernen
- [x] 2.3 Knopf „An Benutzer senden“: Query `absenceReportRecipients`, Mutation `sendAbsenceReportToUser`
- [x] 2.4 Standard-Versandtag Fehlzeiten-Zeitplan: 7
- [ ] 2.5 Produktion: Zeitplan Fehlzeiten aktivieren, Versandtag 7, Empfänger eintragen, Auto-Finalisierung an (Admin, Einstellungen > Reports) - an mmx gegeben 20.10.

## 3. Tests

- [x] 3.1 Normalisierung, Provider, Trennung, Entdoppeln, Summen
