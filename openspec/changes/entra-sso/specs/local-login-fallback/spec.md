## ADDED Requirements

### Requirement: Lokale Anmeldung bleibt über einen festen Pfad erreichbar

Das System SHALL die Anmeldung mit E-Mail und Passwort unter einem festen Pfad anbieten, der unabhängig davon funktioniert, ob die Anmeldemaske einen Ausfall des Verzeichnisses erkannt hat.

#### Scenario: Notweg direkt aufrufen

- **WHEN** ein Benutzer den festen Pfad zur lokalen Anmeldung aufruft
- **THEN** wird das Anmeldeformular angezeigt, auch wenn SSO für den Mandanten aktiv ist

### Requirement: Der Notweg wird nur bei technischem Ausfall angeboten

Das System SHALL die lokale Anmeldung nach einem SSO-Versuch nur dann einblenden, wenn das Verzeichnis technisch nicht erreichbar war. Eine Ablehnung durch das Verzeichnis MUST **nicht** zum Anbieten der lokalen Anmeldung führen.

#### Scenario: Verzeichnis nicht erreichbar

- **WHEN** der SSO-Versuch an einer Zeitüberschreitung oder einem Serverfehler des Verzeichnisses scheitert
- **THEN** erscheint ein Hinweis auf die Nichterreichbarkeit zusammen mit der lokalen Anmeldung

#### Scenario: Verzeichnis lehnt den Benutzer ab

- **WHEN** das Verzeichnis die Anmeldung ablehnt, etwa weil das Konto gesperrt ist
- **THEN** erscheint die Ablehnung ohne Angebot der lokalen Anmeldung

#### Scenario: Benutzer im Verzeichnis unbekannt in der Anwendung

- **WHEN** das Verzeichnis bestätigt, die Anwendung das Konto aber nicht kennt
- **THEN** erscheint der entsprechende Hinweis ohne Angebot der lokalen Anmeldung

### Requirement: Die Zugangsentscheidung trifft das Backend

Das System SHALL beim Anmeldeversuch mit Passwort serverseitig prüfen, ob für dieses Konto die lokale Anmeldung erlaubt ist, unabhängig davon, ob und wie das Formular erreicht wurde.

#### Scenario: Konto ohne erlaubte lokale Anmeldung

- **WHEN** ein Benutzer ohne erlaubte lokale Anmeldung gültige Zugangsdaten sendet
- **THEN** wird die Anmeldung abgelehnt und kein Token ausgestellt

#### Scenario: Notfallkonto

- **WHEN** ein als Notfallkonto gekennzeichneter Benutzer gültige Zugangsdaten sendet
- **THEN** gelingt die Anmeldung, einschließlich der bestehenden Zwei-Faktor-Prüfung

### Requirement: Nutzung des Notwegs wird festgehalten

Das System SHALL jede erfolgreiche Anmeldung mit Passwort bei aktivem SSO als Ereignis protokollieren.

#### Scenario: Notweg wurde benutzt

- **WHEN** sich ein Benutzer bei aktivem SSO mit Passwort anmeldet
- **THEN** entsteht ein Protokolleintrag mit Benutzer und Zeitpunkt
