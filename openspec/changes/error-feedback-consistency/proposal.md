## Why

Seit 2.36.0 werden unbehandelte Fehler angezeigt — sowohl geworfene GraphQL-Fehler als auch solche, die als Nutzdaten (`success: false`) zurückkommen. Das schließt die Lücke, durch die ein abgelaufenes Client-Secret fünf Wochen unbemerkt blieb.

Zwei Dinge sind dabei offen geblieben:

**Doppelte Meldungen.** Eine Bestandsaufnahme über alle 238 Mutationen in 78 Dateien ergab drei Gruppen: 40 Dateien zeigen Fehler bereits inline an (103 Mutationen), 28 prüfen `.success` und zeigen nichts (117), 10 prüfen gar nichts (18). Für die letzten beiden Gruppen ist die neue Meldung ein Gewinn. In der ersten steht sie jetzt zweimal — inline am Formular und zusätzlich am Bildrand.

**Fehlende Bestätigungen.** Die Anwendung meldet Fehlschläge, aber kaum Erfolge. Wo nach dem Speichern neu geladen wird, ist die sichtbare Zustandsänderung eine Art Bestätigung. Bei Einstellungen funktioniert das nicht: Ein Schalter bleibt stehen, wo der Benutzer ihn hingestellt hat — ob gespeichert wurde oder nicht, sieht man nicht. `NotificationPreferences`, `DashboardPreferences`, `DocumentEmailBccSettings` und `ZugferdSettings` geben überhaupt keine Rückmeldung.

## What Changes

- **Opt-out nachziehen**: Aufrufstellen, die einen Fehler selbst anzeigen, kennzeichnen sich mit `suppressErrorToast`. Pro Aufrufstelle entschieden, nicht pauschal pro Datei — eine Datei kann eine Meldung anzeigen und die nächste schlucken.
- **Grüne Bestätigungen**: neue Variante `success` im Meldungsspeicher, zunächst für Aktionen ohne sichtbare Zustandsänderung.
- **Regel festschreiben**, welche Aktion welche Rückmeldung verdient — damit die Frage nicht bei jeder neuen Maske neu verhandelt wird.
- **Leere Zustände mit Grund**: Wer ohne Berechtigung auf eine Seite kommt, sieht heute eine leere Fläche. Statt dessen ein Hinweis, dass die Rechte fehlen.

## Capabilities

### Modified Capabilities

- `error-feedback`: ergänzt um Bestätigungen und um die Regel, welche Aktion welche Rückmeldung bekommt; Doppelmeldungen werden ausgeschlossen.

## Non-Goals

- Keine Umstellung der zwölf Mutationen, die nur `bool` zurückgeben und den Grund gar nicht transportieren können — eigener Change.
- Kein persistierter Fehlerzustand für den asynchronen Versand (Rechnungs-, Angebots-, AB-Mails) — eigener Change, weil Datenmodell und API betroffen sind.
