"""Tests fuer die Basis-Adresse des Frontends.

Deckt ab, dass Links nur aus der Konfiguration stammen und nicht aus Koepfen,
die der Aufrufer setzen kann.
"""
from unittest.mock import Mock, patch

import pytest

from apps.core.context import Context
from apps.core.frontend import frontend_base_url
from apps.tenants.models import PasswordResetToken
from apps.tenants.schema import TenantMutation


class TestFrontendBaseUrl:
    def test_liefert_konfigurierte_adresse(self, settings):
        settings.FRONTEND_URL = "https://contract-cora.com"
        assert frontend_base_url() == "https://contract-cora.com"

    def test_schneidet_abschliessenden_schraegstrich_ab(self, settings):
        settings.FRONTEND_URL = "https://contract-cora.com/"
        assert frontend_base_url() == "https://contract-cora.com"

    def test_leer_wenn_nicht_gesetzt(self, settings):
        settings.FRONTEND_URL = ""
        assert frontend_base_url() == ""

    def test_nimmt_keinen_request_entgegen(self):
        """Die Signatur ist Teil der Zusage: kein Request, kein Origin."""
        import inspect

        assert list(inspect.signature(frontend_base_url).parameters) == []


def _context_mit_fremdem_origin(user=None):
    request = Mock()
    request.headers = {
        "Origin": "https://fremde.example",
        "Referer": "https://fremde.example/login",
    }
    request.tenant = user.tenant if user else None
    return Context(request=request, user=user)


@pytest.mark.django_db
class TestOriginWirdIgnoriert:
    def test_request_password_reset_nutzt_konfigurierte_adresse(self, settings, user):
        settings.FRONTEND_URL = "https://contract-cora.com"
        info = Mock()
        info.context = _context_mit_fremdem_origin()

        with patch("apps.tenants.tasks.send_password_reset_email.delay") as delay:
            result = TenantMutation().request_password_reset(info, email=user.email)

        assert result.success is True
        delay.assert_called_once()
        _, reset_url = delay.call_args[0]
        token = PasswordResetToken.objects.get(user=user).token
        assert reset_url == f"https://contract-cora.com/reset-password/{token}"
        assert "fremde.example" not in reset_url

    def test_request_password_reset_ohne_adresse_ohne_praefix(self, settings, user):
        settings.FRONTEND_URL = ""
        info = Mock()
        info.context = _context_mit_fremdem_origin()

        with patch("apps.tenants.tasks.send_password_reset_email.delay") as delay:
            TenantMutation().request_password_reset(info, email=user.email)

        _, reset_url = delay.call_args[0]
        assert "fremde.example" not in reset_url
        assert reset_url.startswith("/reset-password/")

    def test_invite_url_feld_nutzt_konfigurierte_adresse(self, settings, user, tenant):
        settings.FRONTEND_URL = "https://contract-cora.com"
        from apps.tenants.models import UserInvitation
        from apps.tenants.schema import InvitationType

        invitation = UserInvitation.create_invitation(
            tenant=tenant, email="neu@test.local", created_by=user
        )
        info = Mock()
        info.context = _context_mit_fremdem_origin(user)
        url = InvitationType.invite_url(invitation, info)

        assert url == f"https://contract-cora.com/invite/{invitation.token}"


class TestSchemaOhneBaseUrl:
    """baseUrl war ein Argument des Aufrufers - genau das war das Problem."""

    @pytest.mark.parametrize(
        "feld", ["signUp", "createInvitation", "createPasswordReset"]
    )
    def test_kein_base_url_argument_mehr(self, feld):
        from config.schema import schema

        mutation = schema.as_str()
        definition = [
            zeile for zeile in mutation.splitlines() if zeile.strip().startswith(f"{feld}(")
        ]
        assert definition, f"{feld} nicht im Schema gefunden"
        assert "baseUrl" not in definition[0]


class TestHubspotMail:
    """Die Mail aus dem Sync laeuft ohne Request - der Link kommt aus der
    Einstellung oder gar nicht."""

    def _build(self, **kwargs):
        from apps.core.notifications import _build_hubspot_new_contract_email

        werte = {
            "contract_name": "Wartung 2026",
            "customer_name": "Acme Corp",
            "contract_id": 42,
            "base_url": "https://contract-cora.com",
        }
        werte.update(kwargs)
        return _build_hubspot_new_contract_email(**werte)

    def test_mail_verlinkt_den_vertrag(self):
        subject, body = self._build()
        assert "Wartung 2026" in subject
        assert 'href="https://contract-cora.com/contracts/42"' in body
        assert "Acme Corp" in body

    def test_ohne_basis_kein_link(self):
        _, body = self._build(base_url="")
        assert "<a " not in body
        assert "Wartung 2026" in body
        assert "Acme Corp" in body

    def test_ohne_vertrags_id_kein_link(self):
        _, body = self._build(contract_id=None)
        assert "<a " not in body

    def test_markup_im_namen_wird_maskiert(self):
        _, body = self._build(contract_name='<img src=x onerror=alert(1)>')
        assert "<img" not in body
        assert "&lt;img" in body


class TestBetreff:
    def test_umbruch_im_betreff_wird_entfernt(self):
        from apps.core.smtp import _single_line

        assert _single_line("Neuer Vertrag\nBcc: fremd@example") == (
            "Neuer Vertrag Bcc: fremd@example"
        )

    def test_betreff_ohne_umbruch_bleibt(self):
        from apps.core.smtp import _single_line

        assert _single_line("Neuer Vertrag") == "Neuer Vertrag"


class TestErwaehnungsMail:
    def test_mail_verlinkt_die_todo_liste(self):
        from unittest.mock import Mock as M

        from apps.core.notifications import _build_todo_mention_email

        todo = M(text="Rechnung pruefen")
        mentioner = M(get_full_name=lambda: "Anna Admin")
        _, body = _build_todo_mention_email(
            todo=todo,
            mentioner=mentioner,
            comment_text="schau mal",
            base_url="https://contract-cora.com",
        )
        assert 'href="https://contract-cora.com/todos"' in body
