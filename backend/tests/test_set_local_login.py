"""Tests fuer den Umstellungsschritt auf SSO."""
import pytest
from django.core.management import CommandError, call_command

from apps.tenants.models import User


@pytest.fixture
def people(db, tenant):
    normal = User.objects.create_user(email="normal@example.com", password="x", tenant=tenant)
    rescue = User.objects.create_user(email="rescue@example.com", password="x", tenant=tenant)
    for u in (normal, rescue):
        u.entra_object_id = f"oid-{u.pk}"
        u.entra_tenant_id = "tid"
        u.save(update_fields=["entra_object_id", "entra_tenant_id"])
    return normal, rescue


class TestSetLocalLogin:
    def test_disables_everyone_except_the_emergency_account(self, db, people):
        normal, rescue = people

        call_command("set_local_login", "--disable", "--emergency", "rescue@example.com")

        normal.refresh_from_db()
        rescue.refresh_from_db()
        assert normal.local_login_allowed is False
        assert rescue.local_login_allowed is True

    def test_refuses_to_disable_without_an_emergency_account(self, db, people):
        """Ein Notweg ohne Notfallkonto ist kein Notweg."""
        with pytest.raises(CommandError, match="Notfallkonto"):
            call_command("set_local_login", "--disable")

        normal, _ = people
        normal.refresh_from_db()
        assert normal.local_login_allowed is True

    def test_refuses_an_unknown_emergency_account(self, db, people):
        # Ein Tippfehler darf nicht dazu fuehren, dass niemand mehr hereinkommt.
        with pytest.raises(CommandError, match="Unbekannte"):
            call_command("set_local_login", "--disable", "--emergency", "typo@example.com")

    def test_warns_about_accounts_that_are_not_linked_yet(self, db, tenant, capsys):
        User.objects.create_user(email="unlinked@example.com", password="x", tenant=tenant)
        rescue = User.objects.create_user(email="rescue@example.com", password="x", tenant=tenant)
        rescue.entra_object_id = "oid"
        rescue.entra_tenant_id = "tid"
        rescue.save(update_fields=["entra_object_id", "entra_tenant_id"])

        call_command("set_local_login", "--disable", "--emergency", "rescue@example.com")

        assert "unlinked@example.com" in capsys.readouterr().out

    def test_dry_run_changes_nothing(self, db, people):
        normal, _ = people

        call_command(
            "set_local_login", "--disable", "--emergency", "rescue@example.com", "--dry-run"
        )

        normal.refresh_from_db()
        assert normal.local_login_allowed is True

    def test_enable_gives_the_password_way_back(self, db, people):
        normal, _ = people
        normal.local_login_allowed = False
        normal.save(update_fields=["local_login_allowed"])

        call_command("set_local_login", "--enable")

        normal.refresh_from_db()
        assert normal.local_login_allowed is True

    def test_needs_exactly_one_direction(self, db, people):
        with pytest.raises(CommandError, match="Genau eines"):
            call_command("set_local_login")
