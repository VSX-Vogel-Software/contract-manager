"""Tests fuer den Anmeldeablauf: Start, Rueckkanal, Benutzerzuordnung."""
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache

from apps.core.entra_sso import EntraError, build_login_url, complete_login
from apps.tenants.models import User

TENANT_ID = "11111111-1111-1111-1111-111111111111"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
REDIRECT = "https://app.example.com/auth/entra/callback"
KID = "test-key"
OID = "aaaaaaaa-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def signing_key():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return key, pem


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def jwks(signing_key, monkeypatch):
    import base64

    key, _ = signing_key
    n = key.public_key().public_numbers()

    def b64(v: int) -> str:
        raw = v.to_bytes((v.bit_length() + 7) // 8, "big")
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    keys = {"keys": [{"kty": "RSA", "kid": KID, "use": "sig", "n": b64(n.n), "e": b64(n.e)}]}
    monkeypatch.setattr(
        "apps.core.entra_sso.fetch_jwks", lambda config, force_refresh=False: keys
    )


@pytest.fixture
def sso_tenant(tenant):
    tenant.settings = {
        "entra_sso": {
            "enabled": True,
            "tenant_id": TENANT_ID,
            "client_id": CLIENT_ID,
            "client_secret": "s3cret",
        }
    }
    tenant.save(update_fields=["settings"])
    return tenant


def id_token(signing_key, **overrides):
    _, pem = signing_key
    now = int(time.time())
    claims = {
        "iss": ISSUER, "aud": CLIENT_ID, "tid": TENANT_ID, "oid": OID,
        "email": "test@example.com", "preferred_username": "test@example.com",
        "amr": ["pwd"], "iat": now, "exp": now + 600,
    }
    claims.update(overrides)
    return claims, jwt.encode(claims, pem, algorithm="RS256", headers={"kid": KID})


@pytest.fixture
def exchange(monkeypatch, signing_key):
    """Attrappe fuer den Code-Tausch.

    Verhaelt sich wie das Verzeichnis: Sie spiegelt den `nonce` zurueck, der
    beim Start hinterlegt wurde. Genau daran haengt der Schutz gegen ein
    untergeschobenes Token.
    """
    def _install(state, **overrides):
        nonce = cache.get(f"entra_login:{state}")["nonce"]
        overrides.setdefault("nonce", nonce)
        claims, token = id_token(signing_key, **overrides)

        def fake_exchange(config, *, code, code_verifier, redirect_uri):
            return {"id_token": token}

        monkeypatch.setattr("apps.core.entra_sso.exchange_code", fake_exchange)
        return claims

    return _install


class TestBuildLoginUrl:
    def test_returns_a_url_with_state_and_challenge(self, db, sso_tenant):
        url, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)

        assert url.startswith(f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize")
        assert f"state={state}" in url
        assert "code_challenge=" in url and "code_challenge_method=S256" in url
        assert "nonce=" in url

    def test_remembers_the_request_server_side(self, db, sso_tenant):
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)

        # Im Browser abgelegt waeren state und nonce wirkungslos.
        assert cache.get(f"entra_login:{state}") is not None


class TestCompleteLogin:
    def test_links_an_existing_user_by_email_on_first_login(self, db, sso_tenant, user, exchange, jwks):
        user.email = "test@example.com"
        user.save(update_fields=["email"])
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state)

        result = complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

        user.refresh_from_db()
        assert result.user == user
        assert user.entra_object_id == OID
        assert user.entra_tenant_id == TENANT_ID

    def test_uses_the_object_id_once_linked(self, db, sso_tenant, user, exchange, jwks):
        """Adressen aendern sich, die Objekt-ID nicht."""
        user.email = "old@example.com"
        user.entra_object_id = OID
        user.entra_tenant_id = TENANT_ID
        user.save(update_fields=["email", "entra_object_id", "entra_tenant_id"])
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state, email="new@example.com", preferred_username="new@example.com")

        result = complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

        assert result.user == user

    def test_refuses_an_unknown_account(self, db, sso_tenant, exchange, jwks):
        """Kein Auto-Provisioning: sonst kommt jeder im Verzeichnis herein."""
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state, email="stranger@example.com", preferred_username="stranger@example.com")

        with pytest.raises(EntraError, match="no account"):
            complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

        assert not User.objects.filter(email="stranger@example.com").exists()

    def test_refuses_a_deactivated_account(self, db, sso_tenant, user, exchange, jwks):
        user.email = "test@example.com"
        user.is_active = False
        user.save(update_fields=["email", "is_active"])
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state)

        with pytest.raises(EntraError, match="not active"):
            complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

    def test_refuses_an_unknown_state(self, db, sso_tenant, user, jwks):
        with pytest.raises(EntraError, match="state"):
            complete_login(sso_tenant, code="the-code", state="never-issued", redirect_uri=REDIRECT)

    def test_state_cannot_be_used_twice(self, db, sso_tenant, user, exchange, jwks):
        user.email = "test@example.com"
        user.save(update_fields=["email"])
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state)

        complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

        with pytest.raises(EntraError, match="state"):
            complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

    def test_reports_whether_the_directory_did_mfa(self, db, sso_tenant, user, exchange, jwks):
        user.email = "test@example.com"
        user.save(update_fields=["email"])
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state, amr=["pwd", "mfa"])

        result = complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

        assert result.multi_factor is True

    def test_does_not_claim_mfa_when_the_directory_did_none(self, db, sso_tenant, user, exchange, jwks):
        user.email = "test@example.com"
        user.save(update_fields=["email"])
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state, amr=["pwd"])

        result = complete_login(sso_tenant, code="the-code", state=state, redirect_uri=REDIRECT)

        assert result.multi_factor is False
