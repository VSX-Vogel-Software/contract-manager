## MODIFIED Requirements

### Requirement: Send notification API
The system SHALL provide a `send_notification(tenant, *, to, subject, body_html)` function that sends an email via SMTP using the tenant's configuration. Der Betreff MUST vor dem Versand auf eine Zeile gebracht werden, damit eingesetzte Namen keine weitere Kopfzeile anhaengen koennen.

#### Scenario: Successful notification send
- **WHEN** a caller invokes `send_notification` with a configured tenant, recipient list, subject, and HTML body
- **THEN** the system connects to SMTP, sends the email from the configured `from_address` to all recipients, and returns without error

#### Scenario: Notification send with unconfigured tenant
- **WHEN** a caller invokes `send_notification` on a tenant without SMTP configuration
- **THEN** the system raises `SmtpError` with message "SMTP not configured"

#### Scenario: Notification send with SMTP server error
- **WHEN** a caller invokes `send_notification` but the SMTP server returns an error
- **THEN** the system raises `SmtpError` with the server's error details

#### Scenario: Umbruch im Betreff
- **WHEN** ein Betreff einen Zeilenumbruch enthaelt
- **THEN** traegt die Nachricht einen einzeiligen Betreff, in dem der Umbruch durch ein Leerzeichen ersetzt ist
