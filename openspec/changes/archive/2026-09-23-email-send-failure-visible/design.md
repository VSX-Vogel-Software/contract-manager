# Design

## Context

Der Versand läuft über Microsoft Graph (`apps/core/m365.py`). Jeder der vier
Pfade ist ein Celery-Task, der nach der beantworteten Mutation anläuft. Die
Erfolgsseite ist bereits am Dokument festgehalten — `email_sent_at`,
`email_sent_to`, teils `email_message_id`. Für die Fehlerseite gibt es bisher
nichts; sie existiert nur als Logzeile im Worker.

Ebene 2 aus techops-toolbox#401 (Toasts für alles Unbehandelte) ist mit 2.36.0
ausgeliefert und greift hier nicht: Zum Zeitpunkt des Fehlschlags gibt es keinen
Request, dem man etwas zeigen könnte.

## Goals / Non-Goals

**Goals**

- Ein fehlgeschlagener Versand ist am Dokument erkennbar — in dem Moment und
  Tage später.
- Der Grund steht dabei, nicht nur die Tatsache.
- Ein erfolgreicher Versand hinterlässt keinen alten Fehler.

**Non-Goals**

- Keine automatischen Wiederholungsversuche. Ein abgelaufenes Secret heilt nicht
  durch Wiederholung, und ein Retry würde den Ausfall wieder verstecken.
- Keine Benachrichtigung per Mail über einen fehlgeschlagenen Mailversand — der
  Weg, der gerade nicht funktioniert, taugt nicht als Meldeweg. Die Überwachung
  der Zugangsdaten selbst liegt in techops-toolbox#400.
- Kein Umbau der Tasks auf synchrone Ausführung.

## Decisions

### Zustand am Dokument statt in einer eigenen Tabelle

Eine Tabelle `email_send_attempts` wäre die vollständigere Lösung: jeder Versuch
mit Zeitpunkt, Empfängern und Ergebnis. Dagegen spricht, dass die Frage, die im
Alltag gestellt wird, immer dieselbe ist — *„ist diese Rechnung rausgegangen?"*
— und die beantwortet ein Feld am Dokument, ohne Join und ohne eigene Ansicht.
Die Erfolgsfelder liegen aus demselben Grund schon dort. Eine Historie lässt
sich später ergänzen, ohne diese Felder zu entfernen.

### `email_error` ist Text, kein Fehlercode

Der Grund kommt von Graph und ist ein Satz (`AADSTS7000222: The provided client
secret keys for app … are expired`). Ein eigenes Codeschema hieße, die
Microsoft-Fehlerwelt nachzubauen und bei jeder neuen Meldung nachzuziehen. Der
Text wird unverändert übernommen und **auf 1000 Zeichen gekürzt**, damit ein
ungewöhnlich langer Graph-Fehler keine Zeile sprengt.

### Der Rückgabewert `False` bleibt

Ihn zu entfernen hieße, alle Aufrufer anzufassen, ohne dass einer davon
profitiert — sie starten den Task und sehen ihn nie wieder. `False` bleibt also
stehen und trägt künftig nur nicht mehr die einzige Information über den
Ausgang.

### Erfolg räumt den Fehler ab

Andernfalls steht an einer Rechnung, die beim zweiten Versuch zugestellt wurde,
dauerhaft der Fehler des ersten. Das ist schlimmer als gar keine Anzeige, weil
es eine funktionierende Zustellung als kaputt ausweist. `email_error = ""` wird
deshalb im Erfolgsfall ausdrücklich mitgeschrieben.

### `email_last_attempt_at` auch im Erfolgsfall

Sonst ließe sich „noch nie versucht" nicht von „versucht und geglückt"
unterscheiden, sobald `email_error` leer ist. Das Feld trägt den Zeitpunkt des
letzten Versuchs, unabhängig vom Ausgang; `email_sent_at` bleibt der Zeitpunkt
der letzten **erfolgreichen** Zustellung. Dieselbe Trennung wie bei
`last_run`/`last_success` in der Überwachung.

## Risiken

- **Vier Migrationen in drei Apps.** Alle additiv (nullable bzw. `blank=True`),
  ohne Datenumzug, ohne Sperren auf großen Tabellen.
- **Anzeige-Rauschen:** Wenn ein alter Fehlschlag an vielen Dokumenten steht,
  wirkt die Liste beim ersten Aufschlagen alarmierend. Bestandsdaten bekommen
  aber keinen Fehler rückwirkend — die Felder starten leer, und es färbt sich
  nur, was ab jetzt scheitert.

## Migrationsplan

Vier additive Migrationen, in beliebiger Reihenfolge einspielbar; die
Anwendung läuft mit und ohne sie (die Felder werden nur geschrieben, wenn sie da
sind, und gelesen wird über den GraphQL-Typ, der mit dem Modell wandert). Kein
Rückbau nötig: ein Rollback auf die vorige Version lässt die Spalten ungenutzt
stehen.
