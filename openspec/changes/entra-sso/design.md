## Context

Die Anmeldung ist heute vollständig selbst gebaut. Relevante vorhandene Infrastruktur:

- **JWT**: `apps/core/auth.py` — `create_access_token` (24 h) und `create_refresh_token` (7 Tage), HS256 auf dem `SECRET_KEY`. `apps/core/context.py` liest den Token aus dem `Authorization`-Header und legt den Benutzer in den GraphQL-Kontext.
- **Login**: `apps/core/schema.py` — `login(email, password)` prüft `authenticate()`, `is_active`, den Mandantenstatus und zweigt bei aktiver Zwei-Faktor-Konfiguration in einen Challenge-Token ab.
- **Frontend**: `lib/auth.tsx` hält den Token im `localStorage`, `lib/apollo.ts` hängt ihn im `authLink` an, `features/auth/Login.tsx` ist die Anmeldemaske.
- **MSAL** ist bereits Abhängigkeit — heute für den Mailversand per Client Credentials (`apps/core/m365.py`). Dieselbe Bibliothek beherrscht den Authorization-Code-Flow.
- **`django-oauth-toolkit`** ist installiert, aber in der Rolle als OAuth-**Provider** für die MCP-Anbindung (`/oauth/...` in `config/urls.py`). Für Entra brauchen wir die Gegenrichtung.
- **Redis** ist als Django-Cache in Benutzung (`django.core.cache`) — der Ablageort für `state` und `nonce`.
- **Mandantenkonfiguration**: `Tenant.settings` (JSONField) trägt bereits einen `m365`-Abschnitt.

## Goals / Non-Goals

**Goals:**

- Anmeldung über Entra ID neben der bestehenden, pro Mandant schaltbar.
- Bestehende Benutzer bleiben erhalten und werden verknüpft.
- Gesperrte Verzeichniskonten kommen nicht mehr herein.
- Ein belastbarer Notweg für den Ausfall des Anbieters.
- Lokal und in der CI testbar, ohne echtes Verzeichnis.

**Non-Goals:**

- Keine Abbildung von Verzeichnisgruppen auf Rollen.
- Kein Auto-Provisioning neuer Benutzer in dieser Stufe.
- Kein Wechsel des Session-Modells — der anwendungseigene JWT bleibt.
- Keine Anbindung weiterer Identitätsanbieter; die Naht für das ID-Token wird aber so gezogen, dass sie nicht auf Microsoft festgenagelt ist.

## Decisions

### Nach der Prüfung wird der eigene JWT ausgestellt

Entra beweist die Identität, danach übernimmt die Anwendung wie bisher. Alternative wäre, Entras Token durchzureichen und überall zu prüfen — das hätte Kontext, Rechteprüfung, Frontend-Sitzung und die MCP-Anbindung berührt. Der gewählte Weg lässt beide Anmeldearten parallel laufen und macht die Umstellung reversibel.

**Preis:** Sitzungsdrift — allerdings kleiner als zunächst angenommen. `get_user_from_token` filtert bereits auf `is_active`, und diese Funktion liegt in **jedem** Request, nicht nur beim Erneuern: Ein in der Anwendung deaktiviertes Konto ist sofort draußen. Offen bleibt allein der Fall, dass ein Konto **in Entra** gesperrt wird, in der Anwendung aber aktiv bleibt — davon erfährt die Anwendung nichts, bis jemand die Deaktivierung nachzieht. Wer das schließen will, braucht eine Rückfrage beim Verzeichnis; für den Anfang ist es bewusst offen und hier dokumentiert.

### Zuordnung über `oid`, nicht über die E-Mail-Adresse

Adressen ändern sich (Heirat, Namenskorrektur, Domänenwechsel), die Objekt-ID nicht. Beim ersten Anmelden wird über die Adresse zugeordnet, ab dann über `oid`. Gespeichert wird zusätzlich `tid`, damit eine `oid` aus einem fremden Verzeichnis nicht kollidieren kann.

**`email_verified` steht dabei nicht zur Verfügung** — Entra liefert dieses Feld nicht. Die Adresse taugt deshalb nur für die einmalige Zuordnung, nicht als Sicherheitsanker. Die Sicherheit hängt an der Verzeichnisprüfung unten.

### Das ID-Token wird streng geprüft

Signatur gegen JWKS, `aud`, `nonce`, Uhrentoleranz — und `tid` **zusammen mit** `iss`: beide müssen auf dasselbe, konfigurierte Verzeichnis zeigen. Ohne diese Prüfung kann sich jedes Microsoft-Konto der Welt anmelden, denn der Endpunkt ist öffentlich.

`state` und `nonce` liegen mit Verfallszeit im Redis-Cache. Im Browser abgelegt wären sie wirkungslos.

### Zwei-Faktor nur überspringen, wenn das Token es belegt

Naheliegend wäre, bei SSO auf die App-2FA zu verzichten, weil „Entra das macht". Das stimmt nur, wenn das Verzeichnis MFA auch erzwingt. Andernfalls sänke für Konten mit aktiver App-2FA die Sicherheit. Deshalb: überspringen nur, wenn `amr` ein `mfa` enthält.

### Der Notweg ist Auffindbarkeit, nicht Zugangskontrolle

Die Erkennung „Entra ist nicht erreichbar" läuft im Browser, und den kontrolliert im Zweifel ein Angreifer — wer das Passwortfeld sehen will, blockiert die Anfrage in den Entwicklerwerkzeugen. Das Einblenden ist deshalb reine Bequemlichkeit.

Die Entscheidung trifft das Backend: Der Passwort-Endpunkt prüft selbst, ob dieses Konto lokal anmelden darf. Nach der Umstellung gilt das nur noch für ausdrücklich markierte Notfallkonten.

Dazu drei Abgrenzungen:

1. **Nur technisches Versagen blendet den Notweg ein.** Eine Ablehnung durch Entra — gesperrtes oder ausgeschiedenes Konto — darf keine Ausweichtür öffnen; genau dafür wurde gesperrt.
2. **Ein fester Pfad** (`/login/local`) funktioniert unabhängig von jeder Erkennungslogik. Wenn die Anmeldeseite klemmt, hilft Logik auf der Anmeldeseite niemandem.
3. **Jede Nutzung des Notwegs wird protokolliert** und sollte melden. Ein Notweg, den niemand bemerkt, wird zum Hauptweg.

### Eigene App-Registrierung, getrennt vom Mailversand

Andere Rechte (delegiert `openid`, `profile`, `email` statt `Mail.Send` als Anwendungsrecht), eigene Redirect-URI. Trennung heißt: Das Rotieren des einen Geheimnisses legt nicht beides lahm. Zertifikat statt Geheimnis ist die robustere Variante, und die Registrierung darf nicht an einem persönlichen Konto hängen.

## Risks / Trade-offs

- **Aussperrung.** Fällt Entra aus und ist der Notweg nicht erprobt, steht die Anwendung. Gegenmaßnahme: Notfallkonten anlegen **und** den Weg mindestens einmal bewusst durchspielen, bevor die Passwort-Anmeldung abgeschaltet wird.
- **Gastkonten.** In einem Verzeichnis mit B2B-Gästen entscheidet die Verzeichnisprüfung, ob diese hereinkommen. Bewusst entscheiden.
- **Doppelte Wahrheit über Benutzer.** Ein Konto kann in der Anwendung aktiv und im Verzeichnis gesperrt sein. In der Anwendung wirkt `is_active` sofort (siehe oben), die Sperrung in Entra dagegen gar nicht — bis sie jemand nachzieht. Das ist der eigentliche Grund, die Deaktivierung an einer Stelle zu führen.

## Migration Plan

1. Felder und Endpunkte ausliefern, SSO für keinen Mandanten aktiv.
2. Für einen Mandanten aktivieren, SSO-Knopf neben der Passwort-Anmeldung.
3. Benutzer melden sich einmal per SSO an und werden dabei verknüpft. Verknüpfungsstand in der Benutzerverwaltung sichtbar.
4. Notfallkonten festlegen und den Notweg durchspielen.
5. Erst wenn alle verknüpft sind: lokale Anmeldung für normale Konten abschalten (unbrauchbares Passwort setzen).

## Open Questions

- SSO pro Mandant schaltbar oder global?
- Gastkonten zulassen?
- Wer besitzt die App-Registrierung?
- Sollen Verzeichnisgruppen später auf Rollen abgebildet werden?
