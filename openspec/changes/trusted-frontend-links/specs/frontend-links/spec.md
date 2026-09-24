## ADDED Requirements

### Requirement: Konfigurierte Frontend-Adresse
Die Anwendung SHALL die Basis-Adresse des Frontends ausschliesslich aus der
Einstellung `FRONTEND_URL` beziehen, gelesen aus der Umgebungsvariablen
gleichen Namens. Die Funktion `frontend_base_url()` in `apps/core/frontend.py`
SHALL die einzige Quelle dafuer sein; sie MUST den Wert ohne abschliessenden
Schraegstrich liefern.

#### Scenario: Adresse ist gesetzt
- **WHEN** `FRONTEND_URL` auf `https://contract-cora.com/` steht
- **THEN** liefert `frontend_base_url()` `https://contract-cora.com`

#### Scenario: Adresse ist nicht gesetzt
- **WHEN** `FRONTEND_URL` leer ist
- **THEN** liefert `frontend_base_url()` einen leeren String und schreibt eine
  Warnung ins Log

### Requirement: Keine Adresse aus dem Request
Die Anwendung SHALL fuer Links in Mails, fuer gespeicherte Verweise und fuer
Rueckleitungen nach der Anmeldung weder den `Origin`- noch den `Referer`-Kopf
des Requests auswerten. Die Mutationen `signUp`, `createInvitation` und
`createPasswordReset` SHALL kein `baseUrl`-Argument mehr annehmen.

#### Scenario: Fremder Origin beim Zuruecksetzen des Passworts
- **WHEN** `forgotPassword` mit dem Kopf `Origin: https://fremde.example`
  aufgerufen wird und `FRONTEND_URL` auf `https://contract-cora.com` steht
- **THEN** zeigt der Link in der Mail auf
  `https://contract-cora.com/reset-password/<token>`

#### Scenario: Einladung ohne Request-Kontext
- **WHEN** das Feld `inviteUrl` abgefragt wird
- **THEN** ergibt sich die Adresse aus `FRONTEND_URL`, unabhaengig von den
  Koepfen der Abfrage

#### Scenario: baseUrl ist kein Argument mehr
- **WHEN** eine Abfrage `signUp`, `createInvitation` oder
  `createPasswordReset` mit einem `baseUrl`-Argument aufruft
- **THEN** weist das Schema die Abfrage zurueck

### Requirement: Links aus Hintergrundaufgaben
Mails aus Celery-Aufgaben SHALL Links enthalten koennen. Liegt keine Basis vor,
SHALL der jeweilige Baustein den Link weglassen statt eine unvollstaendige
Adresse zu schreiben.

#### Scenario: Mail aus dem HubSpot-Sync
- **WHEN** der Sync als Celery-Aufgabe laeuft und `FRONTEND_URL` gesetzt ist
- **THEN** enthaelt die Mail einen vollstaendigen Link

#### Scenario: Mail ohne konfigurierte Adresse
- **WHEN** `FRONTEND_URL` leer ist
- **THEN** wird die Mail ohne Link verschickt, der uebrige Inhalt bleibt
  unveraendert
