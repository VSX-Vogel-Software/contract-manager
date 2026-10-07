## Context

`Layout.tsx`: `div.h-dvh` mit fester Kopfleiste, `<main class="overflow-auto overscroll-contain">` scrollt. Daten kommen ueber Apollo.

## Goals / Non-Goals

**Goals:** vertraute Geste auf iOS und Android, ohne das Grundlayout umzubauen.
**Non-Goals:** Dokument-Scrolling (Variante "ganze Seite scrollt" - groesserer Umbau, verworfen), Neuladen nicht-Apollo-Daten.

## Decisions

1. **Hook `usePullToRefresh(mainRef, onRefresh)`** mit Touch-Listenern am Inhaltsbereich (`touchmove` nicht passiv, damit beim Ziehen am Seitenanfang kein Federn mitlaeuft).
2. **Ausloesen nur**, wenn `main` oben steht, kein Element zwischen Finger und `main` selbst gescrollt ist, nicht in Eingabefeldern startet und die Bewegung ueberwiegend senkrecht nach unten geht (waagerechte Tabellen-Wischer bleiben frei).
3. **Gedaempfter Weg** (Faktor 0,5), Schwelle 64 px, hoechstens 96 px; Kreisel mindestens 500 ms, sonst wirkt es wie Flackern.
4. **Neuladen** per `apolloClient.refetchQueries({ include: 'active' })`.
5. **Anzeige:** runder Kreisel mittig oben ueber dem Inhalt, dreht mit dem Zugweg, blau ab der Schwelle; `role=status`.
6. **Schublade:** `duration-200`/`duration-150` (Tailwind erzeugt `data-[state=open]:duration-[250ms]` nicht).

## Risks / Trade-offs

- Desktop ohne Touch unveraendert; Tablets mit Seitenleiste bekommen die Geste ebenfalls.
- Seiten mit eigenem Scroll-Bereich ganz oben loesen nur aus, wenn dieser oben steht.
