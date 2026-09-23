# Fehlgeschlagener Mailversand wird am Dokument sichtbar

## Why

Vom 17.08. bis zum 21.09.2026 verschickte die Anwendung keine einzige Mail. Das
Client-Secret der Entra-Anwendung war abgelaufen, jeder Graph-Aufruf endete mit
`AADSTS7000222` — und die Oberfläche meldete die ganze Zeit Erfolg. Fünf Wochen
lang. Der Fehler war nie unbekannt, er war nur unsichtbar.

Der Leitsatz aus techops-toolbox#401: **Ein Fehler, der nur im Log landet, ist
für den Benutzer nicht passiert.**

Vier Versandpfade schlucken ihn heute noch:

```python
except M365Error as e:
    logger.error("Failed to send invoice email for record %s: %s", record_id, e)
    return False
```

`invoices/tasks.py` (Rechnung, Mahnung), `offers/tasks.py` (Angebot) und
`contracts/services/order_confirmation.py` (Auftragsbestätigung).

Ursprünglich war geplant, diese vier — wie beim Abwesenheitsbericht — statt
`False` eine Ausnahme werfen zu lassen. **Das hilft hier nicht.** Alle vier
laufen ausschließlich als Celery-Task, gestartet mit `.delay(...)` aus
`schema.py`, `dunning_schema.py`, `order_confirmation_schema.py` und dem
MCP-Server. Es gibt keinen Aufrufer, der den Rückgabewert lesen könnte: die
Mutation ist längst beantwortet, wenn der Task läuft. Ein `raise` färbte nur den
Task im Broker rot, und den sieht auch niemand — derselbe stille Fehlschlag, nur
an anderer Stelle. Beim Abwesenheitsbericht war es richtig, weil der synchron
aus „Jetzt senden" läuft.

Was fehlt, ist ein Ort, an dem der Fehlschlag **stehen bleibt**: am Dokument
selbst. Dort schaut jemand nach, auch Tage später.

## What Changes

- Vier Dokumenttypen bekommen `email_error` und `email_last_attempt_at` neben
  ihren vorhandenen Erfolgsfeldern: `InvoiceRecord`, `OfferRecord`,
  `PaymentReminder`, `OrderConfirmation`.
- Die vier `except M365Error`-Blöcke schreiben den Grund dorthin, statt ihn nur
  zu protokollieren. Der Rückgabewert `False` bleibt — er stört nicht, er trägt
  nur keine Information mehr allein.
- Ein erfolgreicher Versand **räumt `email_error` wieder ab**. Sonst klebt ein
  alter Fehler an einem längst zugestellten Beleg.
- Die Felder werden im GraphQL-Typ freigegeben und in Liste und Detailansicht
  gezeigt: in der Liste als Kennzeichnung, im Detail mit Grund und Zeitpunkt.

## Capabilities

### Modified

- `email-sending` — der Versandzustand umfasst künftig auch den Fehlschlag,
  nicht nur den Erfolg.
