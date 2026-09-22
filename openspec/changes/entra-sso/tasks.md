## 1. Backend — Datenmodell & Konfiguration

- [x] 1.1 Felder `entra_object_id` (CharField, nullable, indiziert) und `entra_tenant_id` (CharField, nullable) an `User` in `apps/tenants/models.py`
- [x] 1.2 Feld `local_login_allowed` (BooleanField, Default `True`) an `User` — kennzeichnet Notfallkonten nach der Umstellung
- [x] 1.3 Eindeutigkeit über (`entra_tenant_id`, `entra_object_id`) als Constraint
- [x] 1.4 Abschnitt `entra_sso` in `Tenant.settings`: `tenant_id`, `client_id`, `client_secret`, `enabled`, `redirect_uri`
- [x] 1.5 Migration erzeugen und ausführen

## 2. Backend — Anmeldeweg

- [x] 2.1 Startendpunkt: Weiterleitung zu Entra mit `state`, `nonce`, PKCE; beides mit Verfallszeit in den Redis-Cache
- [x] 2.2 Rückkanal: Code gegen Token tauschen (MSAL, Confidential Client)
- [x] 2.3 ID-Token prüfen: Signatur gegen JWKS, `aud`, `nonce`, Uhrentoleranz
- [x] 2.4 `tid` **und** `iss` gegen die konfigurierte Verzeichnis-ID prüfen — beide müssen auf dasselbe Verzeichnis zeigen
- [x] 2.5 Benutzer zuordnen: vorhandene `oid` bevorzugt, sonst einmalig über die E-Mail-Adresse, dabei `oid` und `tid` speichern
- [x] 2.6 Kein Auto-Provisioning: unbekannte Adresse wird abgelehnt, mit verständlicher Meldung
- [x] 2.7 `is_active` und Mandantenstatus prüfen wie bei der Passwort-Anmeldung
- [x] 2.8 App-2FA überspringen, wenn `amr` ein `mfa` enthält — sonst wie bisher in die Challenge abzweigen
- [x] 2.9 Anwendungseigenen JWT ausstellen, `last_login` setzen, Audit-Eintrag schreiben
- [x] 2.10 JWKS-Antwort zwischenspeichern (Cache mit Verfallszeit), damit nicht jede Anmeldung einen Abruf auslöst

## 3. Backend — Abmelden, Erneuern, Notweg

- [x] 3.1 Abmelden: Wahl zwischen „nur hier" und Weiterleitung zum Abmelden bei Microsoft
- [x] 3.2 Beim Erneuern des Tokens `is_active` prüfen — war bereits erfüllt: `get_user_from_token` filtert darauf, in jedem Request. Mit Test abgedeckt, damit es nicht verlorengeht
- [x] 3.3 Passwort-Endpunkt lehnt Konten mit `local_login_allowed == False` ab — unabhängig davon, ob das Formular sichtbar war
- [x] 3.4 Jede erfolgreiche lokale Anmeldung bei aktivem SSO als Audit-Ereignis festhalten
- [x] 3.5 Management-Command, um Konten auf `local_login_allowed = False` zu setzen (Umstellungsschritt)

## 4. Frontend

- [x] 4.1 SSO-Knopf auf der Anmeldemaske, sichtbar nur bei konfiguriertem und aktivem SSO für den Mandanten
- [x] 4.2 Rückkanal-Route: Token entgegennehmen, in die bestehende Sitzung übernehmen, weiterleiten
- [x] 4.3 Technischer Fehlschlag blendet die lokale Anmeldung ein, mit Hinweis „Microsoft ist gerade nicht erreichbar"
- [x] 4.4 Ablehnung durch Entra zeigt die Ablehnung — **ohne** Ausweichangebot
- [x] 4.5 Fester Pfad `/login/local`, der unabhängig von der Erkennungslogik funktioniert
- [x] 4.6 Abmelden-Dialog mit der Wahl aus 3.1
- [x] 4.7 Texte in `de.json` und `en.json`

## 5. Benutzerverwaltung

- [x] 5.1 In der Benutzerübersicht sichtbar machen, ob ein Konto mit dem Verzeichnis verknüpft ist
- [x] 5.2 Kennzeichnung der Notfallkonten (`local_login_allowed`)
- [x] 5.3 Verknüpfung durch einen Administrator lösbar (z. B. nach falscher Zuordnung)

## 6. Testaufbau

- [x] 6.1 Aussteller-URL und JWKS-Quelle aus der Konfiguration beziehen, damit Tests eigene Token signieren können
- [x] 6.2 Mock-OIDC-Anbieter als optionaler Dienst in `docker-compose.yml`
- [x] 6.3 Kurzanleitung in der README: lokal gegen den Mock, einmal gegen eine Dev-Registrierung mit `http://localhost:…`

## 7. Tests

- [x] 7.1 Falsche `tid` wird abgelehnt
- [x] 7.2 `iss` und `tid` müssen zusammenpassen
- [x] 7.3 Fehlender oder falscher `state`/`nonce` wird abgelehnt
- [x] 7.4 Abgelaufenes oder manipuliertes Token wird abgelehnt
- [x] 7.5 Unbekannte Adresse ohne Auto-Provisioning wird abgelehnt
- [x] 7.6 Bekannter Benutzer bekommt einen gültigen JWT; `oid` und `tid` werden gespeichert
- [x] 7.7 Zweite Anmeldung ordnet über `oid` zu, auch wenn sich die Adresse geändert hat
- [x] 7.8 Deaktivierter Benutzer kommt nicht herein
- [x] 7.9 Ohne `mfa` in `amr` greift die App-2FA weiterhin
- [x] 7.10 Passwort-Endpunkt lehnt `local_login_allowed == False` ab
- [x] 7.11 Erneuern prüft `is_active`
- [x] 7.12 Frontend: SSO-Knopf nur bei aktivem SSO; lokale Anmeldung erscheint nach technischem Fehlschlag, **nicht** nach Ablehnung
- [x] 7.13 E2E gegen den Mock-Anbieter, inklusive Notweg bei abgeschaltetem Anbieter

## 8. Rollout

- [ ] 8.1 App-Registrierung anlegen (nicht an einem persönlichen Konto, Zertifikat bevorzugt), Ablauf überwachen
  - [x] Zertifikats-Anmeldung im Code umgesetzt (Client-Assertion mit `x5t`), Geheimnis bleibt möglich
  - [x] Skript zum Anlegen der Registrierung vorbereitet
- [ ] 8.2 Ausliefern mit SSO für keinen Mandanten aktiv
- [ ] 8.3 Für einen Mandanten aktivieren, Verknüpfung der Benutzer beobachten
- [ ] 8.4 Notfallkonten festlegen und den Notweg einmal bewusst durchspielen
- [ ] 8.5 Erst danach lokale Anmeldung für normale Konten abschalten
