"""Basis-Adresse des Frontends.

Einzige Quelle fuer alle Links, die die Anwendung nach draussen gibt: Links in
Mails, am Vertrag gespeicherte Verweise und die Rueckleitung nach der Anmeldung
ueber das Verzeichnis.

Bewusst ohne Request-Parameter. Frueher kam die Adresse aus dem ``Origin``- oder
``Referer``-Kopf, also vom Aufrufer. Da ``/graphql`` `csrf_exempt` ist, prueft
Django diese Koepfe nicht, und ``forgotPassword`` ist ohne Anmeldung
erreichbar - ein fremder Kopf haette den Link zum Zuruecksetzen des Passworts
auf eine fremde Adresse gelenkt. Eine Funktion, die den Request gar nicht erst
entgegennimmt, laesst diesen Fehler nicht wieder zu.
"""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def frontend_base_url() -> str:
    """Adresse des Frontends ohne abschliessenden Schraegstrich.

    Leerer String, wenn ``FRONTEND_URL`` nicht gesetzt ist. Aufrufer haengen
    ihren Link dann nicht an, statt eine unvollstaendige Adresse zu schreiben.
    """
    configured = (getattr(settings, "FRONTEND_URL", "") or "").strip().rstrip("/")
    if not configured:
        logger.warning(
            "FRONTEND_URL ist nicht gesetzt - Links in Mails entfallen"
        )
    return configured
