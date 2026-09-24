# Tasks

## 1. Basis-Adresse

- [x] 1.1 `FRONTEND_URL = env("FRONTEND_URL", default="")` in
      `backend/config/settings/base.py`
- [x] 1.2 Vorbelegung `http://localhost:4000` in
      `backend/config/settings/local.py`
- [x] 1.3 `backend/apps/core/frontend.py` mit `frontend_base_url()` anlegen
- [x] 1.4 Tests fuer `frontend_base_url()` (gesetzt, leer, mit Schraegstrich am
      Ende)

## 2. Fundstellen umstellen

- [x] 2.1 `apps/tenants/schema.py`: `invite_url`-Feld, `create_invitation`,
      `create_password_reset`, `forgot_password`, `sign_up`
- [x] 2.2 `apps/todos/schema.py`: beide Notify-Aufrufe
- [x] 2.3 `apps/contracts/schema.py` und
      `apps/contracts/order_confirmation_schema.py`: Link zur
      Auftragsbestaetigung
- [x] 2.4 `apps/core/entra_views.py`: `frontend_base()` durch die neue Funktion
      ersetzen
- [x] 2.5 Argument `base_url` aus `sign_up`, `create_invitation` und
      `create_password_reset` entfernen
- [x] 2.6 Frontend: `baseUrl` aus `SignupPage.tsx` und `UserManagement.tsx`
      entfernen
- [x] 2.7 Test: `forgotPassword` mit fremdem `Origin` erzeugt einen Link auf die
      konfigurierte Adresse
- [x] 2.8 Bestehende Tests nachziehen (`test_password_reset_email.py`,
      `test_signup.py`, `test_user_management.py`, `test_rbac.py`)

## 3. HubSpot-Mail

- [x] 3.1 `_sync_deal` uebergibt `contract_id` und `base_url` an `notify`
- [x] 3.2 `_build_hubspot_new_contract_email` haengt den Link an, wenn eine
      Basis vorliegt
- [x] 3.3 Alle Bausteine in `apps/core/notifications.py` maskieren ihren Text
- [x] 3.4 `send_notification` bringt den Betreff auf eine Zeile
- [x] 3.5 Erwaehnungs-Mail bekommt die Basis-Adresse mit
- [x] 3.6 Tests: Mail mit Link, Mail ohne Basis, Maskierung, Betreff

## 4. Deployment

- [x] 4.1 `FRONTEND_URL` ins ConfigMap in `k8s-infra`
- [ ] 4.2 Release-Tag im Fork, danach Abbild-Bump
- [ ] 4.3 Nach dem Ausrollen einmal eine Einladung an die eigene Adresse
      schicken und den Link pruefen
