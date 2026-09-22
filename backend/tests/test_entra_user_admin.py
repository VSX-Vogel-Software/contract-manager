"""Tests fuer die Verwaltung der Verzeichnis-Verknuepfung."""
from unittest.mock import Mock

import pytest

from apps.core.context import Context
from apps.tenants.models import Role, User
from config.schema import schema

UNLINK = """
mutation($id: ID!) {
    unlinkEntraIdentity(userId: $id) { success error }
}
"""

SET_LOCAL = """
mutation($id: ID!, $allowed: Boolean!) {
    setLocalLoginAllowed(userId: $id, allowed: $allowed) { success error }
}
"""

USERS = """
{ users { email entraLinked localLoginAllowed } }
"""


@pytest.fixture
def admin(db, tenant):
    u = User.objects.create_user(email="admin-ua@example.com", password="x", tenant=tenant)
    u.roles.add(Role.objects.get(tenant=tenant, name="Admin"))
    return u


@pytest.fixture
def linked(db, tenant):
    u = User.objects.create_user(email="linked@example.com", password="x", tenant=tenant)
    u.entra_object_id = "oid-1"
    u.entra_tenant_id = "tid-1"
    u.save(update_fields=["entra_object_id", "entra_tenant_id"])
    return u


def run(query, user, **variables):
    return schema.execute_sync(
        query, variable_values=variables or None, context_value=Context(request=Mock(), user=user)
    )


class TestVisibility:
    def test_shows_who_is_linked_and_who_keeps_the_password_way(self, db, admin, linked):
        result = run(USERS, admin)

        by_email = {u["email"]: u for u in result.data["users"]}
        assert by_email["linked@example.com"]["entraLinked"] is True
        assert by_email["admin-ua@example.com"]["entraLinked"] is False
        assert by_email["linked@example.com"]["localLoginAllowed"] is True


class TestUnlink:
    def test_an_administrator_can_undo_a_wrong_assignment(self, db, admin, linked):
        result = run(UNLINK, admin, id=str(linked.pk))

        assert result.data["unlinkEntraIdentity"]["success"] is True
        linked.refresh_from_db()
        assert linked.entra_object_id == ""
        assert linked.entra_tenant_id == ""

    def test_refuses_an_account_that_is_not_linked(self, db, admin):
        result = run(UNLINK, admin, id=str(admin.pk))

        assert result.data["unlinkEntraIdentity"]["success"] is False
        assert "not linked" in result.data["unlinkEntraIdentity"]["error"]

    def test_needs_the_permission(self, db, tenant, linked):
        nobody = User.objects.create_user(email="nobody@example.com", password="x", tenant=tenant)

        result = run(UNLINK, nobody, id=str(linked.pk))

        assert result.data["unlinkEntraIdentity"]["success"] is False
        linked.refresh_from_db()
        assert linked.entra_object_id == "oid-1"


class TestEmergencyAccounts:
    def test_marks_an_account_as_emergency_or_not(self, db, admin, linked):
        assert run(SET_LOCAL, admin, id=str(linked.pk), allowed=False).data[
            "setLocalLoginAllowed"
        ]["success"] is True
        linked.refresh_from_db()
        assert linked.local_login_allowed is False

        run(SET_LOCAL, admin, id=str(linked.pk), allowed=True)
        linked.refresh_from_db()
        assert linked.local_login_allowed is True

    def test_nobody_can_take_the_password_way_from_themselves(self, db, admin):
        """Sonst sperrt man sich mitten in der Umstellung selbst aus."""
        result = run(SET_LOCAL, admin, id=str(admin.pk), allowed=False)

        assert result.data["setLocalLoginAllowed"]["success"] is False
        admin.refresh_from_db()
        assert admin.local_login_allowed is True
