## MODIFIED Requirements

### Requirement: Globale Suche ueber Seiten und Daten
Die Suche in der Navigation SHALL ab zwei Zeichen Treffer liefern: Seiten der Anwendung sowie Kunden (Name, Kundennummer, E-Mail-Adressen, USt-ID), Vertraege (Name, Kundenname, SO-, PO-, AB-, Angebots- und NetSuite-Nummer), nicht stornierte Rechnungen (Nummer, Kundenname, Betrag), Angebote (Nummer, Kunde, Betrag), Eingangsrechnungen (Lieferant, Nummer, Betrag), Gegenparteien (Name, IBAN) und Produkte (Name, SKU) des eigenen Mandanten - jeweils nur mit dem Leserecht des Bereichs.

#### Scenario: Namensteil aus der Mitte
- **WHEN** ein Benutzer "lüdenscheidt" eingibt
- **THEN** erscheint der Kunde "Gebrüder Müller-Lüdenscheidt ..." unter den Kunden

#### Scenario: Neuer Bereich
- **WHEN** ein Benutzer eine Angebotsnummer eingibt
- **THEN** erscheint das Angebot in der Gruppe "Angebote"

## ADDED Requirements

### Requirement: Schreibvarianten
Die Suche SHALL Umlaute und ihre Umschreibung gleich behandeln (ä/ae, ö/oe, ü/ue, ß/ss), Akzente ignorieren und Bindestriche wie Leerzeichen werten. Liefert die Suche in keinem Bereich direkte Treffer, SHALL sie aehnlich geschriebene Treffer zeigen, gekennzeichnet als aehnlich. Gibt es irgendwo einen direkten Treffer, MUST sie keine aehnlichen dazumischen.

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
