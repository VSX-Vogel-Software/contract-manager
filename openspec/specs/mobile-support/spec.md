## ADDED Requirements

### Requirement: Kein waagerechtes Seiten-Scrollen
Jede Route SHALL ab einer Viewport-Breite von 360 px ohne waagerechtes Scrollen des Dokuments oder des Hauptbereichs darstellbar sein. Breite Inhalte MUST in einem eigenen, waagerecht scrollbaren Container liegen.

#### Scenario: Vertragsliste auf dem Telefon
- **WHEN** ein Benutzer `/contracts` bei 375 px Breite oeffnet
- **THEN** ist die Seite nicht breiter als der Viewport
- **AND** jeder Vertrag erscheint als Karte mit Kunde, Status und Betrag

### Requirement: Navigation auf kleinen Bildschirmen
Unterhalb von 1024 px Breite SHALL die Anwendung statt der festen Seitenleiste eine Kopfleiste mit Menueknopf zeigen. Das Menue MUST dieselben, nach Berechtigung gefilterten Eintraege wie die Seitenleiste enthalten.

#### Scenario: Menue oeffnen und navigieren
- **WHEN** ein Benutzer auf dem Telefon den Menueknopf antippt und "Kunden" waehlt
- **THEN** oeffnet sich die Kundenliste
- **AND** das Menue schliesst sich

#### Scenario: Desktop unveraendert
- **WHEN** die Anwendung bei 1440 px Breite geoeffnet wird
- **THEN** ist die Seitenleiste dauerhaft sichtbar und es gibt keine Kopfleiste

### Requirement: Dialoge passen in den Bildschirm
Dialoge SHALL vollstaendig innerhalb des Viewports liegen und bei Ueberlaenge in sich scrollen, sodass alle Aktionsknoepfe erreichbar sind.

#### Scenario: Langer Dialog auf dem Telefon quer
- **WHEN** ein Dialog bei 852x393 geoeffnet wird
- **THEN** liegt er innerhalb des Viewports
- **AND** der Speichern-Knopf ist per Scrollen im Dialog erreichbar

### Requirement: Touch-Bedienung
Auf Geraeten ohne Mauszeiger SHALL jedes Bedienelement ohne `hover` sichtbar und bedienbar sein. Eingabefelder MUST mindestens 16 px Schrift haben. Tippziele im App-Rahmen MUST mindestens 44 px hoch sein.

#### Scenario: Zeilenaktion auf dem Tablet
- **WHEN** eine Liste Aktionen nur bei Mausberuehrung einblendet
- **THEN** sind diese Aktionen auf einem Touch-Geraet dauerhaft sichtbar

#### Scenario: Todo verschieben mit dem Finger
- **WHEN** ein Benutzer ein Todo lange antippt und in eine andere Spalte zieht
- **THEN** wechselt das Todo die Spalte
- **AND** ein kurzes Wischen scrollt weiterhin die Seite

### Requirement: Sortierung in Kartenlisten
Listen, die unterhalb von 768 px als Karten erscheinen, SHALL dieselben Sortierfelder wie die Tabellenkoepfe ueber ein Auswahlfeld und einen Richtungsknopf anbieten.

#### Scenario: Vertragsliste auf dem Telefon sortieren
- **WHEN** ein Benutzer in der Kartenansicht "Vertragsname" waehlt und die Richtung umkehrt
- **THEN** erscheinen die Karten in umgekehrter alphabetischer Reihenfolge

### Requirement: Fixierte Bezeichner-Spalte
Tabellen, die waagerecht scrollen, SHALL ihre Bezeichner-Spalte (Name, Nummer) beim Scrollen am linken Rand stehen lassen. Ist die erste Spalte eine Checkbox oder ein Aufklapp-Pfeil, SHALL zusaetzlich die zweite fixiert sein. Die fixierte Spalte MUST deckend sein und darf auf dem Telefon hoechstens 60 % der Breite belegen.

#### Scenario: Vertragspositionen auf dem Telefon
- **WHEN** ein Benutzer die Positionstabelle eines Vertrags nach rechts wischt
- **THEN** bleiben Greifer und Produktname sichtbar
- **AND** Preise und Summen scrollen darunter durch

### Requirement: Verbindungsabbruch beim Start
Schlaegt die Anmeldepruefung beim Oeffnen der Anwendung wegen eines Netzwerkfehlers fehl, SHALL die Anwendung erneut versuchen und danach einen Hinweis mit "Erneut versuchen" zeigen. Die Anmeldung MUST dabei erhalten bleiben; nur eine ungueltige Anmeldung fuehrt zur Anmeldeseite.

#### Scenario: Funkloch beim Oeffnen
- **WHEN** der Server beim Start dreimal nicht erreichbar ist
- **THEN** erscheint "Server nicht erreichbar" mit Knopf zum erneuten Versuchen
- **AND** nach erfolgreichem Versuch ist der Benutzer weiterhin angemeldet

### Requirement: Veraltete Seitenbausteine nach einem Update
Kann nach einem Update ein Seitenbaustein nicht mehr geladen werden, SHALL die Anwendung einmal selbst neu laden und bei erneutem Fehlschlag einen Hinweis mit "Neu laden" zeigen statt einer leeren Seite.

#### Scenario: Seitenwechsel kurz nach einem Deploy
- **WHEN** ein Benutzer mit noch geoeffneter alter Version eine Seite oeffnet, deren Baustein es nicht mehr gibt
- **THEN** laedt die Anwendung einmal neu und zeigt die Seite in der neuen Version
