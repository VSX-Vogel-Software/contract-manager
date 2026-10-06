## ADDED Requirements

### Requirement: Kacheln fuehren zu den Daten
Jede Kachel im Dashboard SHALL ein Icon zeigen und als Ganzes zur passenden Seite verlinken. Der Info-Knopf einer Kachel MUST die Erklaerung oeffnen, ohne zu navigieren.

#### Scenario: Kachel antippen
- **WHEN** ein Benutzer die Kachel "Aktive Vertraege" antippt
- **THEN** oeffnet sich die Vertragsliste

#### Scenario: Info-Knopf antippen
- **WHEN** ein Benutzer auf einer Kachel den Info-Knopf antippt
- **THEN** erscheint die Erklaerung
- **AND** die Seite wechselt nicht

### Requirement: Verlauf an der Kachel
Kacheln SHALL unter dem Wert den Verlauf der letzten Monate als Linie zeigen, sofern mindestens 3 Datenpunkte vorliegen. Werte, die sich nicht aus vorhandenen Daten berechnen lassen, MUST ausschliesslich aus gespeicherten Monats-Snapshots stammen.

#### Scenario: Rueckwirkend berechenbare Kennzahl
- **WHEN** das Dashboard geladen wird
- **THEN** zeigt die Kachel "Aktive Vertraege" einen Verlauf ueber 12 Monate
- **AND** der letzte Punkt entspricht dem angezeigten Wert

#### Scenario: Prognose ohne Historie
- **WHEN** fuer "Forecast lfd. Jahr" weniger als 3 Monats-Snapshots existieren
- **THEN** zeigt die Kachel keine Linie

### Requirement: Monatliche Kennzahl-Snapshots
Das System SHALL taeglich den aktuellen Stand aller Dashboard-Kennzahlen je Mandant fuer den laufenden Monat speichern; je Mandant und Monat MUST genau ein Snapshot existieren.

#### Scenario: Mehrere Laeufe im Monat
- **WHEN** der Snapshot-Job im selben Monat zweimal laeuft
- **THEN** existiert fuer diesen Monat genau ein Snapshot mit dem Stand des letzten Laufs
