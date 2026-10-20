## Context

Clockodo liefert je Abwesenheit `type` und bei Krankheitstypen (4, 5, 11, 12, 15) zusätzlich `sick_note: bool`. Geprüft am 20.10.2026 gegen die echten VSX-Daten 2026: alle Krankheitseinträge haben Typ 4 oder 5, die AU steht ausschließlich in `sick_note`.

## Goals / Non-Goals

- Goal: Kranktage mit/ohne AU im Report und in der Abteilungs-Auswertung korrekt
- Non-Goal: festgeschriebene Reports rückwirkend ändern

## Decisions

- **AU als eigene Art statt eigenes Feld.** `sick_certificate` gab es schon, Template, UI und Abteilungs-Auswertung arbeiten mit der Art. Neu ist nur `sick_child_certificate`. So reicht eine Choices-Migration, eine neue Spalte braucht es nicht.
- **Paarweise Anzeige.** Wer Kranktage hat, bekommt immer beide Werte, auch eine 0. So lässt sich „keine AU“ nicht mit „nicht erfasst“ verwechseln.
- **Entdoppeln über die Familie** (`removesuffix("_certificate")`), weil Clockodo Mehrtages- und Einzeltags-Datensätze parallel liefert.

## Risks

- Ein Eintrag, der in Clockodo nachträglich von „ohne“ auf „mit AU“ umgestellt wird, wandert erst beim nächsten Erzeugen des Entwurfs um.
