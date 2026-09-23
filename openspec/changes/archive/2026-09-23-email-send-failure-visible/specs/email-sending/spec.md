## ADDED Requirements

### Requirement: Fehlgeschlagenen Mailversand am Dokument festhalten
Schlägt der Versand einer Rechnung, eines Angebots, einer Mahnung oder einer
Auftragsbestätigung fehl, SHALL das System den Grund und den Zeitpunkt am
betroffenen Dokument speichern, statt ihn nur zu protokollieren. Felder:
`email_error` (TextField, leer = kein Fehler, auf 1000 Zeichen gekürzt) und
`email_last_attempt_at` (DateTimeField). Ein `raise` ist an dieser Stelle kein
Ersatz: die vier Pfade laufen als Celery-Task, es gibt keinen Aufrufer, der eine
Ausnahme sähe.

#### Scenario: Versand scheitert an Microsoft Graph
- **WHEN** der Celery-Task eine Mail versendet und Graph mit einem `M365Error` antwortet
- **THEN** speichert das System die Fehlermeldung in `email_error` und den Zeitpunkt in `email_last_attempt_at`, und `email_sent_at` bleibt leer

#### Scenario: Grund ist ungewöhnlich lang
- **WHEN** die Fehlermeldung von Graph länger als 1000 Zeichen ist
- **THEN** speichert das System die ersten 1000 Zeichen

#### Scenario: Erfolgreicher Versand räumt einen alten Fehler ab
- **WHEN** ein Versand glückt, an dessen Dokument aus einem früheren Versuch noch ein `email_error` steht
- **THEN** leert das System `email_error` und setzt `email_sent_at` sowie `email_last_attempt_at`

#### Scenario: Noch nie versucht
- **WHEN** ein Dokument erzeugt, aber noch nie versendet wurde
- **THEN** sind `email_error` leer und `email_last_attempt_at` nicht gesetzt

### Requirement: Versandfehler über GraphQL ausliefern
Das System SHALL `email_error` und `email_last_attempt_at` an den Typen für
Rechnung, Angebot, Mahnung und Auftragsbestätigung ausliefern, damit die
Oberfläche den Zustand anzeigen kann.

#### Scenario: Felder werden abgefragt
- **WHEN** ein Client die Felder `emailError` und `emailLastAttemptAt` an einem der vier Typen abfragt
- **THEN** liefert das System sie mit dem am Dokument gespeicherten Stand

### Requirement: Versandfehler in der Oberfläche zeigen
Die Oberfläche SHALL einen fehlgeschlagenen Versand dort zeigen, wo das Dokument
steht: in der Liste als Kennzeichnung, in der Detailansicht mit Grund und
Zeitpunkt. Ein Dokument mit `email_error` SHALL nicht wie ein nie versendetes
aussehen.

#### Scenario: Detailansicht eines gescheiterten Versands
- **WHEN** ein Benutzer ein Dokument öffnet, an dem `email_error` steht
- **THEN** zeigt die Oberfläche den Grund und den Zeitpunkt des letzten Versuchs

#### Scenario: Liste mit gescheitertem Versand
- **WHEN** eine Liste ein Dokument enthält, an dem `email_error` steht
- **THEN** kennzeichnet die Oberfläche die Zeile als fehlgeschlagenen Versand, unterscheidbar von „noch nicht versendet"
