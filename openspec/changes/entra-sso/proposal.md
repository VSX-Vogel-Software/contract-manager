## Why

Die Anmeldung läuft heute ausschließlich über E-Mail und Passwort mit eigener Zwei-Faktor-Prüfung. Alle Benutzer existieren ohnehin schon im Microsoft-Verzeichnis; die Anwendung führt also eine zweite Identitätsverwaltung mit eigenen Passwörtern, eigenem Zurücksetzen und eigener MFA parallel dazu.

Das kostet nicht nur Pflege, es ist auch eine Lücke beim Ausscheiden von Mitarbeitern: Ein im Verzeichnis gesperrtes Konto kann sich hier weiterhin mit seinem Passwort anmelden. Wird die Anmeldung an Entra ID übergeben, wirkt jede Sperrung sofort, und Bedingungen wie MFA oder Gerätevorgaben gelten ohne Zutun der Anwendung.

Ziel ist die Anmeldung über Entra ID **neben** der bestehenden, mit der Aussicht, diese später abzulösen. Bestehende Benutzer bleiben erhalten und werden verknüpft, nicht ersetzt.

## What Changes

- **Neuer Anmeldeweg** über Authorization-Code-Flow mit PKCE. Nach erfolgreicher Prüfung stellt die Anwendung ihren **bestehenden JWT** aus — Kontext, Rechte und Frontend-Sitzung bleiben unverändert.
- **Verknüpfung statt Neuanlage**: Beim ersten Mal wird über die E-Mail-Adresse zugeordnet, danach über die Objekt-ID (`oid`) aus dem Token. Neue Felder `entra_object_id` und `entra_tenant_id` am Benutzer.
- **Kein Auto-Provisioning** in der ersten Stufe: Nur Konten, die in der Anwendung bereits existieren, können sich anmelden.
- **Zwei-Faktor** wird für diesen Weg nur übersprungen, wenn das Token es belegt (`amr` enthält `mfa`). Sonst greift die App-eigene Prüfung weiter.
- **Abmelden** bietet die Wahl zwischen „nur hier" und der Weiterleitung zum Abmelden bei Microsoft.
- **Notweg** für den Fall, dass Entra nicht erreichbar ist: fester Pfad zur lokalen Anmeldung, Einblendung nach technischem Fehlschlag, und die eigentliche Entscheidung im Backend — nach der Umstellung können nur ausdrücklich markierte Notfallkonten den lokalen Weg gehen.
- **Pro Mandant schaltbar**, mit eigener App-Registrierung getrennt von der des Mailversands.
- **Rollen bleiben in der Anwendung.** Eine Abbildung von Verzeichnisgruppen auf Rollen ist ausdrücklich nicht Teil dieser Änderung.

## Capabilities

### New Capabilities

- `entra-sso`: Anmeldung über Microsoft Entra ID — Authorization-Code-Flow mit PKCE, strenge Prüfung des ID-Tokens gegen das konfigurierte Verzeichnis, Verknüpfung bestehender Benutzer über `oid`, Ausstellung des anwendungseigenen JWT, Abmeldung mit und ohne Microsoft-Sitzung.
- `local-login-fallback`: Notweg für den Ausfall des Identitätsanbieters — fester Pfad zur lokalen Anmeldung, Einblendung nur bei technischem Fehlschlag, Begrenzung auf Notfallkonten nach der Umstellung, Protokollierung jeder Nutzung.

### Modified Capabilities

- `password-management`: Konten ohne erlaubte lokale Anmeldung bekommen ein unbrauchbares Passwort; Zurücksetzen und Ändern gelten nur noch für Konten mit erlaubter lokaler Anmeldung.
- `user-administration`: Sichtbarkeit, ob ein Benutzer mit dem Verzeichnis verknüpft ist, und ob er den lokalen Weg noch gehen darf.
