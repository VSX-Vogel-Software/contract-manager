"""HTTP-Endpunkte fuer die Anmeldung ueber Entra ID.

Zwei Umleitungen, kein GraphQL: Der Browser muss zu Microsoft und wieder
zurueck. Am Ende stellt die Anwendung ihren eigenen JWT aus und uebergibt ihn
dem Frontend im URL-Fragment - das schickt der Browser weder an Server noch in
Zugriffsprotokolle, anders als ein Query-Parameter.
"""
import logging
from urllib.parse import urlencode

from django.http import HttpResponseRedirect
from django.utils import timezone
from django.views.decorators.http import require_GET

from apps.core.auth import create_2fa_challenge_token, create_access_token, create_refresh_token
from apps.core.entra_sso import (
    EntraError,
    EntraUnavailable,
    build_login_url,
    complete_login,
    end_session_url,
    get_sso_config,
)
from apps.core.frontend import frontend_base_url
from apps.tenants.models import Tenant

logger = logging.getLogger(__name__)


def frontend_base(request) -> str:
    """Wohin nach der Anmeldung zurueckgeleitet wird.

    Die konfigurierte Adresse gilt. Der ``Origin``-Kopf kommt beim Rueckruf aus
    dem Verzeichnis und darf nicht bestimmen, wohin die Sitzungsmerkmale im
    Fragment gehen. Nur wenn nichts konfiguriert ist, bleibt die eigene Adresse
    als Notnagel.
    """
    return frontend_base_url() or request.build_absolute_uri("/").rstrip("/")


def callback_uri(request, config: dict | None = None) -> str:
    """Wohin das Verzeichnis zurueckleitet.

    Eine konfigurierte Adresse hat Vorrang: Entra verlangt exakte
    Uebereinstimmung mit der registrierten Redirect-URI, und hinter einem Proxy
    ist die aus dem Request abgeleitete Adresse nicht zwangslaeufig die, die der
    Browser gesehen hat.
    """
    configured = (config or {}).get("redirect_uri")
    return configured or request.build_absolute_uri("/auth/entra/callback")


def resolve_tenant(request) -> Tenant:
    """Fuer welchen Mandanten wird angemeldet?

    Anders als beim Passwort-Login gibt es hier keine E-Mail-Adresse, aus der
    sich das ableiten liesse. Bei genau einem eingerichteten Mandanten ist die
    Antwort eindeutig; sonst muss der Aufrufer ihn benennen.
    """
    explicit = request.GET.get("tenant")
    if explicit:
        tenant = Tenant.objects.filter(pk=explicit, is_active=True).first()
        if not tenant:
            raise EntraError("Unknown tenant")
        get_sso_config(tenant)  # wirft, wenn dort kein SSO eingerichtet ist
        return tenant

    candidates = [
        t
        for t in Tenant.objects.filter(is_active=True)
        if (t.settings or {}).get("entra_sso", {}).get("enabled")
    ]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise EntraError("Entra SSO is not configured")
    raise EntraError("Several tenants use SSO - please name the tenant")


def _redirect_to_frontend(request, **fragment) -> HttpResponseRedirect:
    return HttpResponseRedirect(f"{frontend_base(request)}/login#{urlencode(fragment)}")


@require_GET
def entra_login_start(request):
    """Beginnt den Anmeldeversuch und schickt den Browser zu Microsoft."""
    try:
        tenant = resolve_tenant(request)
        url, _state = build_login_url(
            tenant, redirect_uri=callback_uri(request, get_sso_config(tenant))
        )
    except EntraUnavailable as exc:
        logger.warning("Entra SSO start failed, directory unreachable: %s", exc)
        return _redirect_to_frontend(request, sso_error="unavailable")
    except EntraError as exc:
        logger.warning("Entra SSO start refused: %s", exc)
        return _redirect_to_frontend(request, sso_error="denied", detail=str(exc))

    return HttpResponseRedirect(url)


@require_GET
def entra_login_callback(request):
    """Nimmt den Rueckkanal entgegen und stellt den anwendungseigenen JWT aus."""
    if request.GET.get("error"):
        # Microsoft selbst hat abgelehnt - kein Ausweichangebot.
        detail = request.GET.get("error_description") or request.GET["error"]
        logger.warning("Entra SSO denied by the directory: %s", detail)
        return _redirect_to_frontend(request, sso_error="denied", detail=detail)

    code = request.GET.get("code")
    state = request.GET.get("state")
    if not code or not state:
        return _redirect_to_frontend(request, sso_error="denied", detail="Incomplete response")

    try:
        tenant = resolve_tenant(request)
        result = complete_login(
            tenant,
            code=code,
            state=state,
            redirect_uri=callback_uri(request, get_sso_config(tenant)),
        )
    except EntraUnavailable as exc:
        # Nur hier darf die Oberflaeche den Notweg anbieten.
        logger.warning("Entra SSO callback failed, directory unreachable: %s", exc)
        return _redirect_to_frontend(request, sso_error="unavailable")
    except EntraError as exc:
        logger.warning("Entra SSO callback refused: %s", exc)
        return _redirect_to_frontend(request, sso_error="denied", detail=str(exc))

    user = result.user

    # Die App-2FA entfaellt nur, wenn das Verzeichnis mehrstufig geprueft hat.
    two_factor = getattr(user, "two_factor_config", None)
    needs_second_factor = bool(two_factor and two_factor.is_active and not result.multi_factor)

    # Protokolliert wird die Anmeldung am Verzeichnis - auch wenn danach noch
    # der zweite Faktor kommt. Sonst hinterlaesst genau der sicherere Weg
    # keine Spur.
    _log_sso_login(user, result, second_factor_pending=needs_second_factor)

    if needs_second_factor:
        challenge = create_2fa_challenge_token(user, two_factor.method)
        return _redirect_to_frontend(request, two_factor=challenge, method=two_factor.method)

    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    return _redirect_to_frontend(
        request,
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
    )


def _log_sso_login(user, result, *, second_factor_pending: bool = False) -> None:
    from apps.audit.models import AuditLog

    try:
        AuditLog.objects.create(
            tenant=user.tenant,
            action=AuditLog.Action.UPDATE,
            entity_type="user",
            entity_id=user.pk,
            entity_repr=f"SSO sign-in {user.email}",
            user=user,
            changes={
                "method": {"old": None, "new": "entra_sso"},
                "multi_factor": {"old": None, "new": result.multi_factor},
                "second_factor_pending": {"old": None, "new": second_factor_pending},
            },
        )
    except Exception:
        logger.exception("Could not record the SSO sign-in for %s", user.email)


@require_GET
def entra_logout(request):
    """Beendet zusaetzlich die Sitzung beim Verzeichnis.

    Ohne diesen Weg bleibt der Benutzer bei Microsoft angemeldet - der
    naechste Klick auf "Anmelden" fuehrt dann wortlos wieder hinein. Auf einem
    geteilten Rechner ist das eine Ueberraschung.
    """
    back_to = f"{frontend_base(request)}/login"
    try:
        config = get_sso_config(resolve_tenant(request))
    except EntraError:
        # Kein SSO eingerichtet: dann gibt es auch nichts abzumelden.
        return HttpResponseRedirect(back_to)

    return HttpResponseRedirect(
        f"{end_session_url(config)}?{urlencode({'post_logout_redirect_uri': back_to})}"
    )
