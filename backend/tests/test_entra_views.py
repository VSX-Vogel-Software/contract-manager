"""Tests fuer die beiden HTTP-Endpunkte des SSO-Anmeldewegs."""
import time
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache

from apps.core.entra_sso import EntraUnavailable
from apps.tenants.models import Tenant, User

TENANT_ID = "11111111-1111-1111-1111-111111111111"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
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


@pytest.fixture
def sso_user(sso_tenant):
    return User.objects.create_user(
        email="test@example.com", password="pw", tenant=sso_tenant
    )


def fragment_of(response) -> dict:
    parsed = urlparse(response["Location"])
    return {k: v[0] for k, v in parse_qs(parsed.fragment).items()}


@pytest.fixture
def exchange(monkeypatch, signing_key):
    def _install(state, **overrides):
        _, pem = signing_key
        now = int(time.time())
        claims = {
            "iss": ISSUER, "aud": CLIENT_ID, "tid": TENANT_ID, "oid": OID,
            "email": "test@example.com", "preferred_username": "test@example.com",
            "nonce": cache.get(f"entra_login:{state}")["nonce"],
            "amr": ["pwd"], "iat": now, "exp": now + 600,
        }
        claims.update(overrides)
        token = jwt.encode(claims, pem, algorithm="RS256", headers={"kid": KID})
        monkeypatch.setattr(
            "apps.core.entra_sso.exchange_code",
            lambda config, *, code, code_verifier, redirect_uri: {"id_token": token},
        )

    return _install


def start_login(client):
    response = client.get("/auth/entra/start")
    state = parse_qs(urlparse(response["Location"]).query)["state"][0]
    return state


class TestStart:
    def test_redirects_to_the_directory(self, db, sso_tenant, client):
        response = client.get("/auth/entra/start")

        assert response.status_code == 302
        assert response["Location"].startswith(
            f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize"
        )

    def test_reports_denied_when_no_tenant_uses_sso(self, db, tenant, client):
        response = client.get("/auth/entra/start")

        assert fragment_of(response)["sso_error"] == "denied"

    def test_needs_the_tenant_named_when_several_use_sso(self, db, sso_tenant, client):
        second = Tenant.objects.create(name="Second", currency="EUR")
        second.settings = sso_tenant.settings
        second.save(update_fields=["settings"])

        response = client.get("/auth/entra/start")

        assert fragment_of(response)["sso_error"] == "denied"


class TestCallback:
    def test_hands_tokens_to_the_frontend(self, db, sso_tenant, sso_user, client, exchange, jwks):
        state = start_login(client)
        exchange(state)

        response = client.get("/auth/entra/callback", {"code": "c", "state": state})

        fragment = fragment_of(response)
        assert fragment["access_token"] and fragment["refresh_token"]
        # Im Fragment, nicht in der Query: das landet in keinem Zugriffsprotokoll.
        assert "access_token" not in urlparse(response["Location"]).query

    def test_records_the_sign_in(self, db, sso_tenant, sso_user, client, exchange, jwks):
        from apps.audit.models import AuditLog

        state = start_login(client)
        exchange(state)

        client.get("/auth/entra/callback", {"code": "c", "state": state})

        entry = AuditLog.objects.filter(entity_type="user", entity_id=sso_user.pk).first()
        assert entry is not None
        assert entry.changes["method"]["new"] == "entra_sso"

    def test_a_rejection_by_the_directory_offers_no_fallback(self, db, sso_tenant, client):
        response = client.get(
            "/auth/entra/callback",
            {"error": "access_denied", "error_description": "Account is blocked"},
        )

        # "denied" heisst fuer die Oberflaeche: kein Notweg anbieten.
        assert fragment_of(response)["sso_error"] == "denied"

    def test_an_unreachable_directory_allows_the_fallback(
        self, db, sso_tenant, sso_user, client, monkeypatch, signing_key
    ):
        state = start_login(client)

        def unreachable(config, force_refresh=False):
            raise EntraUnavailable("connection refused")

        # Wohlgeformtes Token, damit der Ablauf wirklich bis zum
        # Schluesselabruf kommt - ein kaputtes waere schon vorher abgelehnt.
        _, pem = signing_key
        now = int(time.time())
        token = jwt.encode(
            {"iss": ISSUER, "aud": CLIENT_ID, "tid": TENANT_ID, "iat": now, "exp": now + 600},
            pem,
            algorithm="RS256",
            headers={"kid": KID},
        )
        monkeypatch.setattr("apps.core.entra_sso.fetch_jwks", unreachable)
        monkeypatch.setattr(
            "apps.core.entra_sso.exchange_code",
            lambda config, *, code, code_verifier, redirect_uri: {"id_token": token},
        )

        response = client.get("/auth/entra/callback", {"code": "c", "state": state})

        assert fragment_of(response)["sso_error"] == "unavailable"

    def test_an_unknown_account_is_a_rejection_not_an_outage(
        self, db, sso_tenant, client, exchange, jwks
    ):
        state = start_login(client)
        exchange(state, email="stranger@example.com", preferred_username="stranger@example.com")

        response = client.get("/auth/entra/callback", {"code": "c", "state": state})

        assert fragment_of(response)["sso_error"] == "denied"

    def test_an_incomplete_response_is_refused(self, db, sso_tenant, client):
        response = client.get("/auth/entra/callback", {"state": "something"})

        assert fragment_of(response)["sso_error"] == "denied"


class TestTwoFactorStillApplies:
    def _enable_2fa(self, user):
        from apps.tenants.models import TwoFactorConfig

        return TwoFactorConfig.objects.create(user=user, method="totp", is_active=True)

    def test_app_two_factor_is_requested_when_the_directory_did_none(
        self, db, sso_tenant, sso_user, client, exchange, jwks
    ):
        self._enable_2fa(sso_user)
        state = start_login(client)
        exchange(state, amr=["pwd"])

        response = client.get("/auth/entra/callback", {"code": "c", "state": state})

        fragment = fragment_of(response)
        assert fragment.get("two_factor")
        assert "access_token" not in fragment

    def test_app_two_factor_is_skipped_when_the_directory_did_mfa(
        self, db, sso_tenant, sso_user, client, exchange, jwks
    ):
        self._enable_2fa(sso_user)
        state = start_login(client)
        exchange(state, amr=["pwd", "mfa"])

        response = client.get("/auth/entra/callback", {"code": "c", "state": state})

        assert fragment_of(response).get("access_token")


class TestMalformedTokenIsARejection:
    def test_a_broken_token_does_not_look_like_an_outage(
        self, db, sso_tenant, sso_user, client, monkeypatch
    ):
        """Sonst oeffnete ein untergeschobenes Bruchstueck den Notweg."""
        state = start_login(client)
        monkeypatch.setattr(
            "apps.core.entra_sso.exchange_code",
            lambda config, *, code, code_verifier, redirect_uri: {"id_token": "x.y.z"},
        )

        response = client.get("/auth/entra/callback", {"code": "c", "state": state})

        assert fragment_of(response)["sso_error"] == "denied"


class TestSsoAvailabilityQuery:
    """Die Maske muss vor der Anmeldung wissen, ob es SSO gibt."""

    def _ask(self):
        from unittest.mock import Mock

        from apps.core.context import Context
        from config.schema import schema

        return schema.execute_sync(
            "{ entraSsoEnabled }", context_value=Context(request=Mock(), user=None)
        )

    def test_false_without_configuration(self, db, tenant):
        assert self._ask().data["entraSsoEnabled"] is False

    def test_true_once_configured(self, db, sso_tenant):
        assert self._ask().data["entraSsoEnabled"] is True

    def test_false_when_configured_but_switched_off(self, db, sso_tenant):
        sso_tenant.settings["entra_sso"]["enabled"] = False
        sso_tenant.save(update_fields=["settings"])

        assert self._ask().data["entraSsoEnabled"] is False

    def test_answers_without_authentication(self, db, sso_tenant):
        """Vor der Anmeldung gibt es keinen Benutzer - die Abfrage muss trotzdem gehen."""
        assert self._ask().errors is None
