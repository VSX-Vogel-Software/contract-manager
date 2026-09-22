## Context

Seit 2.36.0 liegen zwei Links in der Apollo-Kette (`frontend/src/lib/apollo.ts`):

- `errorLink` behandelt geworfene GraphQL-Fehler und Netzwerkfehler (`lib/apolloErrors.ts`).
- `resultErrorLink` schaut in erfolgreiche Mutationsantworten und meldet Felder mit `success === false` (`lib/resultErrors.ts`).

Beide respektieren `context: { suppressErrorToast: true }`. Der Meldungsspeicher (`lib/toastStore.ts`) liegt bewusst außerhalb von React und kennt heute die Varianten `error` und `info`; angezeigt wird über `components/Toaster.tsx`.

Bestandsaufnahme der Aufrufstellen (dateiweise gezählt, `useMutation`):

| Gruppe | Dateien | Mutationen | Verhalten |
|---|---|---|---|
| A | 40 | 103 | zeigt Fehler inline an |
| B | 28 | 117 | prüft `.success`, zeigt nichts |
| C | 10 | 18 | prüft nichts |

Die Zählung ist dateiweise und damit eine Näherung: Eine Datei aus Gruppe A kann für eine Mutation eine Meldung zeigen und die nächste schlucken. Die Einzelfälle müssen beim Umsetzen angesehen werden.

## Goals / Non-Goals

**Goals:**

- Keine Meldung erscheint zweimal.
- Jede Aktion ohne sichtbare Wirkung bestätigt sich.
- Eine nachvollziehbare Regel, welche Aktion welche Rückmeldung verdient.

**Non-Goals:**

- Keine Änderung an den beiden Links selbst — die Mechanik steht.
- Keine neue Meldungsart über Erfolg und Fehler hinaus. Warnungen als eigene Farbe wären ein weiteres Thema; heute gibt es keinen Fall, der sie braucht.

## Decisions

### Opt-out an der Aufrufstelle, nicht in einer Ausnahmeliste

Eine zentrale Liste „diese Operationen nicht melden" wäre schneller geschrieben, würde aber sofort veralten: Wer eine Mutation umbenennt oder eine Maske umbaut, denkt nicht an eine Liste in einer anderen Datei. Das Kennzeichen gehört dorthin, wo die Entscheidung fällt — an den `useMutation`-Aufruf, der die Meldung selbst anzeigt.

### Die Regel, welche Rückmeldung wann

Damit die Frage nicht bei jeder Maske neu verhandelt wird:

- **Sichtbare Zustandsänderung** (Liste lädt neu, Zeile verschwindet, Dialog schließt und das Ergebnis steht da) → **keine Bestätigung**. Der Zustand ist die Bestätigung; ein Toast obendrauf ist Lärm.
- **Keine sichtbare Wirkung** (Einstellung gespeichert, Mail verschickt, Report erzeugt) → **grüne Bestätigung**.
- **Fehler, den eine Maske selbst anzeigt** → inline, Opt-out setzen.
- **Fehler, den niemand anzeigt** → rote Meldung am Bildrand.
- **Fehlende Berechtigung beim Betreten einer Seite** → Hinweis in der Fläche, nicht als Meldung am Bildrand: Der Benutzer soll verstehen, warum die Seite leer ist, und das auch noch sehen, wenn die Meldung längst weg wäre.

### Bestätigungen kürzer als Fehler

Ein Fehler will gelesen werden, eine Bestätigung nur wahrgenommen. Fehler bleiben bei 12 Sekunden, Bestätigungen verschwinden nach 4.

## Risks / Trade-offs

- **Der Durchgang durch 40 Dateien ist fehleranfällig.** Wer das Opt-out an einer Stelle setzt, die den Fehler doch nicht anzeigt, macht ihn wieder unsichtbar — also genau das rückgängig, wofür der ganze Aufwand betrieben wurde. Deshalb pro Aufrufstelle prüfen, ob die Maske den Fehler wirklich darstellt, und nicht nach Dateinamen entscheiden.
- **Zu viele Bestätigungen sind auch Lärm.** Die Regel oben ist bewusst eng: nur wo nichts Sichtbares passiert.
