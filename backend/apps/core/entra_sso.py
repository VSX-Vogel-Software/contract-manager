"""Anmeldung ueber Microsoft Entra ID.

Entra beweist die Identitaet, danach stellt die Anwendung ihren eigenen JWT aus
(siehe openspec/changes/entra-sso/design.md). Dieses Modul deckt den Teil bis
zum geprueften ID-Token ab.

Die Pruefung ist die Stelle, an der SSO steht oder faellt: Der Endpunkt von
Microsoft ist oeffentlich, jedes Konto der Welt bekommt dort ein gueltig
signiertes Token. Erst der Abgleich von `tid` und `iss` gegen das konfigurierte
Verzeichnis macht daraus eine Aussage ueber *euer* Verzeichnis.
"""
import base64
import hashlib
import logging
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt
from django.core.cache import cache

logger = logging.getLogger(__name__)

AUTHORITY_BASE = "https://login.microsoftonline.com"
JWKS_CACHE_TTL = 60 * 60
CLOCK_LEEWAY_SECONDS = 120
# Wie lange ein begonnener Anmeldeversuch gueltig bleibt.
LOGIN_REQUEST_TTL = 10 * 60


class EntraError(Exception):
    """Anmeldung ueber Entra ID nicht moeglich."""


def get_sso_config(tenant) -> dict:
    """Konfiguration des Mandanten, oder Fehler wenn SSO nicht eingerichtet ist."""
    config = (tenant.settings or {}).get("entra_sso", {})
    required = ("tenant_id", "client_id", "client_secret")
    if not config.get("enabled") or any(not config.get(k) for k in required):
        raise EntraError("Entra SSO is not configured for this tenant")
    return config


def authority(config: dict) -> str:
    return f"{config.get('authority_base', AUTHORITY_BASE)}/{config['tenant_id']}"


def expected_issuer(config: dict) -> str:
    """Ueberschreibbar, damit Tests und ein Mock-Anbieter ohne Microsoft auskommen."""
    return config.get("issuer") or f"{authority(config)}/v2.0"


def jwks_url(config: dict) -> str:
    return config.get("jwks_url") or f"{authority(config)}/discovery/v2.0/keys"


def fetch_jwks(config: dict, force_refresh: bool = False) -> dict:
    """Signaturschluessel des Verzeichnisses, eine Stunde zwischengespeichert.

    `force_refresh` umgeht den Cache - noetig, wenn das Verzeichnis seinen
    Signaturschluessel gewechselt hat.
    """
    url = jwks_url(config)
    cache_key = f"entra_jwks:{url}"
    if not force_refresh:
        cached = cache.get(cache_key)
        if cached:
            return cached

    try:
        response = httpx.get(url, timeout=10)
        response.raise_for_status()
        keys = response.json()
    except httpx.HTTPError as exc:
        raise EntraError(f"Could not reach the directory: {exc}") from exc
    except ValueError as exc:
        # Eine 200-Antwort, die kein JSON ist (Portal, Proxy-Fehlerseite) darf
        # nicht als irgendein Fehler nach oben durchschlagen.
        raise EntraError(f"The directory returned no usable key set: {exc}") from exc

    cache.set(cache_key, keys, JWKS_CACHE_TTL)
    return keys


def _signing_key(token: str, config: dict):
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError as exc:
        raise EntraError(f"Malformed token: {exc}") from exc

    # Microsoft wechselt die Signaturschluessel regelmaessig. Findet sich die
    # kid nicht, liegt das meist am zwischengespeicherten Satz - also einmal
    # frisch nachladen, bevor abgelehnt wird. Sonst sperrt jeder Wechsel bis
    # zum Ablauf des Caches alle Anmeldungen aus.
    for force_refresh in (False, True):
        for key in fetch_jwks(config, force_refresh=force_refresh).get("keys", []):
            if key.get("kid") == kid:
                try:
                    return jwt.PyJWK(key).key
                except Exception as exc:  # unbrauchbarer Schluesseleintrag
                    raise EntraError(f"Unusable signing key in the key set: {exc}") from exc

    raise EntraError("No matching signing key for this token")


def verify_id_token(tenant, id_token: str, *, nonce: str) -> dict:
    """Prueft das ID-Token und gibt seine Claims zurueck.

    Geprueft werden Signatur, Aussteller, Zielgruppe, Ablauf, `nonce` und - als
    eigentliche Zugangsentscheidung - die Verzeichnis-ID.
    """
    config = get_sso_config(tenant)
    key = _signing_key(id_token, config)

    try:
        claims = jwt.decode(
            id_token,
            key=key,
            algorithms=["RS256"],
            audience=config["client_id"],
            issuer=expected_issuer(config),
            leeway=CLOCK_LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise EntraError(f"Token rejected: {exc}") from exc

    if claims.get("tid") != config["tenant_id"]:
        # Ohne diese Pruefung waere jedes Microsoft-Konto der Welt willkommen.
        raise EntraError("Token was issued for a different directory")

    if not nonce or claims.get("nonce") != nonce:
        raise EntraError("Token does not match the expected nonce")

    return claims


def has_multi_factor(claims: dict) -> bool:
    """Ob das Verzeichnis mehrstufig authentifiziert hat.

    Nur dann darf die anwendungseigene Zwei-Faktor-Pruefung entfallen - sonst
    saenke fuer Konten mit aktiver App-2FA die Sicherheit.
    """
    return "mfa" in (claims.get("amr") or [])


def _url_safe_secret(length: int = 32) -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(length)).rstrip(b"=").decode()


def build_login_url(tenant, *, redirect_uri: str) -> tuple[str, str]:
    """Beginnt einen Anmeldeversuch und liefert (Weiterleitungsziel, state).

    `state`, `nonce` und der PKCE-Verifier liegen serverseitig im Cache - im
    Browser abgelegt waeren sie wirkungslos.
    """
    config = get_sso_config(tenant)

    state = _url_safe_secret()
    nonce = _url_safe_secret()
    verifier = _url_safe_secret(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()

    cache.set(
        f"entra_login:{state}",
        {"nonce": nonce, "verifier": verifier, "redirect_uri": redirect_uri, "tenant_id": tenant.id},
        LOGIN_REQUEST_TTL,
    )

    params = {
        "client_id": config["client_id"],
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "response_mode": "query",
        "scope": "openid profile email",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{authority(config)}/oauth2/v2.0/authorize?{urlencode(params)}", state


def exchange_code(config: dict, *, code: str, code_verifier: str, redirect_uri: str) -> dict:
    """Loest den Autorisierungscode beim Verzeichnis ein."""
    from msal import ConfidentialClientApplication

    app = ConfidentialClientApplication(
        client_id=config["client_id"],
        client_credential=config["client_secret"],
        authority=authority(config),
    )
    result = app.acquire_token_by_authorization_code(
        code,
        scopes=["openid", "profile", "email"],
        redirect_uri=redirect_uri,
        data={"code_verifier": code_verifier},
    )
    if "id_token" not in result:
        reason = result.get("error_description") or result.get("error") or "unknown error"
        raise EntraError(f"Could not redeem the authorization code: {reason}")
    return result


@dataclass
class LoginResult:
    user: object
    claims: dict
    multi_factor: bool


def _find_user(tenant, claims: dict):
    """Zuordnung: erst ueber die Objekt-ID, beim ersten Mal ueber die Adresse.

    Kein Auto-Provisioning - sonst haette jeder im Verzeichnis sofort Zugang,
    Gastkonten eingeschlossen.
    """
    from apps.tenants.models import User

    oid = claims.get("oid") or ""
    tid = claims.get("tid") or ""
    if oid:
        linked = User.objects.filter(
            tenant=tenant, entra_object_id=oid, entra_tenant_id=tid
        ).first()
        if linked:
            return linked

    email = (claims.get("email") or claims.get("preferred_username") or "").strip()
    if not email:
        raise EntraError("The directory did not provide an email address")

    user = User.objects.filter(tenant=tenant, email__iexact=email).first()
    if not user:
        raise EntraError(f"There is no account for {email}")

    # Die Adresse taugt nur fuer die einmalige Zuordnung. Ist das Konto bereits
    # mit einer anderen Verzeichnisidentitaet verknuepft, waere ein Wechsel ueber
    # die Adresse eine Uebernahme - etwa durch ein Gastkonto mit gleicher Mail.
    if user.entra_object_id and user.entra_object_id != oid:
        raise EntraError(
            f"The account for {email} is already linked to a different directory identity"
        )
    return user


def complete_login(tenant, *, code: str, state: str, redirect_uri: str) -> LoginResult:
    """Schliesst den Anmeldeversuch ab und liefert den zugeordneten Benutzer."""
    pending = cache.get(f"entra_login:{state}")
    if not pending:
        raise EntraError("Unknown or expired state - please start the sign-in again")
    # Einmalig: ein zurueckgespielter Rueckkanal darf nicht noch einmal ziehen.
    cache.delete(f"entra_login:{state}")

    # Der Versuch gehoert zu dem Mandanten, bei dem er begonnen wurde.
    if pending.get("tenant_id") != tenant.id:
        raise EntraError("This state was issued for a different tenant")

    config = get_sso_config(tenant)
    tokens = exchange_code(
        config,
        code=code,
        code_verifier=pending["verifier"],
        redirect_uri=pending.get("redirect_uri", redirect_uri),
    )
    claims = verify_id_token(tenant, tokens["id_token"], nonce=pending["nonce"])

    user = _find_user(tenant, claims)
    if not user.is_active:
        raise EntraError("This account is not active")
    if user.tenant and not user.tenant.is_active:
        raise EntraError("This account is not active")

    oid, tid = claims.get("oid") or "", claims.get("tid") or ""
    if oid and (user.entra_object_id != oid or user.entra_tenant_id != tid):
        user.entra_object_id = oid
        user.entra_tenant_id = tid
        user.save(update_fields=["entra_object_id", "entra_tenant_id"])

    return LoginResult(user=user, claims=claims, multi_factor=has_multi_factor(claims))
