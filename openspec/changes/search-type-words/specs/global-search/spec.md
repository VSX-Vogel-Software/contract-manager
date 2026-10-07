## ADDED Requirements

### Requirement: Bereichswoerter grenzen ein
Enthaelt die Anfrage neben Suchbegriffen ein Bereichswort (Kunde, Vertrag, Rechnung, Angebot, Eingangsrechnung, Gegenpartei, Produkt - deutsch oder englisch, Ein- oder Mehrzahl), SHALL die Suche nur in diesem Bereich nach den uebrigen Woertern suchen. Findet sie dort nichts, SHALL sie die Anfrage woertlich suchen. Ein Bereichswort allein MUST eine normale Suche bleiben.

#### Scenario: Vertraege eines Kunden
- **WHEN** ein Benutzer "ksb verträge" eingibt
- **THEN** erscheinen nur Vertraege, die "ksb" enthalten

#### Scenario: Reihenfolge und Sprache egal
- **WHEN** ein Benutzer "Contracts KSB" eingibt
- **THEN** erscheinen dieselben Vertraege

#### Scenario: Woertlicher Rueckfall
- **WHEN** ein Benutzer "rechnungsmodul vertrag" eingibt und kein Vertrag "rechnungsmodul" enthaelt
- **THEN** erscheint das Produkt "Rechnungsmodul Vertrag"
