## ADDED Requirements

### Requirement: Aktionen ohne sichtbare Wirkung bestätigen sich

Das System SHALL eine Bestätigung anzeigen, wenn eine Aktion gelingt, ohne dass sich die Oberfläche sichtbar ändert. Führt die Aktion zu einer sichtbaren Zustandsänderung, MUST keine zusätzliche Bestätigung erscheinen.

#### Scenario: Einstellung gespeichert

- **WHEN** ein Benutzer eine Einstellung speichert, deren Oberfläche danach unverändert aussieht
- **THEN** erscheint eine Bestätigung, dass gespeichert wurde

#### Scenario: Liste ändert sich sichtbar

- **WHEN** eine Aktion einen Eintrag entfernt und die Liste neu geladen wird
- **THEN** erscheint keine zusätzliche Bestätigung

### Requirement: Bestätigungen sind kürzer sichtbar als Fehler

Das System SHALL Bestätigungen nach kürzerer Zeit ausblenden als Fehlermeldungen.

#### Scenario: Bestätigung und Fehler nebeneinander

- **WHEN** eine Bestätigung und eine Fehlermeldung gleichzeitig angezeigt werden
- **THEN** verschwindet die Bestätigung zuerst

### Requirement: Fehlende Berechtigung wird erklärt statt leer dargestellt

Das System SHALL einem Benutzer, der einen Bereich ohne die nötige Berechtigung aufruft, den Grund anzeigen, statt eine leere Fläche zu hinterlassen.

#### Scenario: Bereich ohne Berechtigung

- **WHEN** ein Benutzer einen Bereich aufruft, für den ihm die Berechtigung fehlt
- **THEN** erscheint in der Fläche ein Hinweis auf die fehlende Berechtigung

## MODIFIED Requirements

### Requirement: Inline behandelte Fehler bleiben inline

Das System SHALL keine zusätzliche Meldung anzeigen, wenn der Aufrufer den Fehler selbst darstellt. Die Operation kennzeichnet das über `context: { suppressErrorToast: true }`. Jede Aufrufstelle, die einen Fehler inline anzeigt, MUST dieses Kennzeichen setzen; dieselbe Aussage darf dem Benutzer nicht zweimal begegnen.

#### Scenario: Formularfehler am Feld

- **WHEN** eine Operation mit gesetztem `suppressErrorToast` fehlschlägt
- **THEN** erscheint keine Meldung am Bildrand, und die Anzeige bleibt dem Aufrufer überlassen

#### Scenario: Maske zeigt den Fehler bereits an

- **WHEN** eine Maske den Fehler einer Mutation inline darstellt
- **THEN** erscheint zu demselben Fehlschlag keine zusätzliche Meldung am Bildrand
