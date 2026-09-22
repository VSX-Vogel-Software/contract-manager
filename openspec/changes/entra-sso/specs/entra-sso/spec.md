## ADDED Requirements

### Requirement: Anmeldung über Microsoft Entra ID

Das System SHALL Benutzern die Anmeldung über Microsoft Entra ID per Authorization-Code-Flow mit PKCE ermöglichen, sofern SSO für ihren Mandanten konfiguriert und aktiviert ist. Nach erfolgreicher Prüfung MUST das System seinen eigenen Zugriffs-Token ausstellen; der weitere Ablauf der Anwendung bleibt unverändert.

#### Scenario: Erfolgreiche Anmeldung eines verknüpften Benutzers

- **WHEN** ein Benutzer den SSO-Weg wählt und Entra ein gültiges ID-Token für ein verknüpftes, aktives Konto liefert
- **THEN** stellt das System Zugriffs- und Erneuerungs-Token aus und der Benutzer landet angemeldet in der Anwendung

#### Scenario: SSO nicht konfiguriert

- **WHEN** für den Mandanten kein SSO konfiguriert oder es deaktiviert ist
- **THEN** wird der SSO-Weg nicht angeboten

### Requirement: ID-Token wird gegen das konfigurierte Verzeichnis geprüft

Das System SHALL Signatur, `aud` und `nonce` des ID-Tokens prüfen und die Anmeldung nur zulassen, wenn `tid` **und** `iss` auf das konfigurierte Verzeichnis zeigen.

#### Scenario: Token aus einem fremden Verzeichnis

- **WHEN** ein gültig signiertes ID-Token mit einer anderen `tid` als der konfigurierten eintrifft
- **THEN** wird die Anmeldung abgelehnt und kein Token ausgestellt

#### Scenario: Aussteller passt nicht zur Verzeichnis-ID

- **WHEN** `iss` und `tid` auf unterschiedliche Verzeichnisse zeigen
- **THEN** wird die Anmeldung abgelehnt

#### Scenario: Manipuliertes oder abgelaufenes Token

- **WHEN** die Signatur nicht gegen die JWKS des Verzeichnisses verifizierbar oder das Token abgelaufen ist
- **THEN** wird die Anmeldung abgelehnt

### Requirement: Schutz gegen untergeschobene Rückläufer

Das System SHALL `state` und `nonce` serverseitig mit Verfallszeit vorhalten und den Rückkanal ablehnen, wenn sie fehlen, nicht übereinstimmen oder abgelaufen sind.

#### Scenario: Rückkanal ohne passenden state

- **WHEN** der Rückkanal mit unbekanntem oder abgelaufenem `state` aufgerufen wird
- **THEN** wird die Anmeldung abgelehnt

### Requirement: Bestehende Benutzer werden verknüpft, nicht neu angelegt

Das System SHALL beim ersten SSO-Login über die E-Mail-Adresse zuordnen und dabei `oid` und `tid` am Benutzer speichern. Jede weitere Anmeldung MUST über `oid` zuordnen. Existiert kein passendes Konto, MUST die Anmeldung abgelehnt werden.

#### Scenario: Erste Anmeldung verknüpft das Konto

- **WHEN** sich ein Benutzer erstmals per SSO anmeldet und ein Konto mit derselben E-Mail-Adresse existiert
- **THEN** werden `oid` und `tid` an diesem Konto gespeichert und der Benutzer angemeldet

#### Scenario: Adresse hat sich im Verzeichnis geändert

- **WHEN** ein bereits verknüpfter Benutzer mit geänderter E-Mail-Adresse zurückkommt
- **THEN** erfolgt die Zuordnung über `oid`, und die Anmeldung gelingt

#### Scenario: Unbekanntes Konto

- **WHEN** das Verzeichnis einen Benutzer bestätigt, für den in der Anwendung kein Konto existiert
- **THEN** wird die Anmeldung mit einem verständlichen Hinweis abgelehnt und **kein** Konto angelegt

#### Scenario: Deaktiviertes Konto

- **WHEN** das zugeordnete Konto in der Anwendung deaktiviert ist
- **THEN** wird die Anmeldung abgelehnt

### Requirement: Zwei-Faktor nur überspringen, wenn das Token es belegt

Das System SHALL die anwendungseigene Zwei-Faktor-Prüfung bei SSO nur dann überspringen, wenn das ID-Token im `amr`-Claim eine mehrstufige Authentifizierung ausweist.

#### Scenario: Verzeichnis hat MFA durchgeführt

- **WHEN** `amr` den Wert `mfa` enthält
- **THEN** entfällt die anwendungseigene Zwei-Faktor-Prüfung

#### Scenario: Verzeichnis hat keine MFA durchgeführt

- **WHEN** `amr` keine mehrstufige Authentifizierung ausweist und für den Benutzer App-2FA aktiv ist
- **THEN** verlangt das System zusätzlich den zweiten Faktor wie bei der Passwort-Anmeldung

### Requirement: Abmelden mit und ohne Microsoft-Sitzung

Das System SHALL beim Abmelden die Wahl lassen, ob nur die Sitzung der Anwendung oder zusätzlich die Microsoft-Sitzung beendet wird.

#### Scenario: Nur hier abmelden

- **WHEN** der Benutzer „nur hier abmelden" wählt
- **THEN** werden die Token der Anwendung verworfen, die Microsoft-Sitzung bleibt bestehen

#### Scenario: Überall abmelden

- **WHEN** der Benutzer die vollständige Abmeldung wählt
- **THEN** wird er zusätzlich an den Abmelde-Endpunkt des Verzeichnisses weitergeleitet

### Requirement: Gesperrte Konten verlieren den Zugang beim Erneuern

Das System SHALL beim Erneuern eines Zugriffs-Tokens prüfen, ob das Konto noch aktiv ist.

#### Scenario: Konto während der Sitzung deaktiviert

- **WHEN** ein Erneuerungs-Token für ein inzwischen deaktiviertes Konto vorgelegt wird
- **THEN** wird kein neuer Zugriffs-Token ausgestellt
