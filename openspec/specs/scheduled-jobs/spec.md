## ADDED Requirements

### Requirement: Hintergrundaufgaben zu festen Uhrzeiten
Wiederkehrende Hintergrundaufgaben SHALL zu festen Uhrzeiten in der Zeitzone der Anwendung (Europe/Berlin) laufen, nicht in Intervallen ab dem Start des Zeitplaners. Ein Neustart oder Update der Anwendung MUST den naechsten Lauf nicht verschieben.

| Aufgabe | Zeit |
|---|---|
| Dashboard-Snapshot | taeglich 23:30 |
| Geplante Berichte (Versandtag je Einstellung) | taeglich 7:00 |
| FTE-Snapshot (Stichtag je Einstellung) | taeglich 6:30 |
| Zeiterfassungs-Verknuepfung | taeglich 6:00 |
| Zeiterfassungs-Abgleich | 5:40 und 17:40 |
| HubSpot-Abgleich | alle 6 Stunden, Minute 10 |

#### Scenario: Mehrere Updates an einem Tag
- **WHEN** die Anwendung um 11:20 und um 15:10 aktualisiert wird
- **THEN** laeuft der Dashboard-Snapshot trotzdem um 23:30

#### Scenario: Neuer Job als Intervall eingetragen
- **WHEN** jemand einen Eintrag im Zeitplan mit einem Intervall statt einer Uhrzeit anlegt
- **THEN** schlaegt der Test `tests/test_beat_schedule.py` fehl
