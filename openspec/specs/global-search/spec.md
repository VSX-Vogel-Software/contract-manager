## ADDED Requirements

### Requirement: Globale Suche ueber Seiten und Daten
Die Suche in der Navigation SHALL ab zwei Zeichen Treffer liefern: Seiten der Anwendung (im Browser, nach Rechten gefiltert) sowie Kunden (Name, Kundennummer, E-Mail-Adressen, USt-ID), Vertraege (Name, Kundenname, SO-, PO-, AB-, Angebots- und NetSuite-Nummer), nicht stornierte Rechnungen (Nummer, Kundenname, Betrag), Angebote (Nummer, Kunde, Betrag), Eingangsrechnungen (Lieferant, Nummer, Betrag), Gegenparteien (Name, IBAN) und Produkte (Name, SKU) des eigenen Mandanten. Je Gruppe hoechstens `limit` Treffer (1-50) mit Hinweis auf weitere.

#### Scenario: Namensteil aus der Mitte
- **WHEN** ein Benutzer "lüdenscheidt" eingibt
- **THEN** erscheint der Kunde "Gebrüder Müller-Lüdenscheidt ..." unter den Kunden

#### Scenario: Neuer Bereich
- **WHEN** ein Benutzer eine Angebotsnummer eingibt
- **THEN** erscheint das Angebot in der Gruppe "Angebote"

#### Scenario: Zu kurze Eingabe
- **WHEN** ein Benutzer ein einzelnes Zeichen eingibt
- **THEN** liefert die Suche nichts und fragt die Datenbank nicht ab

### Requirement: Suche beachtet Zugriffsrechte
Die Suche SHALL dieselben Zugriffsregeln wie alle anderen Abfragen anwenden: Eine Gruppe erscheint nur, wenn die Rolle des Benutzers das Leserecht des Bereichs hat (`customers.read`, `contracts.read`, `invoices.read`, `offers.read`, `incoming_invoices.read`, `banking.read` fuer Gegenparteien, `products.read`) und - bei Zugriff per API-Schluessel - auch der Schluessel. Ohne Anmeldung, mit Anmeldung eines anderen Mandanten oder vor abgeschlossener Einrichtung der Zwei-Faktor-Anmeldung MUST die Suche eine leere Liste liefern, ohne Fehler.

#### Scenario: Rolle ohne Rechnungsrecht
- **WHEN** ein Benutzer ohne `invoices.read` nach einer Rechnungsnummer sucht
- **THEN** erscheint keine Rechnungsgruppe

#### Scenario: Zwei-Faktor-Einrichtung offen
- **WHEN** ein Benutzer, der sich nur mit Passwort angemeldet und 2FA noch nicht eingerichtet hat, sucht
- **THEN** liefert die Suche keine Treffer

#### Scenario: API-Schluessel mit eingeschraenkten Rechten
- **WHEN** ein API-Schluessel nur `contracts.read` hat
- **THEN** liefert die Suche nur Vertraege

### Requirement: Schreibvarianten
Die Suche SHALL Umlaute und ihre Umschreibung gleich behandeln (ä/ae, ö/oe, ü/ue, ß/ss), Akzente und Gross-/Kleinschreibung ignorieren und Bindestriche wie Leerzeichen werten. Liefert die Suche in keinem Bereich direkte Treffer, SHALL sie aehnlich geschriebene Treffer zeigen, gekennzeichnet als aehnlich. Gibt es irgendwo einen direkten Treffer, MUST sie keine aehnlichen dazumischen.

#### Scenario: Umschreibung
- **WHEN** ein Benutzer "Mueller" eingibt
- **THEN** erscheint "Gebrüder Müller-Lüdenscheidt ..."

#### Scenario: Tippfehler
- **WHEN** ein Benutzer "Gebrüdr" eingibt
- **THEN** erscheint "Gebrüder Müller-Lüdenscheidt ..." als aehnlicher Treffer

### Requirement: Mehrere Woerter
Besteht die Anfrage aus mehreren Woertern, SHALL ein Treffer jedes Wort in irgendeinem seiner durchsuchten Felder enthalten; die Reihenfolge ist egal.

#### Scenario: Andere Reihenfolge
- **WHEN** ein Benutzer "Müller Gebrüder" eingibt
- **THEN** erscheint "Gebrüder Müller-Lüdenscheidt ..."

### Requirement: Reihenfolge der Treffer
Exakte Treffer (etwa eine vollstaendige Rechnungsnummer) SHALL vor Treffern am Wortanfang, diese vor Teilstring-Treffern und diese vor aehnlichen Treffern stehen. Die Gruppe mit dem besten Treffer SHALL zuerst erscheinen. Eine reine Zahl trifft interne IDs nur exakt.

#### Scenario: Rechnungsnummer
- **WHEN** ein Benutzer eine vollstaendige Rechnungsnummer eingibt
- **THEN** steht diese Rechnung als erster Treffer ganz oben

### Requirement: Alle Treffer erreichbar
Die Anwendung SHALL eine Ergebnisseite mit allen Treffern je Bereich und Nachladen bieten. "Weitere Ergebnisse" und Enter ohne markierten Treffer SHALL sie oeffnen.

#### Scenario: Mehr als zehn Treffer
- **WHEN** ein Benutzer bei "Supportvertrag" auf "weitere Ergebnisse" tippt
- **THEN** oeffnet sich die Ergebnisseite mit allen passenden Vertraegen

### Requirement: Betraege finden
Eine als Betrag lesbare Anfrage ("38.700", "38700,50") SHALL Rechnungen, Eingangsrechnungen und Angebote mit genau diesem Netto- oder Bruttobetrag finden.

#### Scenario: Bruttobetrag
- **WHEN** ein Benutzer den Bruttobetrag einer Rechnung eingibt
- **THEN** erscheint diese Rechnung
