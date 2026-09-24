# Auditlog laedt am Listenende von selbst nach

## Why

Das Auditlog laedt in Seiten zu 25 Eintraegen. Wer eine Spur verfolgt, klickt
sich mit "Mehr laden" durch - bei ein paar tausend Eintraegen ist das eine
Klickstrecke, bei der man die Maus nicht mehr loslaesst. Gleichzeitig soll das
Nachladen nicht ungefragt endlos weiterlaufen: eine Tabelle, die von selbst
waechst, waehrend man eine Zeile liest, ist ihrerseits laestig.

## What Changes

- Ist das Listenende im Blick, laeuft im Knopf eine Anzeige und nach **zwei
  Sekunden** wird die naechste Seite angehaengt.
- **Derselbe Knopf haelt an.** Waehrend die Wartezeit laeuft, traegt er
  "Laedt automatisch … / klicken zum Anhalten"; ein Klick stoppt die Automatik
  und macht ihn wieder zum gewoehnlichen "Mehr laden". Das Bedienelement, das
  stoert, ist damit genau das, auf das man klickt - man muss nichts suchen.
- Unter dem Knopf erscheint dann "Automatik pausiert · wieder aktivieren".
- Nach **fuenf** automatischen Runden haelt sie von selbst an. Ohne diese
  Grenze zieht ein liegengelassener Tab die ganze Tabelle in den Browser.
- Scrollt man hoch, bevor die zwei Sekunden um sind, passiert nichts.
- Wechselt ein Filter, beginnt die Rundenzaehlung von vorn. Eine vom Benutzer
  angehaltene Automatik bleibt angehalten.

Die Logik liegt in `useAutoLoadMore`, damit sie fuer sich pruefbar ist. Fehlt
`IntersectionObserver`, bleibt es beim bisherigen Verhalten mit Handklick.

Betroffen ist die Seite `/audit`. Die Aktivitaets-Reiter in den Detailansichten
nutzen den eigenen Hook `useAuditLogs` und bleiben unveraendert - dort sind die
Listen kurz.

## Capabilities

### Modified

- `audit-log-ui` - Nachladen am Listenende.
