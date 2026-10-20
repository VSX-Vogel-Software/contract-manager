## ADDED Requirements

### Requirement: Kranktage mit und ohne AU getrennt
Das System SHALL Kranktage im Fehlzeiten-Report getrennt nach „mit AU“ und „ohne AU“ ausweisen. Die AU MUST aus dem Feld `sick_note` der Zeiterfassung stammen.

#### Scenario: Krank mit AU
- **WHEN** eine Clockodo-Abwesenheit Typ 4 mit `sick_note = true` im Monat liegt
- **THEN** erscheint sie als „Krank mit AU“

#### Scenario: Krank ohne AU
- **WHEN** eine Clockodo-Abwesenheit Typ 4 mit `sick_note = false` im Monat liegt
- **THEN** erscheint sie als „Krank ohne AU“

#### Scenario: Kind krank
- **WHEN** eine Abwesenheit Typ 5 mit `sick_note = true` im Monat liegt
- **THEN** erscheint sie als „Kind krank mit AU“

### Requirement: Fehltage nach Art
Der Report SHALL je Mitarbeiter und für den gesamten Monat die Summe der Fehltage je Art zeigen. Sobald Kranktage vorkommen, MUST er beide Werte „mit AU“ und „ohne AU“ zeigen, auch wenn einer davon 0 ist.

#### Scenario: Nur Kranktage mit AU
- **WHEN** ein Mitarbeiter im Monat 2 Kranktage mit AU und keine ohne AU hat
- **THEN** zeigt der Report „Krank mit AU: 2“ und „Krank ohne AU: 0“

### Requirement: Versand nur an Berechtigte oder hinterlegte Empfänger
Das System MUST den Fehlzeiten-Report nur an Benutzer des Mandanten mit `department_analysis.read` oder an die im Report-Zeitplan hinterlegten Adressen versenden. Ein Versand an frei eingegebene Adressen SHALL NOT möglich sein.

#### Scenario: Auswahl im Dialog
- **WHEN** ein Benutzer mit `department_analysis.send` „An Benutzer senden“ öffnet
- **THEN** stehen nur aktive Benutzer des eigenen Mandanten zur Wahl, die Abwesenheiten sehen dürfen

#### Scenario: Empfänger ohne Leserecht
- **WHEN** die Mutation mit einem Benutzer ohne `department_analysis.read` oder aus einem fremden Mandanten aufgerufen wird
- **THEN** wird nichts versendet und die Antwort meldet `success = false`

#### Scenario: Automatischer Versand
- **WHEN** der Zeitplan für Fehlzeiten aktiv ist und der eingestellte Versandtag (Standard 7) erreicht ist
- **THEN** geht der Report des Vormonats an die hinterlegten Adressen

### Requirement: Monatsübergreifende Abwesenheiten
Reicht eine Abwesenheit über die Monatsgrenze, SHALL das System ihre Tage nach Werktagen (Mo–Fr) auf die Monate verteilen. Das Ergebnis MUST auf halbe Tage gerundet werden.

#### Scenario: Urlaub über das Monatsende
- **WHEN** 5 Urlaubstage von Mi 28.01. bis Di 03.02. gebucht sind
- **THEN** zeigt der Februar-Report 2 Tage (nicht 2,14)

### Requirement: Kind krank in den Krank-Summen
In den Summen „Fehltage nach Art“ und in der Abteilungsanalyse SHALL das System Kind krank mit AU zu „Krank mit AU“ und Kind krank ohne AU zu „Krank ohne AU“ zählen. Eine eigene Summe oder Spalte für Kind krank SHALL NOT angezeigt werden. Die Einzelzeilen des Reports MUST die Art „Kind krank mit/ohne AU“ behalten.

#### Scenario: Kind krank mit AU
- **WHEN** ein Mitarbeiter 2 Tage krank mit AU und 3 Tage Kind krank mit AU hat
- **THEN** zeigen Summe und Abteilungsanalyse „Krank mit AU: 5“
