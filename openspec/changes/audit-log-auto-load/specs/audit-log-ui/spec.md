## MODIFIED Requirements

### Requirement: Audit log supports pagination

The system SHALL paginate audit log results for performance. Am Listenende SHALL
nach einer kurzen Wartezeit von selbst nachgeladen werden; der Benutzer MUST
diese Automatik an derselben Stelle anhalten koennen, und sie MUST nach einer
festen Zahl von Runden von selbst enden.

#### Scenario: Initial page load
- **WHEN** audit log page loads
- **THEN** system shows the first page of results (e.g., 25 entries)

#### Scenario: Load more entries
- **WHEN** user scrolls or clicks "Load More"
- **THEN** system fetches and appends the next page of entries

#### Scenario: Total count displayed
- **WHEN** audit log is displayed
- **THEN** system shows the total count of matching entries

#### Scenario: Listenende kommt in Sicht
- **WHEN** das Listenende sichtbar wird und es eine weitere Seite gibt
- **THEN** zeigt der Knopf eine laufende Anzeige mit dem Hinweis zum Anhalten
  und haengt nach zwei Sekunden die naechste Seite an

#### Scenario: Hochscrollen vor Ablauf der Wartezeit
- **WHEN** das Listenende wieder ausser Sicht geraet, bevor die zwei Sekunden um
  sind
- **THEN** wird nicht nachgeladen

#### Scenario: Automatik anhalten
- **WHEN** der Benutzer den Knopf waehrend der Wartezeit anklickt
- **THEN** wird nicht nachgeladen, der Knopf ist wieder ein gewoehnliches
  "Mehr laden", und darunter steht ein Weg zum Wiederaktivieren

#### Scenario: Automatik wieder aufnehmen
- **WHEN** der Benutzer "wieder aktivieren" waehlt
- **THEN** laedt die naechste Seite nach zwei Sekunden, und die Rundenzaehlung
  beginnt von vorn

#### Scenario: Grenze erreicht
- **WHEN** fuenf Seiten hintereinander von selbst nachgeladen wurden
- **THEN** haelt die Automatik an und der Benutzer entscheidet selbst, ob es
  weitergeht

#### Scenario: Filterwechsel
- **WHEN** ein Filter geaendert wird
- **THEN** beginnt die Rundenzaehlung von vorn, eine angehaltene Automatik
  bleibt angehalten
