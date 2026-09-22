"""Tests fuer die Anmeldung der Anwendung selbst - Zertifikat statt Geheimnis.

Ein Geheimnis wird bei jedem Token-Tausch uebertragen. Ein privater Schluessel
nie: Die Anwendung signiert damit ein kurzlebiges JWT (Client-Assertion), und
nur das geht ueber die Leitung.
"""
import base64
import datetime
import hashlib
import time

import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from apps.core.entra_sso import EntraError, client_authentication

TOKEN_URL = "https://login.microsoftonline.com/tid/oauth2/v2.0/token"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture(scope="module")
def certificate():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "contract-cora-sso")])
    now = datetime.datetime.now(datetime.UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365))
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    return key, key_pem, cert_pem, cert


def config_with_certificate(certificate):
    _, key_pem, cert_pem, _ = certificate
    return {
        "client_id": CLIENT_ID,
        "tenant_id": "tid",
        "certificate_private_key": key_pem,
        "certificate": cert_pem,
    }


class TestSecretStaysPossible:
    def test_a_configured_secret_is_sent_as_before(self):
        payload = client_authentication(
            {"client_id": CLIENT_ID, "client_secret": "s3cret"}, token_url=TOKEN_URL
        )

        assert payload == {"client_secret": "s3cret"}


class TestClientAssertion:
    def test_prefers_the_certificate_over_a_secret(self, certificate):
        config = dict(config_with_certificate(certificate), client_secret="s3cret")

        payload = client_authentication(config, token_url=TOKEN_URL)

        assert "client_secret" not in payload
        assert payload["client_assertion_type"] == (
            "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
        )

    def test_the_assertion_verifies_with_the_public_key(self, certificate):
        key, _, _, _ = certificate
        payload = client_authentication(config_with_certificate(certificate), token_url=TOKEN_URL)

        claims = jwt.decode(
            payload["client_assertion"],
            key=key.public_key(),
            algorithms=["RS256"],
            audience=TOKEN_URL,
        )

        # Die Anwendung bezeugt sich selbst gegenueber dem Token-Endpunkt.
        assert claims["iss"] == CLIENT_ID
        assert claims["sub"] == CLIENT_ID
        assert claims["aud"] == TOKEN_URL
        assert claims["jti"]

    def test_the_assertion_is_short_lived(self, certificate):
        payload = client_authentication(config_with_certificate(certificate), token_url=TOKEN_URL)

        claims = jwt.decode(payload["client_assertion"], options={"verify_signature": False})

        # Ein langlebiges Bezeugungs-Token waere ein Geheimnis mit Extraschritt.
        assert claims["exp"] - int(time.time()) <= 600

    def test_names_the_certificate_in_the_header(self, certificate):
        """Ohne x5t weiss das Verzeichnis nicht, welches Zertifikat gemeint ist."""
        _, _, _, cert = certificate
        payload = client_authentication(config_with_certificate(certificate), token_url=TOKEN_URL)

        header = jwt.get_unverified_header(payload["client_assertion"])
        expected = base64.urlsafe_b64encode(
            hashlib.sha1(cert.public_bytes(serialization.Encoding.DER)).digest()
        ).rstrip(b"=").decode()

        assert header["x5t"] == expected
        assert header["alg"] == "RS256"

    def test_a_configured_thumbprint_wins(self, certificate):
        # Wer nur den Fingerabdruck kennt, muss das Zertifikat nicht hinterlegen.
        config = dict(config_with_certificate(certificate))
        config.pop("certificate")
        config["certificate_thumbprint"] = "AA:BB:CC:DD"

        payload = client_authentication(config, token_url=TOKEN_URL)

        header = jwt.get_unverified_header(payload["client_assertion"])
        assert header["x5t"] == base64.urlsafe_b64encode(
            bytes.fromhex("aabbccdd")
        ).rstrip(b"=").decode()


class TestBrokenConfiguration:
    def test_an_unusable_key_is_reported_clearly(self):
        config = {
            "client_id": CLIENT_ID,
            "certificate_private_key": "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----",
            "certificate_thumbprint": "aabb",
        }

        with pytest.raises(EntraError, match="private key"):
            client_authentication(config, token_url=TOKEN_URL)

    def test_a_key_without_a_certificate_or_thumbprint_is_refused(self, certificate):
        config = config_with_certificate(certificate)
        config.pop("certificate")

        with pytest.raises(EntraError, match="thumbprint"):
            client_authentication(config, token_url=TOKEN_URL)

    def test_nothing_configured_at_all_is_refused(self):
        with pytest.raises(EntraError, match="No client credential"):
            client_authentication({"client_id": CLIENT_ID}, token_url=TOKEN_URL)
