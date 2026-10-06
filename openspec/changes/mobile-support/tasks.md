## 1. Grundlagen (sequentiell)

- [x] 1.1 Vite-Polling im Container (`VITE_USE_POLLING`)
- [x] 1.2 `seed_demo_data`: Rolle mit allen Rechten fuer den Testbenutzer, 40 Kunden, 60 Vertraege mit Positionen, Rechnungen, Angebote, Todos, Projekte, Produkte, Banking, Eingangsrechnungen; bewusst lange Namen/Betraege
- [x] 1.3 Playwright: Projekte fuer die sieben Formate, gemeinsamer Login per `storageState`
- [x] 1.4 Layout-Suite `e2e/mobile/` mit Ueberlauf-Detektor, Routenliste, Bildschirmfotos
- [x] 1.5 Ist-Aufnahme: Suite gegen den unveraenderten Stand laufen lassen, Befunde je Route

## 2. App-Rahmen und Grundbausteine

- [x] 2.1 `index.html`: `viewport-fit=cover`, `theme-color`
- [x] 2.2 `index.css`: 16-px-Eingaben auf Touch
- [x] 2.3 Tailwind-Variante `touch:`, Safe-Area-Utilities
- [x] 2.4 `Layout`: `h-dvh`, Kopfleiste < lg, `main` mit `p-3 sm:p-4 lg:p-6`
- [x] 2.5 `Sidebar` als `variant="drawer"` im Sheet, schliesst bei Navigation; Suche als Vollbild-Ebene
- [x] 2.6 Chat-Knopf und `ChatDrawer` mobil (Vollbild, Safe Area)
- [x] 2.7 `dialog`, `sheet`, `tabs`, `select`, `popover`, `tooltip` mobiltauglich
- [x] 2.8 Neue Bausteine: `useMediaQuery`, `ScrollTabs`, `PdfPreview`, `MobileCard`, `MobileSortControl`
- [x] 2.9 Gemeinsam genutzte Dateien fest einem Paket zugeordnet (statt vorab umgebaut)
- [x] 2.10 Vitest fuer Kopfleiste/Navigation und neue Bausteine

## 3. Feature-Seiten (parallel, drei Pakete)

- [x] 3.1 Paket A: Vertraege (Liste, Detail, Formular, Import, AB, Zeiterfassung, Abteilungsanalyse), Kunden, Projekte, Produkte
- [x] 3.2 Paket B: Rechnungen (Liste, Detail, Export, Importiert), Angebote, Eingangsrechnungen, Banking (inkl. Gegenpartei, Kostenstellenbericht), Mahnwesen
- [x] 3.3 Paket C: Dashboard, Prognosen/Liquiditaet, Todos-Board (Touch-DnD + Menue), Auditlog, Einstellungen inkl. der dort eingebundenen Seiten, Anmeldung/Registrierung, Ueber, Assistent, gemeinsame Komponenten
- [x] 3.4 Sortierung fuer Kartenlisten (`MobileSortControl`), da Tabellenkoepfe fehlen
- [x] 3.5 Fixierte Bezeichner-Spalte in waagerecht scrollenden Tabellen (`table-sticky-first`, `-first-two`, `-capped` in `index.css`), Auswahl der 24 Tabellen per Messung
- [x] 3.6 Dialog-Durchlauf `e2e/mobile/dialogs.spec.ts`: 74 Dialoge/Sheets/Popover in 7 Formaten oeffnen, messen, ohne Speichern schliessen; Seed um importierte Rechnungen, AB, Anhang, Angebot mit PDF, Inbox, API-Key, Fehlzeitenbericht erweitert

## 4. Abschluss

- [x] 4.1 Code-Review des Gesamtdiffs, Funde behoben
- [ ] 4.2 Volle Suite alle Formate gruen (gegen `vite preview`), bestehende Unit-Tests gruen, `tsc`
- [ ] 4.2a Offen: Fehlzeitenbericht- und Zeiterfassungs-Dialoge (Seed ohne Abteilungen/Zeiterfassung), Changelog-Dialog (nur mit Versions-Build)
- [ ] 4.3 Sichtpruefung im echten Chrome
- [ ] 4.4 Abnahme durch bk auf echtem Telefon (iOS Safari, Android Chrome) - insbesondere PDF oeffnen/herunterladen
- [ ] 4.5 Nach Auslieferung: Spec nach `openspec/specs/mobile-support/`, Change ins Archiv

## Suite ausfuehren

```
cd frontend
npm run build
VITE_PROXY_TARGET=http://localhost:4001 npx vite preview --port 4173   # eigenes Terminal
E2E_CHANNEL=msedge E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/mobile --reporter=line
```

Bildschirmfotos landen in `frontend/mobile-screens/<format>/<route>.png`.
