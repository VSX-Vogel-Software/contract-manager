## 1. Bestätigungen ermöglichen

- [x] 1.1 Variante `success` im Meldungsspeicher (`lib/toastStore.ts`) ergänzen
- [x] 1.2 Grüne Darstellung in `components/ui/toast.tsx`, `data-testid="toast-success"`
- [x] 1.3 Standarddauer für Bestätigungen auf 4 Sekunden (Fehler bleiben bei 12)
- [x] 1.4 Tests: Bestätigung erscheint, verschwindet früher als ein Fehler, stapelt sich nicht

## 2. Bestätigungen dort, wo nichts Sichtbares passiert

- [x] 2.1 `NotificationPreferences` — gespeichert
- [x] 2.2 `DashboardPreferences` — gespeichert
- [x] 2.3 `DocumentEmailBccSettings` — gespeichert
- [x] 2.4 `ZugferdSettings` — gespeichert
- [x] 2.5 Restliche Masken durchgegangen: AbsenceReport meldet Versand jetzt (Erfolg und Fehlschlag), die uebrigen aendern sichtbar den Zustand und brauchen keine Bestaetigung
- [x] 2.6 Versandaktionen (Report senden, Testmail) bestätigen

## 3. Doppelmeldungen abstellen

- [x] 3.1 Liste der Aufrufstellen erzeugen, die heute einen Fehler inline anzeigen (Skript, Ausgangspunkt: die 40 Dateien aus der Bestandsaufnahme)
- [x] 3.2 Je Aufrufstelle prüfen, ob die Maske den Fehler wirklich darstellt — nicht nach Dateiname entscheiden
- [x] 3.3 `context: { suppressErrorToast: true }` an den bestätigten Stellen setzen
- [ ] 3.4 Stichprobe im Browser: eine Maske je Muster (Formular, Dialog, Einstellungsseite)
- [x] 3.5 E2E: eine Maske mit Inline-Anzeige zeigt **keine** zusätzliche Meldung am Bildrand

## 4. Leere Zustände mit Grund

- [x] 4.1 Stelle finden, an der eine Seite ohne Berechtigung leer bleibt (Ausgangspunkt: Einstellungen ohne `settings.read`)
- [x] 4.2 Hinweis in der Fläche statt leerer Seite
- [x] 4.3 Test: ohne Berechtigung erscheint der Hinweis

## 5. Abschluss

- [x] 5.1 Volle Testsuite grün (Vitest + Playwright)
- [x] 5.2 Spec `error-feedback` um Bestätigungen und die Doppelmeldungs-Regel ergänzen
- [ ] 5.3 Changelog-Eintrag
