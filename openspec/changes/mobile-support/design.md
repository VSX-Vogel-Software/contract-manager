## Context

React 18 + Tailwind 3 + shadcn/ui (Radix). 162 TSX-Dateien, ~51 000 Zeilen in `features/`. Responsive-Klassen kommen bisher kaum vor (85x `sm:`, 19x `md:`, 24x `lg:`). 33 Dateien bauen rohe `<table>`, 6 eigene Modals mit `fixed inset-0`, 57 `DialogContent`. Die Seitenleiste ist fest `w-64`, `main` hat `p-6`, der Rahmen `h-screen`.

## Goals / Non-Goals

**Goals**
- Jede Route ist ab 360 px Breite ohne waagerechtes Seiten-Scrollen benutzbar.
- Alle Funktionen bleiben erreichbar - mobil wird nichts weggelassen, hoechstens umsortiert.
- Desktop (>= 1024 px) bleibt optisch und funktional wie heute.
- Automatisierte Absicherung ueber sieben Bildschirmformate.

**Non-Goals**
- Keine native App, kein PWA/Offline-Betrieb, kein Push.
- Keine mobilspezifischen Neufunktionen (Kamera-Upload o. ae.).
- Keine Umgestaltung des Desktop-Designs.
- Bulk-Werkzeuge (Vertragsimport, Rechnungsexport, Banking-Zuordnung per Drag & Drop) muessen mobil *funktionieren*, aber nicht komfortabel sein.

## Decisions

1. **Umschaltpunkt `lg` (1024 px) fuer den App-Rahmen.** Tablet hoch (768) bekommt die Kopfleiste, Tablet quer (>= 1024) die Seitenleiste. Begruendung: 256 px Seitenleiste neben 768 px Inhalt ist fuer die breiten Tabellen zu eng.
2. **Navigation als Radix-Dialog (bestehendes `Sheet`) von links**, Inhalt ist dieselbe `Sidebar`-Komponente (`variant="drawer"`). Kein zweiter Menuebaum, damit Berechtigungsfilter und Suche nur an einer Stelle leben. Schliesst bei Routenwechsel. Desktop- und Drawer-Variante schliessen sich per `useMediaQuery` gegenseitig aus (nicht nur per CSS), sonst doppelte `/`-Listener, Abfragen und Modals. Der `ChatDrawer` wird nur gerendert, wenn offen.
3. **Karten statt Tabelle nur fuer die Hauptlisten.** Doppelte Darstellung (`md:hidden` Karten / `hidden md:block` Tabelle) ist Mehraufwand, lohnt sich aber genau dort, wo man mobil tatsaechlich sucht und tippt. Sekundaere Tabellen (in Detailseiten, Einstellungen) bekommen `overflow-x-auto` im eigenen Container und blenden Nebenspalten mit `hidden md:table-cell` aus.
4. **Dialoge zentral reparieren.** `DialogContent` bekommt `max-h-[calc(100dvh-2rem)] overflow-y-auto` und auf `< sm` die Breite `calc(100vw-1rem)`. Feste Breiten in Aufrufen (`w-[700px]`) werden zu `w-full sm:max-w-[700px]`.
5. **Touch-Variante in Tailwind:** `touch:` = `@media (hover: none) and (pointer: coarse)`. Damit werden `opacity-0 group-hover:opacity-100`-Muster zu `... touch:opacity-100`, ohne Desktop zu veraendern.
6. **Eingabeschrift 16 px auf Touch** global in `index.css` fuer `input, select, textarea` - eine Regel statt hunderter Klassen. Sie steht **ausserhalb** von `@layer` (sonst gewinnt jedes `text-sm`).
6a. **Eigene Tab-Leisten** (`<nav class="flex gap-4">` in ContractDetail, CustomerDetail, BankingPage, ForecastsPage) laufen ueber einen gemeinsamen Baustein `ScrollTabs`: waagerecht scrollbar, aktiver Tab wird ins Bild gerollt.
6b. **PDF-Vorschau:** iframes/`<object>` zeigen auf Android nichts und auf iOS nur Seite 1. Gemeinsamer Baustein `PdfPreview`: auf Touch ein Knopf "PDF oeffnen" (neuer Tab), auf dem Desktop wie heute.
6c. **Tooltips als einziger Infotraeger** (KPI-Erklaerungen, "warum gesperrt"): `ui/tooltip` oeffnet auf Touch per Antippen (Popover-Verhalten).
6d. **Popover** begrenzen zentral auf `--radix-popover-content-available-width`; feste `w-[..px]` in Aufrufen werden `w-[..px] max-w-[calc(100vw-1rem)]`.
6e. **Eigene `fixed`-Hinweise** (InvoiceDetail, ImportedInvoiceDetail, OfferDetail, ReminderDialog) und eigene Modals (RoleManagement, UserManagement, EditPatternModal) werden auf vorhandene Toaster/Dialog umgestellt oder mit `inset-x-2`/`max-w` begrenzt.
6f. **Tabellen mit `table-fixed w-full`** quetschen statt ueberzulaufen - sie bekommen ein `min-w-[..]` und liegen im Scroll-Container.
7. **Drag & Drop:** dnd-kit-Sensoren um `TouchSensor` mit `delay: 200, tolerance: 8` ergaenzen (TodoBoard, Positionen in ContractDetail), damit Wischen weiter scrollt. Das Todo-Board bekommt zusaetzlich einen "Status aendern"-Weg ohne Ziehen.
8. **Testsuite misst statt nur fotografiert.** `e2e/mobile/` prueft je Route und Format: (a) Dokument und `main` ohne waagerechten Ueberlauf, (b) Liste der Elemente, die rechts aus dem Bild ragen und nicht in einem scrollbaren Container liegen (Fehlermeldung nennt den Selektor), (c) Navigation erreichbar, (d) Tippziele im Rahmen >= 44 px, (e) Dialoge innerhalb des Viewports. Bildschirmfotos landen in `test-results/mobile-screens/` zur Sichtpruefung. Chromium mit Geraeteemulation (`isMobile`, `hasTouch`, DPR), kein WebKit-Download noetig. `main`/`body`/`html` zaehlen **nicht** als zulaessiger Scroll-Vorfahr; ausgenommen sind `sr-only`, Inhalte unter `overflow:hidden` (truncate) und ausgeblendete fixe Elemente. Login einmal per Setup-Projekt und `storageState`; die Mobil-Projekte laufen nur `e2e/mobile/`, das Bestandsprojekt ignoriert es. Ein erster Test belegt, dass `hasTouch` die Media-Query `(hover:none) and (pointer:coarse)` ausloest.
8a. **Fixierte erste Spalte** in Tabellen, die waagerecht scrollen: reine CSS-Klassen statt Komponentenumbau, damit sie fuer shadcn-`Table` und rohe `<table>` gleich wirken. Die Spalte bricht um statt zu verbreitern (`max-width` ignoriert Chrome an Zellen, `min()` mit gemischten Einheiten ebenso); Tabellen mit Mindestbreite bekommen unter lg eine feste Spaltenbreite (`table-sticky-capped`), sonst schluckt die fixierte Spalte den Ueberschuss. Erste Spalte Checkbox/Pfeil -> zwei Spalten fixiert.
8b. **Dialog-Durchlauf** oeffnet nur, was gefahrlos ist (Bestandsaufnahme mit "nie klicken"-Liste), und schliesst per Escape/X - nie ueber Abbrechen/Bestaetigen.
9. **Bildschirmformate:** 360x740 (Android klein), iPhone SE 375x667, iPhone 15 Pro 393x852, Telefon quer 852x393, iPad Mini 768x1024, iPad Air quer 1180x820, Desktop 1440x900.

## Risks / Trade-offs

- **Desktop-Regression** durch Aenderungen an `components/ui` → Desktop-Projekt der Suite + Vorher/Nachher-Bildschirmfotos.
- **Doppelte Listen-Darstellung** kann auseinanderlaufen → gleiche Datenquelle, Karte nur Darstellung, Test fuer beide Breiten.
- **ContractDetail (5 400 Zeilen)** ist der groesste Brocken; hier gezielt: Kopf, Tabs, Positionstabelle, Dialoge.
- Gemeinsam genutzte Dateien zwischen den Paketen: `features/reminders/*`, `features/todos/{TodoModal,TodoList}`, `components/{CommentsSection,CustomerPickerDialog,FileDropZone}` werden vorab zentral erledigt; Settings-Unterseiten aus `invoices/`, `offers/`, `contracts/AB*Settings` gehoeren Paket C; Uebersetzungen nur unter eigenem Schluesselbereich je Paket (`mobile.*` zentral).
- Telefon quer (852x393) bekommt Tabellen statt Karten und hat kaum Hoehe - gezielt pruefen.
- Emulation ersetzt kein echtes Geraet (Safari-Eigenheiten). → Abnahme durch bk auf echtem Telefon.

## Migration Plan

Reines Frontend-Release, kein Datenumbau. Rueckweg = vorheriges Frontend-Abbild.
