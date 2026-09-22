## Requirements

### Requirement: Unbehandelte Fehler werden dem Benutzer angezeigt

Das System SHALL jeden Fehler, den kein Aufrufer selbst behandelt, als Meldung am unteren Bildrand anzeigen. Ein Fehler, der ausschliesslich im Protokoll oder in der Browser-Console landet, gilt als nicht gemeldet.

#### Scenario: GraphQL-Fehler ohne eigene Behandlung

- **WHEN** eine GraphQL-Antwort einen Fehler enthaelt und die ausloesende Operation keine eigene Anzeige vorsieht
- **THEN** erscheint eine Fehlermeldung mit dem Grund aus der Serverantwort

#### Scenario: Verbindung zum Server abgebrochen

- **WHEN** eine Anfrage auf Transportebene scheitert (Netzwerkfehler, abgebrochene Verbindung)
- **THEN** erscheint eine Fehlermeldung, die auf die fehlende Serververbindung hinweist

#### Scenario: Fehler als Nutzdaten

- **WHEN** eine Mutation erfolgreich antwortet, ihre Nutzdaten aber ein Feld mit `success == false` enthalten
- **THEN** erscheint eine Fehlermeldung mit dem Wert aus `error` bzw. den Eintraegen aus `errors`

#### Scenario: Fehlschlag ohne Begruendung

- **WHEN** ein Nutzdaten-Feld `success == false` meldet, aber keinen Grund mitliefert
- **THEN** erscheint trotzdem eine Fehlermeldung ohne Begruendungstext

### Requirement: Inline behandelte Fehler bleiben inline

Das System SHALL keine zusaetzliche Meldung anzeigen, wenn der Aufrufer den Fehler selbst darstellt. Die Operation kennzeichnet das ueber `context: { suppressErrorToast: true }`. Jede Aufrufstelle, die einen Fehler inline anzeigt, MUST dieses Kennzeichen setzen; dieselbe Aussage darf dem Benutzer nicht zweimal begegnen.

#### Scenario: Formularfehler am Feld

- **WHEN** eine Operation mit gesetztem `suppressErrorToast` fehlschlaegt
- **THEN** erscheint keine Meldung am Bildrand, und die Anzeige bleibt dem Aufrufer ueberlassen

#### Scenario: Maske zeigt den Fehler bereits an

- **WHEN** eine Maske den Fehler einer Mutation inline darstellt
- **THEN** erscheint zu demselben Fehlschlag keine zusaetzliche Meldung am Bildrand

### Requirement: Abgelaufene Sitzung navigiert statt zu melden

Das System SHALL bei einem Authentifizierungsfehler die gespeicherten Token verwerfen und zur Anmeldung navigieren, ohne eine Fehlermeldung anzuzeigen.

#### Scenario: Token abgelaufen

- **WHEN** eine Antwort den Fehler `Authentication required` enthaelt und ein Token gespeichert ist
- **THEN** werden Access- und Refresh-Token entfernt und die Anmeldeseite geoeffnet, ohne Meldung am Bildrand

#### Scenario: Kein Token vorhanden

- **WHEN** derselbe Fehler auftritt, ohne dass ein Token gespeichert ist
- **THEN** findet keine Navigation statt

### Requirement: Nur Mutationen werden auf Nutzdaten-Fehler geprueft

Das System SHALL Antworten von Abfragen nicht auf `success == false` pruefen. Ein Feld dieses Namens in einer Abfrage ist eine Sachaussage, kein Fehlschlag.

#### Scenario: Abfrage liefert ein Feld success

- **WHEN** eine Abfrage ein Objekt mit `success == false` zurueckgibt
- **THEN** erscheint keine Fehlermeldung

### Requirement: Gleiche Meldung wird nicht gestapelt

Das System SHALL eine bereits sichtbare Meldung nicht erneut anzeigen, wenn derselbe Fehler mehrfach eintrifft.

#### Scenario: Mehrere Abfragen scheitern am selben Fehler

- **WHEN** mehrere gleichzeitige Anfragen mit identischem Titel und identischem Grund scheitern
- **THEN** ist genau eine Meldung sichtbar

#### Scenario: Verschiedene Fehler gleichzeitig

- **WHEN** zwei Anfragen mit unterschiedlichen Gruenden scheitern
- **THEN** sind zwei Meldungen sichtbar

### Requirement: Meldungen verschwinden von selbst und lassen sich schliessen

Das System SHALL eine Meldung nach einer festgelegten Dauer selbsttaetig entfernen und dem Benutzer erlauben, sie vorher zu schliessen. Eine Dauer von 0 haelt die Meldung, bis sie geschlossen wird.

#### Scenario: Meldung laeuft ab

- **WHEN** die Anzeigedauer einer Meldung verstrichen ist
- **THEN** verschwindet sie ohne Zutun des Benutzers

#### Scenario: Benutzer schliesst die Meldung

- **WHEN** der Benutzer die Meldung schliesst
- **THEN** verschwindet sie sofort und belegt keinen Platz mehr im Speicher

### Requirement: Fehler ausserhalb von React koennen melden

Das System SHALL das Melden von Fehlern auch aus Code erlauben, der keinen React-Kontext hat — etwa aus der Apollo-Link-Kette oder aus einem Event-Handler.

#### Scenario: Meldung aus der Link-Kette

- **WHEN** ein Apollo-Link einen Fehler feststellt
- **THEN** kann er die Meldung ohne React-Kontext ausloesen, und die Anzeige erscheint

### Requirement: Aktionen ohne sichtbare Wirkung bestaetigen sich

Das System SHALL eine Bestaetigung anzeigen, wenn eine Aktion gelingt, ohne dass sich die Oberflaeche sichtbar aendert. Fuehrt die Aktion zu einer sichtbaren Zustandsaenderung, MUST keine zusaetzliche Bestaetigung erscheinen.

#### Scenario: Einstellung gespeichert

- **WHEN** ein Benutzer eine Einstellung speichert, deren Oberflaeche danach unveraendert aussieht
- **THEN** erscheint eine Bestaetigung, dass gespeichert wurde

#### Scenario: Liste aendert sich sichtbar

- **WHEN** eine Aktion einen Eintrag entfernt und die Liste neu geladen wird
- **THEN** erscheint keine zusaetzliche Bestaetigung

#### Scenario: Erfolg trotz Fehlschlag in den Nutzdaten

- **WHEN** eine Aktion technisch durchlaeuft, ihre Nutzdaten aber einen Fehlschlag melden
- **THEN** erscheint keine Bestaetigung, sondern ausschliesslich die Fehlermeldung

### Requirement: Bestaetigungen sind kuerzer sichtbar als Fehler

Das System SHALL Bestaetigungen nach kuerzerer Zeit ausblenden als Fehlermeldungen.

#### Scenario: Bestaetigung und Fehler nebeneinander

- **WHEN** eine Bestaetigung und eine Fehlermeldung gleichzeitig angezeigt werden
- **THEN** verschwindet die Bestaetigung zuerst

### Requirement: Fehlende Berechtigung wird erklaert statt leer dargestellt

Das System SHALL einem Benutzer, der einen Bereich ohne die noetige Berechtigung aufruft, den Grund in der Flaeche anzeigen, statt eine leere Flaeche zu hinterlassen.

#### Scenario: Bereich ohne Berechtigung ueber einen Direktlink

- **WHEN** ein Benutzer einen Bereich aufruft, fuer den ihm die Berechtigung fehlt
- **THEN** erscheint an der Stelle des Inhalts ein Hinweis auf die fehlende Berechtigung

### Requirement: Hoechstens vier Meldungen gleichzeitig

Das System SHALL nicht mehr als vier Meldungen gleichzeitig anzeigen. Trifft eine weitere ein, MUST die aelteste weichen — die neueste bleibt immer sichtbar.

#### Scenario: Viele Fehler in kurzer Folge

- **WHEN** fuenf verschiedene Meldungen kurz hintereinander eintreffen
- **THEN** sind vier davon sichtbar, darunter die neueste, und die aelteste ist verschwunden

