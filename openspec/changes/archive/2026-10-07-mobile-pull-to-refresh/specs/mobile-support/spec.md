## ADDED Requirements

### Requirement: Runterziehen zum Neuladen
Auf Touch-Geraeten SHALL ein senkrechtes Ziehen nach unten am Seitenanfang des Inhaltsbereichs ueber eine Schwelle die Daten der aktuellen Seite neu laden, mit sichtbarer Anzeige waehrend des Ziehens und Ladens. Die Seite selbst MUST dabei nicht neu geladen werden; Filter, Tabs und Eingaben bleiben erhalten. Ist die Seite gescrollt, startet die Bewegung in einem Eingabefeld oder ist sie ueberwiegend waagerecht, MUST nichts geschehen.

#### Scenario: Liste aktualisieren
- **WHEN** ein Benutzer auf dem Telefon oben in der Vertragsliste weit genug nach unten zieht und loslaesst
- **THEN** erscheint ein Kreisel und die Liste wird vom Server neu geladen

#### Scenario: Kurzer Zug
- **WHEN** der Benutzer nur ein kurzes Stueck zieht
- **THEN** wird nichts neu geladen

#### Scenario: Tabelle seitlich wischen
- **WHEN** der Benutzer eine Tabelle waagerecht wischt
- **THEN** wird nichts neu geladen

### Requirement: Zuegige Schubladen
Schubladen (Navigation, Suche, Filter) SHALL in hoechstens 200 ms einfahren und in hoechstens 150 ms ausfahren.

#### Scenario: Menue oeffnen
- **WHEN** ein Benutzer auf dem Telefon das Menue oeffnet
- **THEN** ist es nach spaetestens 200 ms vollstaendig sichtbar
