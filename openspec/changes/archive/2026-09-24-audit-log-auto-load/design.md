# Design

## Context

Das Nachladen haengt heute allein am Knopf am Listenende
(`AuditLogPage.tsx`), der `fetchMore` mit dem Cursor aufruft. Gewuenscht ist
ein Nachladen von selbst, ohne dass daraus ein Scrollband wird, das sich nicht
mehr abstellen laesst.

## Goals / Non-Goals

**Goals**

- Kein Klick noetig, solange man ohnehin weiterliest.
- Abschalten ohne Suchen: dort, wo es stoert.
- Eine Obergrenze, damit niemand versehentlich die ganze Tabelle zieht.

**Non-Goals**

- Virtualisierte Liste. Erst noetig, wenn die Zeilenzahl das Rendern bremst.
- Merken der Entscheidung ueber die Sitzung hinaus. Erst wenn sich zeigt, dass
  jemand sie bei jedem Besuch erneut trifft.
- Die Aktivitaets-Reiter der Detailansichten.

## Decisions

### Der Knopf ist auch der Schalter

Zur Wahl standen ein eigener Schalter ueber der Tabelle und ein reines
Anhalten beim Hochscrollen. Der Schalter ueber der Tabelle steht genau dort
nicht, wo er gebraucht wird - man muesste vom Listenende nach oben. Reines
Hochscrollen wiederum ist kein Abschalten: wer am Ende stehenbleibt, bekommt
es weiter.

Der Knopf traegt die Wartezeit sichtbar und nimmt den Klick als Abbruch. Das
ist der kuerzeste Weg zwischen Aerger und Abhilfe. Preis: waehrend die
Wartezeit laeuft, laedt ein Klick nicht von Hand nach, sondern haelt an. Das
steht im Knopf, und wer wirklich weiterblaettern will, wartet zwei Sekunden
oder klickt danach erneut.

### Zwei Sekunden

Genug, um die letzten Zeilen zu ueberfliegen, kurz genug, um beim
Durchscrollen nicht als Warten aufzufallen. Eine halbe Sekunde weniger und der
Abbruch-Klick wird zur Reaktionsuebung.

### Fuenf Runden

Fuenf Runden zu 25 sind 125 zusaetzliche Eintraege - genug, um eine Spur zu
verfolgen, wenig genug, dass ein offener Tab keine Tabelle mit Zehntausenden
Zeilen in den Browser zieht. Danach dasselbe Bild wie beim Anhalten von Hand,
also ein Weg zurueck ohne Neuladen.

### Callback-Ref statt fester Referenz

Das Listenende wird erst gerendert, wenn Daten da sind und es eine weitere
Seite gibt. Eine Referenz, die der Beobachter einmalig beim Einhaengen liest,
waere zu diesem Zeitpunkt noch leer - der Beobachter haette sich nie
angehaengt und die Automatik nie gegriffen. Der Hook nimmt das Element
deshalb ueber eine Callback-Ref entgegen und setzt den Beobachter neu auf,
sobald es erscheint oder verschwindet.

## Risiken

- **Nachladen, das niemand wollte:** Wer das Listenende im Blick behaelt, ohne
  zu lesen, bekommt bis zu fuenf Seiten. Vertretbar - es kostet nur Anzeige,
  nichts ist veraendert, und der Abbruch steht im Bild.
- **Kein `IntersectionObserver`:** Dann bleibt es beim Knopf von Hand. Der Hook
  prueft das und liefert `idle`.
