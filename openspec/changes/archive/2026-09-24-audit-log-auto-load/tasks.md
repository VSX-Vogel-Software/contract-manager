# Tasks

## 1. Logik

- [x] 1.1 `useAutoLoadMore` in `frontend/src/features/audit/` anlegen
      (Wartezeit, Rundengrenze, Anhalten, Wiederaufnehmen)
- [x] 1.2 Listenende ueber eine Callback-Ref beobachten
- [x] 1.3 Tests fuer den Hook: laedt nach, laedt nicht ausser Sicht, bricht
      beim Hochscrollen ab, haelt an, nimmt wieder auf, stoppt an der Grenze

## 2. Oberflaeche

- [x] 2.1 `AuditLogPage` auf den Hook umstellen, Knopf haelt im Wartezustand an
- [x] 2.2 Zeile "Automatik pausiert · wieder aktivieren" unter dem Knopf
- [x] 2.3 Texte in `de.json` und `en.json`
- [x] 2.4 `data-testid` fuer Knopf und Wiederaufnehmen

## 3. Abschluss

- [x] 3.1 `tsc -b --force` und die Frontend-Tests laufen durch
- [x] 3.2 Im Browser gegenlaufen lassen: nachladen, anhalten, wieder
      aktivieren, Grenze nach fuenf Runden
