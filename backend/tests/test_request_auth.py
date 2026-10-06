"""User wird je Anfrage nur einmal aus dem Bearer-Token geladen.

AuditUserMiddleware und GraphQL-Kontext teilen sich das Ergebnis von
get_user_from_request(). Auth-Semantik (gueltig, ungueltig, abgelaufen,
fehlend, inaktiv, 2FA-Setup-Scope) und Tenant-Isolation bleiben gleich.
"""
from datetime import timedelta
from unittest import mock

import pytest
from django.db import connection
from django.test import RequestFactory
from django.test.utils import CaptureQueriesContext

from apps.audit import services as audit_services
from apps.audit.middleware import AuditUserMiddleware
from apps.core import auth as core_auth
from apps.core.auth import (
    create_2fa_setup_token,
    create_access_token,
    get_user_from_request,
)
from apps.core.context import get_context
from apps.customers.models import Customer
from apps.tenants.models import Role, Tenant, User

ME_QUERY = "query { me { id email tenantId } }"
CUSTOMERS_QUERY = "query { customers { items { name } totalCount } }"


def _post(client, query, token=None):
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token is not None else {}
    response = client.post(
        "/graphql",
        data={"query": query},
        content_type="application/json",
        **headers,
    )
    assert response.status_code == 200
    return response.json()


def _expired_token(user):
    return create_access_token(user, expires_delta=timedelta(seconds=-10))


@pytest.fixture
def spy_load():
    """Zaehlt die DB-Loads des Users (get_user_from_token)."""
    with mock.patch.object(
        core_auth, "get_user_from_token", wraps=core_auth.get_user_from_token
    ) as spy:
        yield spy


@pytest.fixture
def other_tenant_user(db):
    other = Tenant.objects.create(name="Other Company", currency="EUR")
    u = User.objects.create_user(email="other@example.com", password="x", tenant=other)
    u.roles.add(Role.objects.get(tenant=other, name="Admin"))
    Customer.objects.create(tenant=other, name="Fremdkunde")
    return u


class TestSingleUserLoadPerRequest:
    def test_valid_token_loads_user_once(self, client, user, spy_load):
        body = _post(client, ME_QUERY, create_access_token(user))
        assert body["data"]["me"]["email"] == user.email
        assert spy_load.call_count == 1

    def test_valid_token_query_count(self, client, user):
        """Auth kostet je Anfrage nur noch User + Rollen-Prefetch (vorher 4)."""
        token = create_access_token(user)
        with CaptureQueriesContext(connection) as ctx:
            _post(client, "query { feedbackEnabled }", token)
        user_loads = [q for q in ctx.captured_queries if 'FROM "tenants_user"' in q["sql"]]
        assert len(user_loads) == 1
        assert len(ctx.captured_queries) <= 2

    @pytest.mark.parametrize(
        "token_factory",
        [
            pytest.param(lambda u: "kein.gueltiges.jwt", id="ungueltig"),
            pytest.param(_expired_token, id="abgelaufen"),
        ],
    )
    def test_bad_token_is_anonymous(self, client, user, spy_load, token_factory):
        body = _post(client, ME_QUERY, token_factory(user))
        assert body["data"]["me"] is None
        # Auch das Fehlergebnis wird nur einmal ermittelt
        assert spy_load.call_count == 1

        body = _post(client, CUSTOMERS_QUERY, token_factory(user))
        assert body["data"] is None
        assert "Authentication required" in body["errors"][0]["message"]

    def test_missing_token_is_anonymous(self, client, user, spy_load):
        body = _post(client, ME_QUERY)
        assert body["data"]["me"] is None
        assert spy_load.call_count == 0

        body = _post(client, CUSTOMERS_QUERY)
        assert "Authentication required" in body["errors"][0]["message"]

    def test_inactive_user_is_anonymous(self, client, user):
        token = create_access_token(user)
        user.is_active = False
        user.save()
        body = _post(client, ME_QUERY, token)
        assert body["data"]["me"] is None

    def test_2fa_setup_scope_still_restricted(self, client, user):
        body = _post(client, CUSTOMERS_QUERY, create_2fa_setup_token(user))
        assert "Two-factor authentication setup required" in body["errors"][0]["message"]


class TestTenantIsolation:
    def test_each_token_sees_only_own_tenant(self, client, user, tenant, other_tenant_user):
        Customer.objects.create(tenant=tenant, name="Eigenkunde")

        own = _post(client, CUSTOMERS_QUERY, create_access_token(user))
        other = _post(client, CUSTOMERS_QUERY, create_access_token(other_tenant_user))

        assert [c["name"] for c in own["data"]["customers"]["items"]] == ["Eigenkunde"]
        assert [c["name"] for c in other["data"]["customers"]["items"]] == ["Fremdkunde"]


class TestRequestCache:
    def test_middleware_and_context_share_user(self, user, spy_load):
        token = create_access_token(user)
        request = RequestFactory().post("/graphql", HTTP_AUTHORIZATION=f"Bearer {token}")
        seen = {}

        def view(req):
            seen["audit_user"] = audit_services.get_current_user()
            seen["context"] = get_context(req)
            return mock.Mock()

        AuditUserMiddleware(view)(request)

        assert seen["audit_user"] == user
        assert seen["context"].user is seen["audit_user"]
        assert spy_load.call_count == 1
        # Nach der Anfrage ist der Audit-User wieder geleert
        assert audit_services.get_current_user() is None

    @pytest.mark.parametrize("header", ["Bearer kaputt", "", "Basic abc"])
    def test_middleware_without_valid_token_sets_no_audit_user(self, db, header):
        request = RequestFactory().post("/graphql", HTTP_AUTHORIZATION=header)
        seen = {}

        def view(req):
            seen["audit_user"] = audit_services.get_current_user()
            seen["context"] = get_context(req)
            return mock.Mock()

        AuditUserMiddleware(view)(request)
        assert seen["audit_user"] is None
        assert seen["context"].user is None

    def test_changed_token_on_same_request_is_reevaluated(self, user, other_tenant_user):
        """Der Cache gilt nur fuer genau das Token, mit dem er befuellt wurde."""
        request = RequestFactory().get(
            "/", HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}"
        )
        assert get_user_from_request(request) == user

        request.META["HTTP_AUTHORIZATION"] = f"Bearer {create_access_token(other_tenant_user)}"
        # headers ist ein gecachtes Property - neu aufbauen wie bei einem neuen Request
        request.__dict__.pop("headers", None)
        assert get_user_from_request(request) == other_tenant_user

        request.META.pop("HTTP_AUTHORIZATION")
        request.__dict__.pop("headers", None)
        assert get_user_from_request(request) is None
