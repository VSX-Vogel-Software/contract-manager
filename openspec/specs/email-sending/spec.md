## Requirements

### Requirement: Send invoice email via Graph API
The system SHALL send a finalized invoice to the customer's billing email addresses via the Microsoft Graph API `sendMail` endpoint, using the configured sender mailbox. The ZUGFeRD PDF SHALL be included as an attachment.

#### Scenario: Send invoice to customer with billing emails
- **WHEN** user triggers "Send Invoice" on a finalized InvoiceRecord and the customer has billing_emails configured
- **THEN** system dispatches a Celery task that sends the email via Graph API to all billing email addresses, with the PDF attached

#### Scenario: Send invoice when customer has no billing emails
- **WHEN** user triggers "Send Invoice" but the customer has no billing_emails
- **THEN** system returns an error indicating no recipient email addresses are available

#### Scenario: Send invoice when M365 is not configured
- **WHEN** user triggers "Send Invoice" but M365 credentials or sender mailbox are not configured
- **THEN** system returns an error indicating email sending is not configured

#### Scenario: Send invoice when PDF is not yet generated
- **WHEN** user triggers "Send Invoice" but the InvoiceRecord has no pdf_file
- **THEN** system returns an error indicating the PDF must be generated first

#### Scenario: Send invoice that is not finalized
- **WHEN** user triggers "Send Invoice" on a draft InvoiceRecord
- **THEN** system returns an error indicating only finalized invoices can be sent

### Requirement: Track email send status on InvoiceRecord
The system SHALL track when an invoice email was sent, to whom, and the Graph API message ID. Fields: `email_sent_at` (DateTimeField), `email_sent_to` (JSONField list), `email_message_id` (CharField).

#### Scenario: Fields populated after successful send
- **WHEN** the Celery task successfully sends the email
- **THEN** `email_sent_at` is set to the current timestamp, `email_sent_to` contains the list of recipient addresses, and `email_message_id` contains the Graph API message ID

#### Scenario: Fields remain null when not sent
- **WHEN** an invoice has never been sent by email
- **THEN** `email_sent_at` is null, `email_sent_to` is empty, `email_message_id` is empty

### Requirement: Email content uses invoice language
The system SHALL compose the email subject and body based on the customer's `invoice_language` setting, falling back to German if not set.

#### Scenario: German invoice email
- **WHEN** customer has `invoice_language` empty or "de"
- **THEN** email subject is "Rechnung {invoice_number}" and body is in German

#### Scenario: English invoice email
- **WHEN** customer has `invoice_language` set to "en"
- **THEN** email subject is "Invoice {invoice_number}" and body is in English

### Requirement: Expose send status in GraphQL
The system SHALL expose `emailSentAt`, `emailSentTo`, and `emailMessageId` on the `InvoiceRecordType` GraphQL type. A `sendInvoiceEmail` mutation SHALL trigger the send.

#### Scenario: Query sent invoice
- **WHEN** user queries an InvoiceRecord that has been sent
- **THEN** response includes `emailSentAt` timestamp and `emailSentTo` list

#### Scenario: Send invoice mutation
- **WHEN** user calls `sendInvoiceEmail(invoiceRecordId: ID!)` with valid permissions
- **THEN** system validates preconditions and dispatches the send task, returning success

#### Scenario: Send requires invoices.write permission
- **WHEN** a user without `invoices.write` permission calls `sendInvoiceEmail`
- **THEN** system returns a permission error

### Requirement: Display send status in invoice list
The system SHALL show an email sent indicator on invoices in the frontend list views, and provide a "Send" action button for finalized invoices that have not been sent.

#### Scenario: Unsent finalized invoice shows send button
- **WHEN** a finalized invoice with `emailSentAt` null is displayed in the invoice list
- **THEN** a "Send" action button (Mail icon) is visible

#### Scenario: Sent invoice shows sent indicator
- **WHEN** an invoice with `emailSentAt` set is displayed in the invoice list
- **THEN** a sent badge with the date is shown and the send button is hidden

#### Scenario: Send button hidden when M365 not configured
- **WHEN** M365 is not configured for the tenant
- **THEN** the send button is not shown on any invoices

### Requirement: Handle send failures gracefully
The system SHALL NOT retry failed sends automatically to avoid duplicate emails. Errors SHALL be logged and surfaced to the user.

#### Scenario: Graph API returns error
- **WHEN** the Graph API returns an error (auth failure, mailbox not found, etc.)
- **THEN** the Celery task logs the error, speichert ihn in `email_error` und `email_last_attempt_at` am Dokument, und `email_sent_at` bleibt leer

#### Scenario: User can retry after failure
- **WHEN** a previous send attempt failed and the user clicks "Send" again
- **THEN** system dispatches a new send task (no deduplication needed since previous attempt left no sent state)

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
