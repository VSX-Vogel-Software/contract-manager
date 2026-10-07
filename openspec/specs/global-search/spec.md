## ADDED Requirements

### Requirement: Globale Suche ueber Seiten und Daten
Die Suche in der Navigation SHALL ab zwei Zeichen Treffer liefern: Seiten der Anwendung (im Browser, nach Rechten gefiltert) sowie Kunden (Name, Kundennummer), Vertraege (Name, SO-, PO- und AB-Nummer) und nicht stornierte Rechnungen (Rechnungsnummer) des eigenen Mandanten. Gesucht wird als zusammenhaengender Teilstring ohne Ruecksicht auf Gross- und Kleinschreibung; je Gruppe hoechstens `limit` Treffer (1-50) mit Hinweis auf weitere.

#### Scenario: Namensteil aus der Mitte
- **WHEN** ein Benutzer "lüdenscheidt" eingibt
- **THEN** erscheint der Kunde "Gebrüder Müller-Lüdenscheidt ..." unter den Kunden

#### Scenario: Zu kurze Eingabe
- **WHEN** ein Benutzer ein einzelnes Zeichen eingibt
- **THEN** liefert die Suche nichts und fragt die Datenbank nicht ab

### Requirement: Suche beachtet Zugriffsrechte
Die Suche SHALL dieselben Zugriffsregeln wie alle anderen Abfragen anwenden: Eine Gruppe erscheint nur, wenn die Rolle des Benutzers das Leserecht des Bereichs hat (`customers.read`, `contracts.read`, `invoices.read`) und - bei Zugriff per API-Schluessel - auch der Schluessel. Ohne Anmeldung, mit Anmeldung eines anderen Mandanten oder vor abgeschlossener Einrichtung der Zwei-Faktor-Anmeldung MUST die Suche eine leere Liste liefern, ohne Fehler.

#### Scenario: Rolle ohne Rechnungsrecht
- **WHEN** ein Benutzer ohne `invoices.read` nach einer Rechnungsnummer sucht
- **THEN** erscheint keine Rechnungsgruppe

#### Scenario: Zwei-Faktor-Einrichtung offen
- **WHEN** ein Benutzer, der sich nur mit Passwort angemeldet und 2FA noch nicht eingerichtet hat, sucht
- **THEN** liefert die Suche keine Treffer

#### Scenario: API-Schluessel mit eingeschraenkten Rechten
- **WHEN** ein API-Schluessel nur `contracts.read` hat
- **THEN** liefert die Suche nur Vertraege
