"""Tests fuer die Pruefung des Entra-ID-Tokens.

Die Pruefung ist die Stelle, an der SSO steht oder faellt: Ohne sie kann sich
jedes Microsoft-Konto der Welt anmelden, denn der Endpunkt ist oeffentlich.
Deshalb signieren die Tests ihre Token selbst und spielen durch, was Microsoft
nie freiwillig liefert.
"""
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from apps.core.entra_sso import EntraError, verify_id_token

TENANT_ID = "11111111-1111-1111-1111-111111111111"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
KID = "test-key"


@pytest.fixture(scope="module")
def signing_key():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return key, private_pem


@pytest.fixture
def jwks(signing_key, monkeypatch):
    """Statt bei Microsoft nachzufragen, liefert der Test seinen eigenen Schluessel."""
    key, _ = signing_key
    numbers = key.public_key().public_numbers()

    def _b64(value: int) -> str:
        import base64
        raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    keys = {"keys": [{"kty": "RSA", "kid": KID, "use": "sig", "n": _b64(numbers.n), "e": _b64(numbers.e)}]}
    monkeypatch.setattr(
        "apps.core.entra_sso.fetch_jwks", lambda config, force_refresh=False: keys
    )
    return keys


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


def make_token(signing_key, **overrides):
    _, private_pem = signing_key
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": CLIENT_ID,
        "tid": TENANT_ID,
        "oid": "aaaaaaaa-0000-0000-0000-000000000001",
        "preferred_username": "someone@example.com",
        "email": "someone@example.com",
        "nonce": "the-nonce",
        "amr": ["pwd"],
        "iat": now,
        "exp": now + 600,
    }
    claims.update(overrides)
    return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": KID})


class TestVerifyIdToken:
    def test_accepts_a_token_from_the_configured_directory(self, db, sso_tenant, signing_key, jwks):
        claims = verify_id_token(sso_tenant, make_token(signing_key), nonce="the-nonce")

        assert claims["oid"] == "aaaaaaaa-0000-0000-0000-000000000001"
        assert claims["email"] == "someone@example.com"

    def test_rejects_a_foreign_directory(self, db, sso_tenant, signing_key, jwks):
        """Ohne diese Pruefung kann sich jedes Microsoft-Konto der Welt anmelden."""
        other = "99999999-9999-9999-9999-999999999999"
        token = make_token(signing_key, tid=other, iss=f"https://login.microsoftonline.com/{other}/v2.0")

        with pytest.raises(EntraError):
            verify_id_token(sso_tenant, token, nonce="the-nonce")

    def test_tid_is_checked_in_its_own_right(self, db, sso_tenant, signing_key, jwks):
        """Der Aussteller-Check allein genuegt nicht.

        Ein Token mit passendem `iss`, aber fremder `tid` kaeme sonst durch -
        deshalb wird die Verzeichnis-ID getrennt geprueft.
        """
        token = make_token(signing_key, tid="99999999-9999-9999-9999-999999999999")

        with pytest.raises(EntraError, match="directory"):
            verify_id_token(sso_tenant, token, nonce="the-nonce")

    def test_rejects_when_issuer_and_tid_disagree(self, db, sso_tenant, signing_key, jwks):
        token = make_token(signing_key, iss="https://login.microsoftonline.com/somewhere-else/v2.0")

        with pytest.raises(EntraError):
            verify_id_token(sso_tenant, token, nonce="the-nonce")

    def test_rejects_a_token_for_another_application(self, db, sso_tenant, signing_key, jwks):
        token = make_token(signing_key, aud="another-client")

        with pytest.raises(EntraError):
            verify_id_token(sso_tenant, token, nonce="the-nonce")

    def test_rejects_a_replayed_nonce(self, db, sso_tenant, signing_key, jwks):
        token = make_token(signing_key, nonce="a-different-nonce")

        with pytest.raises(EntraError, match="nonce"):
            verify_id_token(sso_tenant, token, nonce="the-nonce")

    def test_rejects_an_expired_token(self, db, sso_tenant, signing_key, jwks):
        now = int(time.time())
        token = make_token(signing_key, iat=now - 7200, exp=now - 3600)

        with pytest.raises(EntraError):
            verify_id_token(sso_tenant, token, nonce="the-nonce")

    def test_rejects_a_tampered_signature(self, db, sso_tenant, signing_key, jwks):
        token = make_token(signing_key)
        head, payload, signature = token.split(".")
        tampered = f"{head}.{payload}.{signature[:-4]}abcd"

        with pytest.raises(EntraError):
            verify_id_token(sso_tenant, tampered, nonce="the-nonce")

    def test_rejects_an_unknown_signing_key(self, db, sso_tenant, signing_key, jwks):
        _, private_pem = signing_key
        token = jwt.encode({"iss": ISSUER}, private_pem, algorithm="RS256", headers={"kid": "unknown"})

        with pytest.raises(EntraError, match="key"):
            verify_id_token(sso_tenant, token, nonce="the-nonce")

    def test_refuses_when_sso_is_not_enabled(self, db, tenant, signing_key, jwks):
        with pytest.raises(EntraError, match="not configured"):
            verify_id_token(tenant, make_token(signing_key), nonce="the-nonce")
