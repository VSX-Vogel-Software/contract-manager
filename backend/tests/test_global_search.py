"""Globale Suche: Testmatrix der Bewertung vom 07.10.2026 als Regressionstest.

Eigene Testdaten statt der Demo-DB, aber nach denselben Mustern (Umlaute,
"Gießerei", "Thurn und Taxis", Nummern, Betraege). Laeuft unter SQLite mit
den Python-Gegenstuecken von cm_fold/word_similarity und unter Postgres
(TEST_POSTGRES=1) mit den echten Funktionen.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.banking.models import Counterparty, IncomingInvoice
from apps.contracts.models import Contract
from apps.core.auth import create_access_token
from apps.core.search import AREA_TYPES, run_search
from apps.customers.models import Customer
from apps.invoices.models import InvoiceRecord
from apps.offers.models import OfferRecord
from apps.products.models import Product
from apps.tenants.models import APIKey, Role, Tenant, User

# --- Testdaten ---------------------------------------------------------------


def _contract(tenant, customer, name, **kwargs):
    return Contract.objects.create(
        tenant=tenant,
        customer=customer,
        name=name,
        status=Contract.Status.ACTIVE,
        start_date=date(2026, 1, 1),
        billing_start_date=date(2026, 1, 1),
        billing_interval=Contract.BillingInterval.MONTHLY,
        **kwargs,
    )


def _invoice(tenant, customer, number, net, gross=None, *, billing=date(2026, 3, 1), **kwargs):
    gross = net if gross is None else gross
    return InvoiceRecord.objects.create(
        tenant=tenant,
        customer=customer,
        invoice_number=number,
        billing_date=billing,
        period_start=billing,
        period_end=billing,
        total_net=Decimal(net),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal(gross) - Decimal(net),
        total_gross=Decimal(gross),
        line_items_snapshot=[],
        company_data_snapshot={},
        customer_name=customer.name,
        contract_name="",
        **kwargs,
    )


def _offer(tenant, customer, number, net, gross):
    return OfferRecord.objects.create(
        tenant=tenant,
        customer=customer,
        offer_number=number,
        offer_date=date(2026, 2, 1),
        billing_date=date(2026, 2, 1),
        period_start=date(2026, 2, 1),
        period_end=date(2026, 2, 28),
        total_net=Decimal(net),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal(gross) - Decimal(net),
        total_gross=Decimal(gross),
        line_items_snapshot=[],
        company_data_snapshot={},
        customer_name=customer.name,
        contract_name="",
    )


@pytest.fixture
def data(tenant):
    """Kunden, Vertraege, Rechnungen, Angebot, Produkte, Eingangsrechnung, Gegenpartei."""
    c = {}
    c["mueller"] = Customer.objects.create(
        tenant=tenant,
        name="Gebrüder Müller-Lüdenscheidt Präzisionsmaschinenbau GmbH & Co. KG",
        netsuite_customer_number="T-K-0001",
        vat_id="DE781802744",
        billing_emails=["rechnung@gebrüdermüllerlüdenschei.example"],
        address={"city": "Berlin", "zip": "14109"},
    )
    # Wohnt in Luedenscheid - darf "Mueller-Luedenscheidt" nicht verdraengen
    c["sauerland"] = Customer.objects.create(
        tenant=tenant, name="Sauerland Logistik GmbH", netsuite_customer_number="T-K-0002",
        address={"city": "Lüdenscheid"},
    )
    c["thurn"] = Customer.objects.create(
        tenant=tenant,
        name="Fürstlich Thurn und Taxis'sche Forstverwaltung & Holzvermarktung KG",
        netsuite_customer_number="T-K-0003",
    )
    c["hamburg"] = Customer.objects.create(
        tenant=tenant,
        name="Internationale Handelsgesellschaft für Industriearmaturen Hamburg-Altona GmbH",
        netsuite_customer_number="T-K-0004",
    )
    c["oebb"] = Customer.objects.create(
        tenant=tenant,
        name="Österreichische Bundesbahnen-Infrastruktur Wartungsdienste GesmbH",
        netsuite_customer_number="T-K-0005",
    )
    for name in ("Alpen Gießerei SE", "Elbe Gießerei KG", "Hunsrück Gießerei e.K."):
        c[name] = Customer.objects.create(tenant=tenant, name=name)
    c["zahl"] = Customer.objects.create(tenant=tenant, pk=424242, name="Zahlenkunde AG")

    k = {}
    # Zuerst angelegt (kleinere ID), steht trotzdem hinter "Rahmenvertrag ..."
    k["ergaenzung"] = _contract(
        tenant, c["mueller"], "Ergänzungsvereinbarung Nr. 11 zum Rahmenvertrag vom 01.04.2021",
        po_number="T-PO-0001",
    )
    k["rahmen"] = _contract(
        tenant, c["hamburg"], "Rahmenvertrag über Lieferung und Betrieb", po_number="T-PO-0052",
    )
    k["wien"] = _contract(
        tenant, c["oebb"], "Wartungs- und Pflegevertrag Standort Wien", po_number="T-PO-0058",
    )
    for i in range(12):
        _contract(tenant, c["thurn"], "Supportvertrag", po_number=f"T-PO-1{i:03d}")

    r = {}
    r["0007"] = _invoice(tenant, c["hamburg"], "T-RE-2026-0007", "38700.00", "38700.00")
    r["0001"] = _invoice(tenant, c["thurn"], "T-RE-2026-0001", "100.00", "119.00")
    r["voided"] = _invoice(
        tenant, c["thurn"], "T-RE-2026-0099", "38700.00",
        status=InvoiceRecord.Status.VOIDED,
    )
    offer = _offer(tenant, c["thurn"], "T-AN-2026-0003", "1000.00", "1190.00")
    p = {
        "api": Product.objects.create(tenant=tenant, name="API-Zugang", sku="T-P-018"),
        "backup": Product.objects.create(
            tenant=tenant, name="Backup & Restore Service", sku="T-P-011"
        ),
    }
    incoming = IncomingInvoice.objects.create(
        tenant=tenant,
        supplier_name="Deutsche Telekom Geschäftskunden GmbH",
        invoice_number="ER-2026-00002",
        net_amount=Decimal("37047.00"),
        gross_amount=Decimal("44085.93"),
        original_filename="telekom.pdf",
        pdf_file="telekom.pdf",
    )
    counterparty = Counterparty.objects.create(
        tenant=tenant, name="Stadtwerke Lüdenscheid", iban="DE00 9999 9999 0000 0001 00"
    )
    return {
        "customers": c, "contracts": k, "invoices": r, "offer": offer, "products": p,
        "incoming": incoming, "counterparty": counterparty,
    }


def _search(tenant, query, **kwargs):
    return run_search(tenant, query, may_read=lambda resource: True, **kwargs)


def _group(groups, type_):
    return next((g for g in groups if g.type == type_), None)


def _titles(groups, type_):
    group = _group(groups, type_)
    return [h.title for h in group.items] if group else []


MUELLER = "Gebrüder Müller-Lüdenscheidt Präzisionsmaschinenbau GmbH & Co. KG"
THURN = "Fürstlich Thurn und Taxis'sche Forstverwaltung & Holzvermarktung KG"
HAMBURG = "Internationale Handelsgesellschaft für Industriearmaturen Hamburg-Altona GmbH"
OEBB = "Österreichische Bundesbahnen-Infrastruktur Wartungsdienste GesmbH"


# --- Testmatrix --------------------------------------------------------------

# (Anfrage, Gruppe, erwarteter erster Titel der Gruppe, unscharf?)
MATRIX_FIRST_HIT = [
    ("lüdenscheidt", "customer", MUELLER, False),
    ("präzision", "customer", MUELLER, False),
    ("LÜDENSCHEIDT", "customer", MUELLER, False),
    ("Lüdenscheid", "customer", MUELLER, False),
    ("gebrüder müller", "customer", MUELLER, False),
    ("Müller-Lüdenscheidt", "customer", MUELLER, False),
    ("Mueller", "customer", MUELLER, False),
    ("Muller", "customer", MUELLER, True),
    ("Muler", "customer", MUELLER, True),
    ("Gebrüdr", "customer", MUELLER, True),
    ("Müller Gebrüder", "customer", MUELLER, False),
    ("Müller Lüdenscheidt", "customer", MUELLER, False),
    ("Hamburg Altona", "customer", HAMBURG, False),
    ("Thurn und Taxis", "customer", THURN, False),
    ("thurn & taxis", "customer", THURN, False),
    ("Fürstlich Thurn Taxis", "customer", THURN, False),
    ("Österreich", "customer", OEBB, False),
    ("Oesterreichische", "customer", OEBB, False),
    ("T-K-0001", "customer", MUELLER, False),
    ("K-0001", "customer", MUELLER, False),
    ("T-RE-2026-0007", "invoice", "T-RE-2026-0007", False),
    ("RE-2026-0007", "invoice", "T-RE-2026-0007", False),
    ("0007", "invoice", "T-RE-2026-0007", False),
    ("re 0007", "invoice", "T-RE-2026-0007", False),
    ("T-PO-0052", "contract", "Rahmenvertrag über Lieferung und Betrieb", False),
    ("PO-0052", "contract", "Rahmenvertrag über Lieferung und Betrieb", False),
    ("T-AN-2026-0003", "offer", "T-AN-2026-0003", False),
    ("38700", "invoice", "T-RE-2026-0007", False),
    ("38.700", "invoice", "T-RE-2026-0007", False),
    ("38.700,00", "invoice", "T-RE-2026-0007", False),
    ("Rahmenvertrag", "contract", "Rahmenvertrag über Lieferung und Betrieb", False),
    ("Wien", "contract", "Wartungs- und Pflegevertrag Standort Wien", False),
    ("rechnung@gebrüdermüllerlüdenschei.example", "customer", MUELLER, False),
    ("DE781802744", "customer", MUELLER, False),
    ("Berlin", "customer", MUELLER, False),
    ("API-Zugang", "product", "API-Zugang", False),
    ("T-P-018", "product", "API-Zugang", False),
    ("Backup", "product", "Backup & Restore Service", False),
    ("Lüdenscheidt", "contract", "Ergänzungsvereinbarung Nr. 11 zum Rahmenvertrag vom 01.04.2021",
     False),
    ("Telekom", "incoming_invoice", "ER-2026-00002", False),
    ("ER-2026-00002", "incoming_invoice", "ER-2026-00002", False),
    ("44.085,93", "incoming_invoice", "ER-2026-00002", False),
    ("Stadtwerke Ludenscheid", "counterparty", "Stadtwerke Lüdenscheid", True),
    ("DE00999999990000000100", "counterparty", "Stadtwerke Lüdenscheid", False),
    ("1.190,00", "offer", "T-AN-2026-0003", False),
]


@pytest.mark.parametrize("query, type_, first, fuzzy", MATRIX_FIRST_HIT)
def test_matrix_first_hit(tenant, data, query, type_, first, fuzzy):
    groups = _search(tenant, query)
    group = _group(groups, type_)
    assert group is not None, f"keine Gruppe {type_} fuer {query!r}: {[g.type for g in groups]}"
    assert group.items[0].title == first
    assert group.items[0].fuzzy is fuzzy


@pytest.mark.parametrize("query", ["Gießerei", "Giesserei", "giesserei", "GIESSEREI"])
def test_matrix_giesserei_finds_all_three(tenant, data, query):
    assert sorted(_titles(_search(tenant, query), "customer")) == [
        "Alpen Gießerei SE", "Elbe Gießerei KG", "Hunsrück Gießerei e.K.",
    ]


def test_matrix_exact_number_is_first_group_and_first_hit(tenant, data):
    groups = _search(tenant, "T-RE-2026-0007")
    assert groups[0].type == "invoice"
    assert groups[0].items[0].title == "T-RE-2026-0007"


def test_matrix_full_customer_name_puts_customers_first(tenant, data):
    groups = _search(tenant, "lüdenscheidt")
    assert groups[0].type == "customer"
    # Vertraege dieses Kunden kommen ueber den Kundennamen dazu
    assert "contract" in [g.type for g in groups]


def test_matrix_city_does_not_outrank_name(tenant, data):
    titles = _titles(_search(tenant, "Lüdenscheid"), "customer")
    assert titles[:2] == [MUELLER, "Sauerland Logistik GmbH"]


def test_matrix_rahmenvertrag_title_start_before_mention(tenant, data):
    titles = _titles(_search(tenant, "Rahmenvertrag"), "contract")
    assert titles == [
        "Rahmenvertrag über Lieferung und Betrieb",
        "Ergänzungsvereinbarung Nr. 11 zum Rahmenvertrag vom 01.04.2021",
    ]


def test_matrix_supportvertrag_has_more_and_offset_loads_rest(tenant, data):
    first = _group(_search(tenant, "Supportvertrag", limit=10), "contract")
    assert len(first.items) == 10 and first.has_more
    rest = _group(_search(tenant, "Supportvertrag", limit=10, offset=10), "contract")
    assert len(rest.items) == 2 and not rest.has_more
    assert not {h.id for h in first.items} & {h.id for h in rest.items}


def test_matrix_voided_invoice_is_not_found(tenant, data):
    assert _titles(_search(tenant, "38700"), "invoice") == ["T-RE-2026-0007"]


@pytest.mark.parametrize("query", ["a", "2", " x ", "a b"])
def test_matrix_too_short_runs_no_sql(tenant, data, query):
    with CaptureQueriesContext(connection) as ctx:
        assert _search(tenant, query) == []
    assert len(ctx.captured_queries) == 0


def test_matrix_two_letters_work(tenant, data):
    assert _titles(_search(tenant, "Sa"), "customer") == ["Sauerland Logistik GmbH"]


def test_pure_number_hits_id_only_exactly(tenant, data):
    assert _titles(_search(tenant, "424242"), "customer") == ["Zahlenkunde AG"]
    assert _group(_search(tenant, "424242"), "customer").best_rank == 0
    # Mit fuehrender Null kein ID-Treffer
    assert _group(_search(tenant, "0424242"), "customer") is None


def test_fuzzy_only_without_direct_hits_in_that_group(tenant, data):
    groups = _search(tenant, "Gebrüdr")
    assert all(h.fuzzy for g in groups for h in g.items)
    # direkter Treffer in der Gruppe -> keine aehnlichen dazu
    customers = _group(_search(tenant, "Gießerei"), "customer")
    assert not any(h.fuzzy for h in customers.items)


def test_direct_hit_anywhere_suppresses_fuzzy_everywhere(tenant, data):
    # "Supportvertrag" trifft Vertraege direkt - das Produkt "Support-
    # Kontingent" darf nicht als aehnlicher Treffer dazukommen.
    Product.objects.create(tenant=tenant, name="Support-Kontingent 10 Stunden", sku="T-P-SUP")
    groups = _search(tenant, "Supportvertrag")
    assert _group(groups, "contract") is not None
    assert _group(groups, "product") is None
    assert not any(h.fuzzy for g in groups for h in g.items)


def test_groups_ordered_by_best_rank(tenant, data):
    # Angebotsnummer exakt (Rang 0) vor Kunden-Teiltreffern
    groups = _search(tenant, "T-AN-2026-0003")
    assert groups[0].type == "offer"
    # Unscharfe Gruppen stehen hinter direkten
    ranks = [g.best_rank for g in _search(tenant, "Lüdenscheid")]
    assert ranks == sorted(ranks)


def test_types_restrict_groups(tenant, data):
    groups = _search(tenant, "Lüdenscheid", types=["counterparty", "unbekannt"])
    assert [g.type for g in groups] == ["counterparty"]


def test_urls_and_ids(tenant, data):
    def first(query, type_):
        return _group(_search(tenant, query), type_).items[0]

    offer = first("T-AN-2026-0003", "offer")
    assert offer.url == f"/offers/{data['offer'].id}" and offer.id == str(data["offer"].id)
    incoming = first("ER-2026-00002", "incoming_invoice")
    assert incoming.url == f"/incoming-invoices?id={data['incoming'].id}"
    assert incoming.id == str(data["incoming"].id)
    cp = first("Stadtwerke", "counterparty")
    assert cp.url == f"/banking/counterparty/{data['counterparty'].id}"
    product = first("Backup", "product")
    assert product.url == "/products?search=Backup%20%26%20Restore%20Service"
    invoice = first("T-RE-2026-0007", "invoice")
    assert invoice.url == f"/invoices/{data['invoices']['0007'].id}"


def test_query_count_per_search(tenant, data):
    """Je Bereich eine Abfrage, mit unscharfem Fallback hoechstens zwei."""
    with CaptureQueriesContext(connection) as ctx:
        _search(tenant, "Lüdenscheid")
    assert len(ctx.captured_queries) <= len(AREA_TYPES) * 2
    with CaptureQueriesContext(connection) as ctx:
        _search(tenant, "T-RE-2026-0007")  # Nummer: kein unscharfer Fallback
    assert len(ctx.captured_queries) == len(AREA_TYPES)
    with CaptureQueriesContext(connection) as ctx:
        _search(tenant, "Supportvertrag", offset=10)
    # beim Nachladen ggf. zusaetzlich die Pruefung, ob es direkte Treffer gab
    assert len(ctx.captured_queries) <= len(AREA_TYPES) * 3


# --- GraphQL und Rechte ------------------------------------------------------

GQL = """
query($q: String!, $limit: Int, $types: [String!], $offset: Int) {
  globalSearch(query: $q, limit: $limit, types: $types, offset: $offset) {
    totalCount
    groups { type label hasMore items { id title subtitle url fuzzy } }
  }
}
"""


def _post(client, q, *, token=None, api_key=None, **variables):
    headers = {}
    if token is not None:
        headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    if api_key is not None:
        headers["HTTP_X_API_KEY"] = api_key
    response = client.post(
        "/graphql",
        data={"query": GQL, "variables": {"q": q, **variables}},
        content_type="application/json",
        **headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "errors" not in body, body
    return body["data"]["globalSearch"]


@pytest.fixture
def everywhere(tenant):
    """In jedem Bereich ein Eintrag mit dem Wort "Treffpunkt"."""
    customer = Customer.objects.create(tenant=tenant, name="Treffpunkt GmbH")
    _contract(tenant, customer, "Treffpunkt Wartung")
    _invoice(tenant, customer, "Treffpunkt-RE-1", "10.00")
    _offer(tenant, customer, "Treffpunkt-AN-1", "10.00", "11.90")
    Product.objects.create(tenant=tenant, name="Treffpunkt Produkt", sku="TP-1")
    IncomingInvoice.objects.create(
        tenant=tenant, supplier_name="Treffpunkt Lieferant", invoice_number="TP-ER-1",
        original_filename="tp.pdf", pdf_file="tp.pdf",
    )
    Counterparty.objects.create(tenant=tenant, name="Treffpunkt Bank")


def _user(tenant, permissions, email):
    role = Role.objects.create(tenant=tenant, name=f"Nur {email}", permissions=permissions)
    u = User.objects.create_user(email=email, password="x", tenant=tenant)
    u.roles.add(role)
    return u


def test_graphql_admin_sees_all_seven_groups(client, user, everywhere):
    result = _post(client, "Treffpunkt", token=create_access_token(user))
    assert {g["type"] for g in result["groups"]} == set(AREA_TYPES)
    assert result["totalCount"] == 7
    for group in result["groups"]:
        item = group["items"][0]
        assert isinstance(item["id"], str) and item["fuzzy"] is False


@pytest.mark.parametrize(
    "permission, group",
    [
        ("offers.read", "offer"),
        ("products.read", "product"),
        ("incoming_invoices.read", "incoming_invoice"),
        ("banking.read", "counterparty"),
        ("customers.read", "customer"),
        ("contracts.read", "contract"),
        ("invoices.read", "invoice"),
    ],
)
def test_graphql_each_group_needs_its_read_permission(client, tenant, everywhere, permission, group):
    u = _user(tenant, {permission: True}, email=f"{group}@example.com")
    result = _post(client, "Treffpunkt", token=create_access_token(u))
    assert [g["type"] for g in result["groups"]] == [group]


def test_graphql_write_without_read_finds_nothing(client, tenant, everywhere):
    u = _user(tenant, {"offers.write": True, "banking.write": True}, email="w@example.com")
    assert _post(client, "Treffpunkt", token=create_access_token(u))["groups"] == []


def test_graphql_api_key_scope_limits_new_groups(client, user, everywhere):
    raw, prefix, key_hash = APIKey.generate()
    APIKey.objects.create(
        tenant=user.tenant, user=user, name="Nur Banking", key_hash=key_hash, prefix=prefix,
        permissions={"banking.read": True, "products.read": True},
    )
    result = _post(client, "Treffpunkt", api_key=raw)
    assert {g["type"] for g in result["groups"]} == {"counterparty", "product"}


def test_graphql_other_tenant_sees_nothing(client, everywhere):
    other = Tenant.objects.create(name="Fremdfirma", currency="EUR")
    u = User.objects.create_user(email="fremd@example.com", password="x", tenant=other)
    u.roles.add(Role.objects.get(tenant=other, name="Admin"))
    assert _post(client, "Treffpunkt", token=create_access_token(u))["groups"] == []


def test_graphql_types_and_offset(client, user, tenant, data):
    token = create_access_token(user)
    page1 = _post(client, "Supportvertrag", token=token, types=["contract"], limit=10)
    assert [g["type"] for g in page1["groups"]] == ["contract"]
    assert page1["groups"][0]["hasMore"] is True
    page2 = _post(client, "Supportvertrag", token=token, types=["contract"], limit=10, offset=10)
    assert len(page2["groups"][0]["items"]) == 2
    assert page2["groups"][0]["hasMore"] is False


def test_graphql_defaults_still_work_without_new_arguments(client, user, data):
    # Alter Aufruf ohne types/offset (abwaertskompatibel)
    response = client.post(
        "/graphql",
        data={"query": '{ globalSearch(query: "Mueller") { groups { type items { id title } } } }'},
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {create_access_token(user)}",
    )
    groups = response.json()["data"]["globalSearch"]["groups"]
    assert groups[0]["type"] == "customer"
    assert groups[0]["items"][0]["title"] == MUELLER


def test_graphql_fuzzy_flag(client, user, data):
    result = _post(client, "Gebrüdr", token=create_access_token(user))
    customer = next(g for g in result["groups"] if g["type"] == "customer")
    assert customer["items"][0]["fuzzy"] is True


def test_graphql_query_count_bounded(client, user, data, django_assert_max_num_queries):
    token = create_access_token(user)
    # Anmeldung + Rollen + je Bereich hoechstens Treffer- und Fallback-Abfrage
    with django_assert_max_num_queries(len(AREA_TYPES) * 2 + 6):
        _post(client, "Muller", token=token)
