## Context

Suche seit 2.42.0 in `backend/apps/core/search.py` (`run_search`). Die Ergebnisseite laedt je Bereich mit `types=[...]` und derselben Anfrage nach.

## Goals / Non-Goals

**Goals:** "ksb vertraege", "Vertraege KSB", "ksb contracts" zeigen die KSB-Vertraege.
**Non-Goals:** weitere Filter in der Anfrage (Status, Datum), Anzeige des Filters als Chip.

## Decisions

1. **Woerterliste** `TYPE_WORDS` (gefaltet): je Bereich deutsch/englisch, Ein- und Mehrzahl, dazu "Lieferantenrechnung", "Quote", "Artikel". Mehrere Bereichswoerter = Vereinigung.
2. **Nur mit Rest:** Bleibt nach dem Abtrennen nichts uebrig ("Vertraege" allein), ist es eine normale Suche.
3. **Rueckfall woertlich:** Findet die eingegrenzte Suche nichts, laeuft die Anfrage unveraendert - ein Produkt "Rechnungsmodul Vertrag" bleibt auffindbar. Beim Nachladen (`offset > 0`) zaehlt die eingegrenzte Suche als zustaendig, solange sie ueberhaupt Treffer hat.
4. **Mit `types`:** Schnittmenge aus `types` und Bereichswoertern; leer -> woertlich.
5. Frontend unveraendert: Gruppen kommen nur fuer den Bereich, die Ergebnisseite laedt mit derselben Anfrage nach.

## Risks / Trade-offs

- Ein Name, der nur aus Bereichswort + Begriff besteht, wird eingegrenzt gesucht; der woertliche Rueckfall greift nur ohne eingegrenzte Treffer. Akzeptiert.
- Eingegrenzt ohne direkte Treffer kann der unscharfe Durchgang im Bereich greifen statt des woertlichen Rueckfalls. Akzeptiert (Treffer sind als aehnlich gekennzeichnet).
