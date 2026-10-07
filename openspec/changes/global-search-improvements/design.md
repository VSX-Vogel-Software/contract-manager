## Context

Resolver `global_search` in `backend/apps/core/schema.py` (seit 2.41.2 mit Rechtepruefung je Gruppe). Postgres 16, `pg_trgm` 1.6 installiert, `unaccent` verfuegbar. Datenmengen live: einige hundert Kunden/Vertraege, wenige tausend Rechnungen - Seq-Scans mit Teilstring-Vergleich bleiben unter 10 ms; Indizes sind fuer die Geschwindigkeit nicht noetig.

Gemessene Trigramm-Aehnlichkeit (word_similarity) ohne Faltung: Gebrüdr 0,75; Giesserei 0,46; Muller 0,43; Mueller 0,375 - Trigramme allein loesen Umlaut-Umschreibungen nicht, daher Faltung zuerst.

## Goals / Non-Goals

**Goals:** typische deutsche Schreibvarianten finden, mehr Bereiche, sinnvolle Reihenfolge, alle Treffer erreichbar.
**Non-Goals:** Volltextsuche in Notizen, Kommentaren und Dokumenten (spaeter), Suchindex ausserhalb von Postgres, Synonyme.

## Decisions

1. **Faltung `fold(text)`** identisch in Python und SQL: lower; ä→ae, ö→oe, ü→ue, ß→ss; danach `unaccent` fuer uebrige Akzente; Bindestriche/Satzzeichen → Leerzeichen; Mehrfach-Leerzeichen zusammenziehen. SQL als IMMUTABLE-Funktion `cm_fold(text)` per Migration (`unaccent` mit fest angegebenem Woerterbuch, damit IMMUTABLE zulaessig ist). Damit findet "Mueller" "Müller" und "Müller" "Mueller".
2. **Tokens:** Anfrage gefaltet und an Leerzeichen zerlegt (max. 6 Woerter, Woerter < 2 Zeichen verworfen). Treffer = fuer **jedes** Wort enthaelt das gefaltete Verkettungsfeld (alle durchsuchten Felder einer Zeile, mit Leerzeichen verbunden) das Wort.
3. **Unscharf als Fallback:** Liefert die Suche in *keinem* Bereich direkte Treffer, folgt ein zweiter Durchgang per `word_similarity(token, cm_fold(feld)) >= 0.45` je Wort, nur fuer Woerter ab 3 Zeichen ohne Ziffern. (Zuerst je Bereich umgesetzt - das brachte Rauschen wie "Supportvertrag" -> Produkt "Support-Kontingent" und bis zu doppelt so viele Abfragen.)
4. **Ranking je Treffer** (Case/When): 0 exakte Gleichheit eines Felds (Nummern!), 1 Feld beginnt mit der Anfrage, 2 ein Wort beginnt mit dem ersten Token, 3 Teilstring, 4 unscharf; danach Feldspezifisch (z. B. Rechnungsdatum absteigend). Reine Zahl trifft `id` nur exakt und ohne fuehrende Nullen. Gruppenreihenfolge nach bestem Rang, bei Gleichstand fest (Kunden, Vertraege, Rechnungen, Angebote, Eingangsrechnungen, Gegenparteien, Produkte).
5. **Betraege:** Anfrage, die als deutscher oder englischer Betrag lesbar ist ("38.700", "38700", "38.700,50", "38,700.50"), sucht zusaetzlich Rechnungen/Eingangsrechnungen/Angebote mit Netto oder Brutto gleich dem Betrag (±0,01).
6. **GraphQL** abwaertskompatibel: `globalSearch(query, limit = 10, types: [String!] = null, offset: Int = 0)`. Typen: `customer, contract, invoice, offer, incoming_invoice, counterparty, product`. `offset` fuer die Ergebnisseite (je Typ nachladen). Jede Gruppe nur mit ihrem Leserecht (`offers.read`, `products.read`, `incoming_invoices.read`, `banking.read` ...), wie in 2.41.2.
7. **Ergebnisseite** `/search?q=&type=`: alle Gruppen mit je 25 Treffern, "mehr laden" je Gruppe; auf dem Telefon Karten. Enter ohne markierten Treffer und "weitere Ergebnisse" oeffnen sie.
8. **Hervorhebung** im Frontend: dieselbe Faltung in TypeScript, Fundstellen der Tokens im Titel/Untertitel fett; unscharfe Treffer ohne Hervorhebung.
9. **Seitensuche** im Browser mit derselben Faltung; ergaenzt um Eingangsrechnungen und Info.

## Risks / Trade-offs

- `unaccent` als Extension: Migration muss `CREATE EXTENSION IF NOT EXISTS` vertragen; lokal und in CI (Postgres-Container) gleich.
- Seq-Scan ueber `cm_fold(...)`: bei heutigen Mengen < 20 ms gemessen erwartet; spaeter Trigramm-GIN-Index auf `cm_fold(...)` moeglich (Funktion ist IMMUTABLE).
- Mehr Bereiche = mehr Abfragen je Tastendruck (7 statt 3); alle laufen nur mit Recht und mit Debounce 300 ms.

## Migration Plan

Migration legt `unaccent` und `cm_fold` an; Rueckweg: Funktion und Extension bleiben harmlos bestehen, Resolver faellt beim Zurueckrollen auf den alten Code zurueck.
