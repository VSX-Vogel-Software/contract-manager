## Why

Contract Manager ist heute eine reine Desktop-Anwendung: feste Seitenleiste mit 256 px, Tabellen und Dialoge mit festen Breiten, Bedienelemente, die nur bei Mausberuehrung erscheinen. Auf dem Telefon ist die Anwendung praktisch nicht benutzbar - die Seitenleiste frisst zwei Drittel des Bildschirms, Tabellen laufen aus dem Bild, Dialoge lassen sich nicht bis zum Speichern-Knopf scrollen. Wer unterwegs kurz einen Vertrag, eine Rechnung oder ein Todo nachsehen oder freigeben will, muss bis zum Rechner warten.

## What Changes

- **App-Rahmen:** Unterhalb von 1024 px Breite (`lg`) verschwindet die feste Seitenleiste. An ihre Stelle tritt eine Kopfleiste (Menue, Name, Suche) und eine ausfahrbare Navigation mit demselben Inhalt wie heute. Die globale Suche oeffnet auf dem Telefon als Vollbild-Ebene.
- **Grundbausteine (`components/ui`):** Dialoge passen sich dem Bildschirm an und scrollen in sich, Sheets werden auf dem Telefon bildschirmbreit, Tab-Leisten scrollen waagerecht statt umzubrechen, Eingabefelder haben auf Touch-Geraeten 16 px Schrift (kein automatisches Hineinzoomen bei iOS).
- **Listen:** Die Hauptlisten (Vertraege, Kunden, Rechnungen, Angebote, Eingangsrechnungen, Projekte, Produkte) zeigen auf dem Telefon Karten statt Tabellenzeilen. Uebrige Tabellen blenden Nebenspalten aus und scrollen waagerecht in ihrem eigenen Container - nie die ganze Seite.
- **Detail- und Formularseiten:** Kopfbereiche mit Titel und Aktionsknoepfen brechen um, mehrspaltige Raster werden einspaltig, feste Pixelbreiten weichen `w-full` mit Obergrenze.
- **Touch:** Bedienelemente, die heute nur bei `hover` sichtbar werden, sind auf Touch-Geraeten immer sichtbar. Drag & Drop (Todo-Board, Zuordnung) funktioniert mit dem Finger, ohne das Scrollen zu blockieren. Mindestgroesse fuer Tippziele im App-Rahmen 44 px.
- **Geraetedetails:** `viewport-fit=cover` mit Safe-Area-Abstaenden, `100dvh` statt `100vh`, `theme-color`.
- **Tests:** Playwright-Projekte fuer sieben Bildschirmformate (Telefon klein/gross, Telefon quer, Tablet hoch/quer, Desktop) und eine Layout-Suite, die jede Route auf waagerechten Ueberlauf, erreichbare Navigation und passende Dialoge prueft und Bildschirmfotos ablegt. Vitest fuer die neuen Bausteine.
- **Entwicklung:** Vite pollt im Container (`VITE_USE_POLLING`), damit Aenderungen vom Windows-Host ankommen. Neues Kommando `seed_demo_data` legt realistische Testdaten an (lange Namen, viele Zeilen), damit sich Ueberlaeufe ueberhaupt zeigen.

## Capabilities

### New Capabilities
- `mobile-support`: Darstellung und Bedienung auf Telefonen und Tablets

### Modified Capabilities
- Keine (Verhalten auf dem Desktop bleibt unveraendert)

## Impact

- Frontend fast flaechig (Layout, `components/ui`, alle Feature-Seiten), Backend nur das Seed-Kommando.
- Kein API-, Daten- oder Berechtigungsumbau.
- Desktop-Darstellung ab 1024 px soll pixelnah gleich bleiben; die Desktop-Projekte der Suite sichern das ab.
