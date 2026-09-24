## MODIFIED Requirements

### Requirement: HubSpot new contract notification
The system SHALL fire a `hubspot_new_contract` notification when `_sync_deal` creates a new contract. The notification SHALL be sent to all active users in the tenant who are subscribed to this event type. The email SHALL include the contract name, the customer name and, when a frontend base URL is configured, a link to the contract.

#### Scenario: Notification sent to all subscribed users on new deal sync
- **WHEN** `_sync_deal` creates a new contract for customer "Acme Corp"
- **THEN** the system fires `hubspot_new_contract` notification to all active tenant users who have not opted out, with subject containing "New contract" and body containing the contract name and "Acme Corp"

#### Scenario: Opted-out users are excluded
- **WHEN** `_sync_deal` creates a new contract and user X has `{"hubspot_new_contract": false}`
- **THEN** user X does not receive the notification email, but other subscribed users do

#### Scenario: No notification for skipped (already existing) deals
- **WHEN** `_sync_deal` returns `"skipped"` because the contract already exists
- **THEN** the system does not fire any notification

#### Scenario: Mail verlinkt den Vertrag
- **WHEN** `_sync_deal` einen Vertrag mit der ID 42 anlegt und `FRONTEND_URL` auf `https://contract-cora.com` steht
- **THEN** enthaelt der Text der Mail einen Verweis auf `https://contract-cora.com/contracts/42`

#### Scenario: Ohne konfigurierte Adresse kein Link
- **WHEN** `_sync_deal` einen Vertrag anlegt und `FRONTEND_URL` leer ist
- **THEN** enthaelt die Mail Vertrags- und Kundennamen, aber kein `<a>`-Element

### Requirement: Notification dispatch function
The system SHALL provide a `notify(tenant, event_type, **kwargs)` function that determines recipients, checks each recipient's subscription preference, builds the email, and calls `send_notification()` from `apps/core/smtp.py`. Notification failures SHALL be logged but SHALL NOT raise exceptions or block the calling operation. Jeder Baustein MUST eingesetzten Text maskieren, damit Inhalte aus HubSpot oder von Benutzern kein Markup in die Mail tragen.

#### Scenario: Notification sent to subscribed user
- **WHEN** `notify` is called for `todo_assigned` and the recipient has not opted out
- **THEN** the system calls `send_notification` with the recipient's email, an appropriate subject, and an HTML body describing the todo

#### Scenario: Notification skipped for unsubscribed user
- **WHEN** `notify` is called for `todo_assigned` and the recipient has `{"todo_assigned": false}`
- **THEN** the system does not call `send_notification` for that recipient

#### Scenario: Notification skipped when SMTP not configured
- **WHEN** `notify` is called but the tenant has no SMTP configuration
- **THEN** the system catches the `SmtpError`, logs a debug message, and returns without error

#### Scenario: SMTP failure does not block the calling operation
- **WHEN** `notify` is called and `send_notification` raises `SmtpError`
- **THEN** the system logs the error and returns without raising an exception

#### Scenario: Markup im Vertragsnamen landet maskiert in der Mail
- **WHEN** ein HubSpot-Deal `<img src=x onerror=alert(1)>` heisst und dafuer eine Mail gebaut wird
- **THEN** enthaelt der Text der Mail kein ausfuehrbares Markup, sondern die maskierte Zeichenfolge
