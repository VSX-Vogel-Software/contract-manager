"""Globale Suche: gleiche Zugriffsregeln wie alle anderen Abfragen.

Die Suche las frueher info.context.user direkt und lieferte damit auch bei
einem 2FA-Setup-Token (nur Passwort, 2FA noch nicht eingerichtet) Treffer;
Leserechte der Rolle und der Scope eines API-Keys wurden ignoriert.
"""
from datetime import date
from decimal import Decimal

import pytest

from apps.contracts.models import Contract
from apps.core.auth import create_2fa_setup_token, create_access_token
from apps.customers.models import Customer
from apps.invoices.models import InvoiceRecord
from apps.tenants.models import APIKey, Role, Tenant, User

SEARCH = 'query { globalSearch(query: "Suchtreffer", limit: %s) { totalCount groups { type items { title } } } }'


def _post(client, query, *, token=None, api_key=None):
    headers = {}
    if token is not None:
        headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    if api_key is not None:
        headers["HTTP_X_API_KEY"] = api_key
    response = client.post("/graphql", data={"query": query}, content_type="application/json", **headers)
    assert response.status_code == 200
    body = response.json()
    assert "errors" not in body, body
    return body["data"]["globalSearch"]


def _types(result):
    return {g["type"] for g in result["groups"]}


@pytest.fixture
def searchable(tenant):
    """Je ein Kunde, Vertrag und eine Rechnung mit dem Suchbegriff."""
    customer = Customer.objects.create(tenant=tenant, name="Suchtreffer GmbH")
    contract = Contract.objects.create(
        tenant=tenant,
        customer=customer,
        name="Suchtreffer Wartung",
        status=Contract.Status.ACTIVE,
        start_date=date(2026, 1, 1),
        billing_start_date=date(2026, 1, 1),
        billing_interval=Contract.BillingInterval.MONTHLY,
    )
    InvoiceRecord.objects.create(
        tenant=tenant,
        contract=contract,
        customer=customer,
        invoice_number="Suchtreffer-0001",
        billing_date=date(2026, 1, 1),
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        total_net=Decimal("100.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("19.00"),
        total_gross=Decimal("119.00"),
        line_items_snapshot=[],
        company_data_snapshot={},
        customer_name=customer.name,
        contract_name=contract.name,
    )


def _user_with_permissions(tenant, permissions, email="eingeschraenkt@example.com"):
    role = Role.objects.create(tenant=tenant, name=f"Nur {email}", permissions=permissions)
    u = User.objects.create_user(email=email, password="x", tenant=tenant)
    u.roles.add(role)
    return u


def test_admin_finds_all_three_groups(client, user, searchable):
    result = _post(client, SEARCH % 10, token=create_access_token(user))
    assert _types(result) == {"customer", "contract", "invoice"}


def test_2fa_setup_token_gets_no_results(client, user, searchable):
    result = _post(client, SEARCH % 10, token=create_2fa_setup_token(user))
    assert result == {"totalCount": 0, "groups": []}


def test_anonymous_gets_no_results(client, searchable):
    assert _post(client, SEARCH % 10) == {"totalCount": 0, "groups": []}


def test_groups_follow_read_permissions(client, tenant, searchable):
    u = _user_with_permissions(tenant, {"customers.read": True, "contracts.read": True})
    result = _post(client, SEARCH % 10, token=create_access_token(u))
    assert _types(result) == {"customer", "contract"}


def test_without_any_read_permission_nothing_is_found(client, tenant, searchable):
    u = _user_with_permissions(tenant, {"todos.read": True}, email="nichts@example.com")
    assert _post(client, SEARCH % 10, token=create_access_token(u))["groups"] == []


def test_api_key_scope_limits_groups(client, user, searchable):
    raw, prefix, key_hash = APIKey.generate()
    APIKey.objects.create(
        tenant=user.tenant,
        user=user,
        name="Nur Vertraege",
        key_hash=key_hash,
        prefix=prefix,
        permissions={"contracts.read": True},
    )
    result = _post(client, SEARCH % 10, api_key=raw)
    assert _types(result) == {"contract"}


def test_other_tenant_sees_nothing(client, searchable):
    other = Tenant.objects.create(name="Fremdfirma", currency="EUR")
    u = User.objects.create_user(email="fremd@example.com", password="x", tenant=other)
    u.roles.add(Role.objects.get(tenant=other, name="Admin"))
    assert _post(client, SEARCH % 10, token=create_access_token(u))["groups"] == []


@pytest.mark.parametrize("limit", [-5, 0])
def test_limit_is_clamped_instead_of_failing(client, user, searchable, limit):
    result = _post(client, SEARCH % limit, token=create_access_token(user))
    assert all(len(g["items"]) == 1 for g in result["groups"])
