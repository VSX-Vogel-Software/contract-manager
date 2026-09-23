# Aufgaben

## 1. Modelle und Migrationen

- [x] 1.1 `email_error` (TextField, `blank=True`) und `email_last_attempt_at`
      (DateTimeField, `null=True, blank=True`) an `InvoiceRecord`
      (`apps/invoices/models.py`), neben den vorhandenen Erfolgsfeldern
- [x] 1.2 Dieselben Felder an `OfferRecord` (`apps/offers/models.py`)
- [x] 1.3 Dieselben Felder an `PaymentReminder` (`apps/invoices/models.py`)
- [x] 1.4 Dieselben Felder an `OrderConfirmation`
      (`apps/contracts/order_confirmation_models.py`)
- [x] 1.5 Migrationen erzeugen — additiv, kein Datenumzug

## 2. Versandpfade

Gemeinsamer Helfer statt vier Kopien: `apps/core/email_state.py` mit
`record_send_failure(obj, error)` und `record_send_success(obj)`, damit das
Abräumen im Erfolgsfall nicht an einer Stelle vergessen wird.

- [x] 2.1 Helfer anlegen, inklusive Kürzung auf 1000 Zeichen
- [x] 2.2 `apps/invoices/tasks.py` — Rechnung (`except M365Error`, Zeile ~344)
- [x] 2.3 `apps/invoices/tasks.py` — Mahnung (Zeile ~428)
- [x] 2.4 `apps/offers/tasks.py` — Angebot (Zeile ~128)
- [x] 2.5 `apps/contracts/services/order_confirmation.py` — AB (Zeile ~524)
- [x] 2.6 In allen vier Erfolgspfaden `record_send_success` aufrufen

## 3. GraphQL

- [x] 3.1 Felder am Rechnungstyp freigeben
- [x] 3.2 Felder am Angebotstyp freigeben
- [x] 3.3 Felder am Mahnungstyp freigeben
- [x] 3.4 Felder am AB-Typ freigeben

## 4. Oberfläche

- [x] 4.1 Gemeinsame Komponente `EmailSendStatus` — zeigt Grund und Zeitpunkt,
      `data-testid="email-send-error"`
- [x] 4.2 Rechnungsdetail einbinden
- [x] 4.3 Angebotsdetail einbinden
- [x] 4.4 Mahnung: in `PaymentReminderList` je Eintrag
- [ ] 4.5 AB-Detail einbinden - es gibt keine eigene AB-Detailseite. Die
      Felder werden an der AB-Liste im Vertrag bereits mitgeladen, die
      Anzeige dort fehlt noch
- [ ] 4.6 Kennzeichnung in der Rechnungs- und Angebotsliste - in der
      Mahnungsliste erledigt, die beiden grossen Listen fehlen noch
- [x] 4.7 Übersetzungen de/en

## 5. Tests

- [x] 5.1 pytest: `send_mail` mit `side_effect=M365Error(...)` -> `email_error`
      und `email_last_attempt_at` gesetzt, `email_sent_at` leer. Ueber den
      Helfer fuer alle vier, als Durchstich durch den Task nur fuer die
      Rechnung - die drei uebrigen Tasks brauchen schwerere Fixtures
      (Muster: `TestAbsenceReportSendFailure` in `tests/test_absence_report.py`)
- [x] 5.2 pytest: erfolgreicher Versand raeumt einen vorhandenen
      `email_error` ab (am Helfer; die vier Pfade rufen ihn nachweislich auf)
- [x] 5.3 pytest: Kürzung auf 1000 Zeichen
- [ ] 5.4 GraphQL-Test je Typ (offen) - die Felder sind freigegeben und
      typgeprueft, ein Abfragetest je Typ fehlt
- [x] 5.5 Vitest für `EmailSendStatus`: mit Fehler, ohne Fehler, nie versucht
- [x] 5.6 Volle Suite grün (pytest + vitest)

## 6. Abschluss

- [x] 6.1 Changelog-Eintrag
- [ ] 6.2 Spec nach `openspec/specs/email-sending/` übernehmen, Change
      archivieren
- [ ] 6.3 techops-toolbox#401 schließen — Ebene 1 entfällt begründet, siehe
      proposal.md
