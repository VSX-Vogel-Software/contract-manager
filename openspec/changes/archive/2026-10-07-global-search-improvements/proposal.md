## Why

Die globale Suche findet heute nur zusammenhaengende Teilstrings in drei Bereichen (Kunden, Vertraege, Rechnungsnummern). Bewertung vom 07.10.2026: 21 von 39 typischen Anfragen liefen wie erwartet. Es scheitern Umlaut-Umschreibungen ("Mueller"), Tippfehler ("Gebrüdr"), mehrere Woerter in anderer Reihenfolge ("Müller Gebrüder"), Angebote, Produkte, Eingangsrechnungen, Gegenparteien, E-Mail-Adressen, USt-ID und Betraege. Exakte Treffer stehen nicht vorn, und "weitere Ergebnisse" fuehrt nirgends hin.

## What Changes

- **Toleranz:** deutsche Faltung (ae/oe/ue/ss, Akzente per `unaccent`) fuer Daten und Anfrage; Fallback per Trigramm-Aehnlichkeit, wenn es keine direkten Treffer gibt.
- **Mehrwort:** jedes Wort muss in irgendeinem durchsuchten Feld des Treffers vorkommen, Reihenfolge egal.
- **Mehr Bereiche und Felder:** Angebote, Produkte (Name, SKU), Eingangsrechnungen (Lieferant, Nummer), Gegenparteien (Name, IBAN); Kunden zusaetzlich nach E-Mail und USt-ID, Vertraege nach Kundenname und weiteren Nummern, Rechnungen nach Kundenname und Betrag.
- **Ranking:** exakt vor Wortanfang vor Teilstring vor unscharf; Gruppen nach ihrem besten Treffer geordnet; reine Zahlen treffen IDs nur exakt.
- **Ergebnisseite** `/search?q=` mit allen Treffern je Bereich und Nachladen; "weitere Ergebnisse" und Enter ohne Auswahl fuehren dorthin.
- **Darstellung:** Fundstelle im Treffer hervorgehoben, eigenes Symbol je Bereich, veraltete Treffer waehrend des Tippens abgeblendet; Seitensuche mit derselben Faltung, fehlende Seiten ergaenzt.

## Capabilities

### New Capabilities
- Keine

### Modified Capabilities
- `global-search`

## Impact

- Backend: neues Modul fuer die Suche, Migration `CREATE EXTENSION unaccent` (Produktionsrolle darf das, am 07.10.2026 geprueft) und eine IMMUTABLE-Faltungsfunktion in SQL; GraphQL `globalSearch` bekommt optionale Argumente `types` und `offset` (abwaertskompatibel).
- Frontend: `GlobalSearch`, neue Route `/search`.
- Keine Aenderung an Rechten: jede neue Gruppe nur mit ihrem Leserecht.
