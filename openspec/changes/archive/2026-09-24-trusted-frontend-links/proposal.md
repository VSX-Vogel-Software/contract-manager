# Verlaessliche Frontend-Adresse fuer Links in Mails

## Why

Jeder Link, den die Anwendung in eine Mail schreibt oder als Verweis speichert,
wird heute aus dem `Origin`- bzw. `Referer`-Kopf des auslesenden Requests
gebaut:

```python
origin = request.headers.get("Origin") or request.headers.get("Referer", "").rstrip("/")
base_url = origin or getattr(settings, "FRONTEND_URL", "")
```

Daraus folgen zwei Probleme:

1. **Der Kopf kommt vom Aufrufer.** `/graphql` ist `csrf_exempt`, Django prueft
   dort weder `Origin` noch `Referer`. `forgotPassword` ist oeffentlich und
   ohne Anmeldung erreichbar. Wer die Mutation mit fremdem `Origin` aufruft,
   loest eine echte Mail aus unserem Absender aus, deren Link auf eine fremde
   Adresse zeigt - mitsamt gueltigem Token. Dasselbe Muster tragen Einladung,
   Todo-Mails und der am Vertrag gespeicherte Link zur Auftragsbestaetigung.
2. **`FRONTEND_URL` gibt es gar nicht.** Die Einstellung wird an sieben Stellen
   per `getattr` gelesen, ist aber weder in `config/settings/` definiert noch im
   ConfigMap gesetzt. Der Kopf ist damit nicht der Ausweichweg, sondern der
   Regelfall. Wo kein Request existiert - im HubSpot-Sync und in allen anderen
   Celery-Aufgaben - bleibt die Basis leer und die Mail verliert ihren Link
   ersatzlos.

Der zweite Punkt ist der Auslöser: die Mail ueber einen neu synchronisierten
HubSpot-Deal nennt Vertrags- und Kundennamen, aber niemand kann von dort aus
den Vertrag oeffnen.

## What Changes

- Neue Einstellung `FRONTEND_URL`, gelesen aus der Umgebung, gesetzt im
  Deployment.
- Neue Funktion `apps.core.frontend.frontend_base_url()` als einzige Quelle fuer
  die Basis-Adresse. Sie liest ausschliesslich die Einstellung; `Origin` und
  `Referer` werden nicht mehr herangezogen.
- Alle sieben Fundstellen stellen darauf um: Passwort-Zuruecksetzen (beide
  Wege), Einladung, `inviteUrl`-Feld, Registrierungsbestaetigung, beide
  Todo-Mails, Auftragsbestaetigungs-Link, Entra-Rueckleitung.
- Die Argumente `baseUrl` an `signUp`, `createInvitation` und
  `createPasswordReset` entfallen samt ihren Aufrufern im Frontend. Eine vom
  Aufrufer gelieferte Zieladresse ist genau das Problem.
- Die Mail zum neuen HubSpot-Vertrag bekommt einen Link auf den Vertrag.
- Alle Mail-Bausteine maskieren eingesetzten Text (HTML-Escaping). Vertrags- und
  Kundenname stammen aus HubSpot, Todo-Texte von Benutzern. `send_notification`
  bringt den Betreff auf eine Zeile.
- Die Mail zu einer Erwaehnung im Todo-Kommentar verlinkt die Todo-Liste; ihr
  Aufrufer hatte die Basis-Adresse bisher gar nicht mitgegeben.

## Capabilities

### New

- `frontend-links` - woher die Anwendung die Basis-Adresse fuer Links nimmt.

### Modified

- `notification-events` - die HubSpot-Mail verlinkt den Vertrag, die Mail zur
  Erwaehnung die Todo-Liste, Bausteine maskieren ihren Text.
- `smtp-mail-service` - der Betreff geht einzeilig hinaus.
