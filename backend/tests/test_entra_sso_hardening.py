"""Tests zu den Befunden aus dem Review des Entra-Anmeldeablaufs.

Jeder Test steht fuer eine Luecke, die ohne ihn wieder aufgehen kann.
"""
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache

from apps.core.entra_sso import EntraError, build_login_url, complete_login, fetch_jwks
from apps.tenants.models import Tenant, User

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


def jwks_for(signing_key, kid=KID):
    import base64

    key, _ = signing_key
    n = key.public_key().public_numbers()

    def b64(v: int) -> str:
        raw = v.to_bytes((v.bit_length() + 7) // 8, "big")
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return {"keys": [{"kty": "RSA", "kid": kid, "use": "sig", "n": b64(n.n), "e": b64(n.e)}]}


@pytest.fixture
def jwks(signing_key, monkeypatch):
    monkeypatch.setattr(
        "apps.core.entra_sso.fetch_jwks",
        lambda config, force_refresh=False: jwks_for(signing_key),
    )


def sso_settings():
    return {
        "entra_sso": {
            "enabled": True,
            "tenant_id": TENANT_ID,
            "client_id": CLIENT_ID,
            "client_secret": "s3cret",
        }
    }


@pytest.fixture
def sso_tenant(tenant):
    tenant.settings = sso_settings()
    tenant.save(update_fields=["settings"])
    return tenant


def make_token(signing_key, nonce, **overrides):
    _, pem = signing_key
    now = int(time.time())
    claims = {
        "iss": ISSUER, "aud": CLIENT_ID, "tid": TENANT_ID, "oid": OID,
        "email": "test@example.com", "preferred_username": "test@example.com",
        "nonce": nonce, "amr": ["pwd"], "iat": now, "exp": now + 600,
    }
    claims.update(overrides)
    return jwt.encode(claims, pem, algorithm="RS256", headers={"kid": KID})


@pytest.fixture
def exchange(monkeypatch, signing_key):
    def _install(state, **overrides):
        nonce = cache.get(f"entra_login:{state}")["nonce"]
        token = make_token(signing_key, nonce, **overrides)
        monkeypatch.setattr(
            "apps.core.entra_sso.exchange_code",
            lambda config, *, code, code_verifier, redirect_uri: {"id_token": token},
        )

    return _install


class TestLinkingCannotBeHijacked:
    """Befund 1: Die Adresse dient nur der einmaligen Zuordnung."""

    def test_refuses_a_second_identity_for_an_already_linked_account(
        self, db, sso_tenant, user, exchange, jwks
    ):
        user.email = "test@example.com"
        user.entra_object_id = OID
        user.entra_tenant_id = TENANT_ID
        user.save(update_fields=["email", "entra_object_id", "entra_tenant_id"])

        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        # Anderes Verzeichnisobjekt, gleiche Adresse - etwa ein Gastkonto oder
        # ein neu angelegtes Konto derselben Person.
        exchange(state, oid="bbbbbbbb-0000-0000-0000-000000000002")

        with pytest.raises(EntraError, match="already linked"):
            complete_login(sso_tenant, code="c", state=state, redirect_uri=REDIRECT)

        user.refresh_from_db()
        assert user.entra_object_id == OID  # unveraendert

    def test_still_links_an_unlinked_account_by_email(self, db, sso_tenant, user, exchange, jwks):
        user.email = "test@example.com"
        user.save(update_fields=["email"])
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        exchange(state)

        result = complete_login(sso_tenant, code="c", state=state, redirect_uri=REDIRECT)

        assert result.user == user


class TestStateBelongsToItsTenant:
    """Befund 2: Ein anderswo begonnener Versuch darf hier nicht enden."""

    def test_refuses_a_state_from_another_tenant(self, db, sso_tenant, exchange, jwks):
        other = Tenant.objects.create(name="Other Company", currency="EUR")
        other.settings = sso_settings()
        other.save(update_fields=["settings"])

        _, state = build_login_url(other, redirect_uri=REDIRECT)
        exchange(state)

        with pytest.raises(EntraError, match="state"):
            complete_login(sso_tenant, code="c", state=state, redirect_uri=REDIRECT)


class TestSigningKeyRollover:
    """Befund 3: Ein Schluesselwechsel darf nicht eine Stunde lang aussperren."""

    def test_refetches_once_when_the_key_is_unknown(self, db, sso_tenant, signing_key, monkeypatch):
        calls = {"n": 0}

        def fake_fetch(config, force_refresh=False):
            calls["n"] += 1
            # Erster Abruf liefert einen veralteten Schluesselsatz.
            return jwks_for(signing_key, kid="old-key") if not force_refresh else jwks_for(signing_key)

        monkeypatch.setattr("apps.core.entra_sso.fetch_jwks", fake_fetch)
        monkeypatch.setattr(
            "apps.core.entra_sso.exchange_code",
            lambda config, *, code, code_verifier, redirect_uri: {"id_token": token},
        )
        _, state = build_login_url(sso_tenant, redirect_uri=REDIRECT)
        nonce = cache.get(f"entra_login:{state}")["nonce"]
        token = make_token(signing_key, nonce)
        User.objects.filter(pk__isnull=True).exists()  # DB beruehren, damit db-Fixture greift

        from apps.core.entra_sso import verify_id_token

        claims = verify_id_token(sso_tenant, token, nonce=nonce)

        assert claims["oid"] == OID
        assert calls["n"] == 2  # einmal aus dem Cache, einmal frisch

    def test_gives_up_after_the_refetch(self, db, sso_tenant, signing_key, monkeypatch):
        monkeypatch.setattr(
            "apps.core.entra_sso.fetch_jwks",
            lambda config, force_refresh=False: jwks_for(signing_key, kid="never-matches"),
        )
        from apps.core.entra_sso import verify_id_token

        with pytest.raises(EntraError, match="key"):
            verify_id_token(sso_tenant, make_token(signing_key, "n"), nonce="n")


class TestJwksFailuresStayInContract:
    """Befund 5: Auch eine kaputte Antwort wirft EntraError, nicht irgendetwas."""

    def test_non_json_answer_becomes_an_entra_error(self, db, sso_tenant, monkeypatch):
        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                raise ValueError("not json")

        monkeypatch.setattr("apps.core.entra_sso.httpx.get", lambda *a, **kw: FakeResponse())

        with pytest.raises(EntraError):
            fetch_jwks({"tenant_id": TENANT_ID})


class TestSameIdentityInTwoTenants:
    """Befund 4: Ein Verzeichnis kann mehrere Mandanten bedienen."""

    def test_the_same_directory_identity_can_serve_two_tenants(self, db, tenant):
        other = Tenant.objects.create(name="Second Company", currency="EUR")
        first = User.objects.create_user(email="a@example.com", password="x", tenant=tenant)
        second = User.objects.create_user(email="b@example.com", password="x", tenant=other)

        for u in (first, second):
            u.entra_object_id = OID
            u.entra_tenant_id = TENANT_ID
            u.save(update_fields=["entra_object_id", "entra_tenant_id"])

        # Frueher scheiterte das zweite Speichern an einem globalen Constraint,
        # und zwar mit einem Datenbankfehler statt einer verstaendlichen Meldung.
        assert User.objects.filter(entra_object_id=OID).count() == 2

    def test_one_identity_cannot_serve_two_accounts_in_the_same_tenant(self, db, tenant):
        from django.db import IntegrityError, transaction

        User.objects.create_user(email="a@example.com", password="x", tenant=tenant)
        User.objects.filter(email="a@example.com").update(
            entra_object_id=OID, entra_tenant_id=TENANT_ID
        )
        second = User.objects.create_user(email="b@example.com", password="x", tenant=tenant)

        with pytest.raises(IntegrityError), transaction.atomic():
            second.entra_object_id = OID
            second.entra_tenant_id = TENANT_ID
            second.save(update_fields=["entra_object_id", "entra_tenant_id"])


class TestLocalLoginCanBeDisabled:
    """Befund 6: Das Feld muss auch etwas bewirken."""

    def _login(self, email, password):
        from unittest.mock import Mock

        from apps.core.context import Context
        from config.schema import schema

        return schema.execute_sync(
            """
            mutation($email: String!, $password: String!) {
                login(email: $email, password: $password) {
                    ... on AuthPayload { accessToken }
                    ... on AuthError { message }
                }
            }
            """,
            variable_values={"email": email, "password": password},
            context_value=Context(request=Mock(), user=None),
        )

    def test_password_login_works_for_an_ordinary_account(self, db, tenant):
        User.objects.create_user(email="normal@example.com", password="secret123", tenant=tenant)

        result = self._login("normal@example.com", "secret123")

        assert result.errors is None
        assert result.data["login"].get("accessToken")

    def test_password_login_is_refused_when_disabled(self, db, tenant):
        u = User.objects.create_user(email="sso-only@example.com", password="secret123", tenant=tenant)
        u.local_login_allowed = False
        u.save(update_fields=["local_login_allowed"])

        result = self._login("sso-only@example.com", "secret123")

        assert result.errors is None
        assert "disabled" in result.data["login"]["message"]
        assert not result.data["login"].get("accessToken")
