"""Query-Obergrenzen fuer Listen-Endpunkte (N+1-Schutz).

Jeder Test misst eine Liste mit wenigen Zeilen, legt weitere Daten an und
misst erneut: Die Zahl der SQL-Queries darf dabei nicht wachsen und bleibt
unter einer festen Obergrenze. Gemessen wird ueber den Test-Client gegen
/graphql, also inklusive Middleware und GraphQL-Kontext.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.banking.models import BankAccount, BankTransaction, Counterparty
from apps.contracts.models import Contract
from apps.core.auth import create_access_token
from apps.customers.models import Customer
from apps.invoices.models import InvoicePaymentMatch, InvoiceRecord, PaymentReminder
from apps.todos.models import TodoComment, TodoItem


def _gql(client, user, query, variables=None):
    """GraphQL-Anfrage absetzen, Antwortdaten und Query-Anzahl liefern."""
    token = create_access_token(user)
    with CaptureQueriesContext(connection) as ctx:
        response = client.post(
            "/graphql",
            data={"query": query, "variables": variables or {}},
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
    assert response.status_code == 200
    body = response.json()
    assert "errors" not in body, body.get("errors")
    return body["data"], len(ctx.captured_queries)


def _customer(tenant, name):
    return Customer.objects.create(tenant=tenant, name=name)


def _contract(tenant, customer, status=Contract.Status.ACTIVE, **kwargs):
    return Contract.objects.create(
        tenant=tenant,
        customer=customer,
        name=f"Vertrag {customer.name}",
        status=status,
        start_date=date(2026, 1, 1),
        billing_start_date=date(2026, 1, 1),
        **kwargs,
    )


# =============================================================================
# Rechnungsliste
# =============================================================================

INVOICE_RECORDS_QUERY = """
query InvoiceRecords($limit: Int) {
  invoiceRecords(offset: 0, limit: $limit) {
    items {
      id
      invoiceNumber
      customerName
      customerBillingEmails
      isPaid
      overdueDays
      paymentMatches {
        id
        transactionDate
        transactionAmount
        counterpartyName
        accountName
        matchedByName
      }
      paymentReminders { id stage createdAt }
    }
    totalCount
  }
}
"""


class TestInvoiceRecordsQueryCount:
    @pytest.fixture
    def account(self, tenant):
        return BankAccount.objects.create(
            tenant=tenant, name="Giro", bank_code="10000000", account_number="1"
        )

    def _make_invoices(self, tenant, user, account, start, count):
        """Rechnungen mit je einer Zahlung und zwei Mahnungen anlegen."""
        for i in range(start, start + count):
            customer = _customer(tenant, f"Kunde {i}")
            customer.billing_emails = [f"rechnung{i}@example.com"]
            customer.save()
            record = InvoiceRecord.objects.create(
                tenant=tenant,
                customer=customer,
                invoice_number=f"2026-{i:04d}",
                billing_date=date(2026, 1, 1) + timedelta(days=i),
                invoice_date=date(2026, 1, 1) + timedelta(days=i),
                period_start=date(2026, 1, 1),
                period_end=date(2026, 1, 31),
                total_net=Decimal("100.00"),
                tax_rate=Decimal("19.00"),
                tax_amount=Decimal("19.00"),
                total_gross=Decimal("119.00"),
                line_items_snapshot=[],
                company_data_snapshot={},
                customer_name=customer.name,
                contract_name="Vertrag",
                status=InvoiceRecord.Status.SENT,
            )
            counterparty = Counterparty.objects.create(tenant=tenant, name=f"Zahler {i}")
            txn = BankTransaction.objects.create(
                tenant=tenant,
                account=account,
                counterparty=counterparty,
                entry_date=date(2026, 2, 1),
                amount=Decimal("119.00"),
                booking_text=record.invoice_number,
                import_hash=f"hash-{i}",
            )
            InvoicePaymentMatch.objects.create(
                tenant=tenant,
                invoice_record=record,
                transaction=txn,
                match_type=InvoicePaymentMatch.MatchType.MANUAL,
                confidence=Decimal("1.00"),
                matched_by=user,
            )
            for stage in (1, 2):
                PaymentReminder.objects.create(
                    tenant=tenant,
                    invoice_record=record,
                    stage=stage,
                    title=f"{stage}. Mahnung",
                    subject=f"{stage}. Mahnung",
                    body_text="Bitte zahlen.",
                )

    def test_query_count_independent_of_invoice_count(self, client, tenant, user, account):
        self._make_invoices(tenant, user, account, 1, 2)
        data, small = _gql(client, user, INVOICE_RECORDS_QUERY, {"limit": 1000})
        assert data["invoiceRecords"]["totalCount"] == 2

        self._make_invoices(tenant, user, account, 3, 8)
        data, large = _gql(client, user, INVOICE_RECORDS_QUERY, {"limit": 1000})
        items = data["invoiceRecords"]["items"]
        assert len(items) == 10

        assert large == small
        assert large <= 12

        # Inhalte aus den vorgeladenen Relationen stimmen weiterhin
        first = items[0]
        assert first["customerBillingEmails"] == ["rechnung10@example.com"]
        assert first["isPaid"] is True
        assert first["paymentMatches"][0]["accountName"] == "Giro"
        assert first["paymentMatches"][0]["counterpartyName"] == "Zahler 10"
        assert first["paymentMatches"][0]["matchedByName"] == user.email
        # Mahnungen neueste zuerst (wie bisher order_by("-created_at"))
        assert [r["stage"] for r in first["paymentReminders"]] == [2, 1]


# =============================================================================
# Kundenliste
# =============================================================================

CUSTOMERS_QUERY = """
query Customers($pageSize: Int) {
  customers(page: 1, pageSize: $pageSize, sortBy: "name", sortOrder: "asc") {
    items { id name contractCount activeContractCount }
    totalCount
  }
}
"""

CUSTOMER_DETAIL_QUERY = """
query Customer($id: ID!) {
  customer(id: $id) { id contractCount activeContractCount }
}
"""


class TestCustomerListQueryCount:
    def _make_customers(self, tenant, start, count):
        for i in range(start, start + count):
            customer = _customer(tenant, f"Kunde {i:03d}")
            # aktiv, aktiv aber abgelaufen, entwurf, geloescht
            _contract(tenant, customer)
            _contract(tenant, customer, end_date=date(2020, 12, 31))
            _contract(tenant, customer, status=Contract.Status.DRAFT)
            _contract(tenant, customer, status=Contract.Status.DELETED)

    def test_query_count_independent_of_page_size(self, client, tenant, user):
        self._make_customers(tenant, 1, 2)
        data, small = _gql(client, user, CUSTOMERS_QUERY, {"pageSize": 50})
        assert len(data["customers"]["items"]) == 2

        self._make_customers(tenant, 3, 18)
        data, large = _gql(client, user, CUSTOMERS_QUERY, {"pageSize": 50})
        items = data["customers"]["items"]
        assert len(items) == 20

        assert large == small
        assert large <= 5

        for item in items:
            # geloeschte Vertraege zaehlen nicht, abgelaufene nicht als aktiv
            assert item["contractCount"] == 3
            assert item["activeContractCount"] == 1

    def test_customer_without_contracts_has_zero_counts(self, client, tenant, user):
        _customer(tenant, "Ohne Vertrag")
        data, _ = _gql(client, user, CUSTOMERS_QUERY, {"pageSize": 10})
        assert data["customers"]["items"][0]["contractCount"] == 0
        assert data["customers"]["items"][0]["activeContractCount"] == 0

    def test_detail_without_annotation_uses_fallback(self, client, tenant, user):
        self._make_customers(tenant, 1, 1)
        customer = Customer.objects.get(tenant=tenant)
        data, _ = _gql(client, user, CUSTOMER_DETAIL_QUERY, {"id": str(customer.id)})
        assert data["customer"]["contractCount"] == 3
        assert data["customer"]["activeContractCount"] == 1


# =============================================================================
# Todo-Board
# =============================================================================

TODO_BOARD_QUERY = """
query TodosByAssignee {
  todosByAssignee(includeCompleted: false) {
    assigneeId
    todos { id commentCount entityName }
  }
}
"""


class TestTodoBoardQueryCount:
    def _make_todos(self, tenant, user, customer, count):
        for i in range(count):
            todo = TodoItem.objects.create(
                tenant=tenant,
                text=f"Todo {i}",
                created_by=user,
                assigned_to=user,
                customer=customer,
            )
            for j in range(i % 3):
                TodoComment.objects.create(tenant=tenant, todo=todo, text=f"K{j}", author=user)

    def test_query_count_independent_of_todo_count(self, client, tenant, user):
        customer = _customer(tenant, "Kunde")
        self._make_todos(tenant, user, customer, 2)
        _, small = _gql(client, user, TODO_BOARD_QUERY)

        self._make_todos(tenant, user, customer, 10)
        data, large = _gql(client, user, TODO_BOARD_QUERY)
        todos = data["todosByAssignee"][0]["todos"]
        assert len(todos) == 12

        assert large == small
        assert large <= 4

        expected = {
            t.id: t.comments.count()
            for t in TodoItem.objects.filter(tenant=tenant)
        }
        assert {t["id"]: t["commentCount"] for t in todos} == expected

    def test_comment_count_without_annotation_falls_back(self, tenant, user):
        customer = _customer(tenant, "Kunde")
        self._make_todos(tenant, user, customer, 3)
        todo = TodoItem.objects.get(text="Todo 2")
        assert todo.comment_count == 2
        assert TodoItem.with_comment_count(TodoItem.objects.filter(pk=todo.pk)).get().comment_count == 2


# =============================================================================
# Banking-Buchungen
# =============================================================================

BANK_TRANSACTIONS_QUERY = """
query BankTransactions($pageSize: Int) {
  bankTransactions(page: 1, pageSize: $pageSize, sortBy: "date", sortOrder: "desc") {
    items { id amount counterparty { id name } }
    totalCount
  }
}
"""

BANK_TRANSACTIONS_WITH_COUNT_QUERY = """
query BankTransactions($pageSize: Int) {
  bankTransactions(page: 1, pageSize: $pageSize, sortBy: "date", sortOrder: "desc") {
    items { id counterparty { id transactionCount } }
  }
}
"""


class TestBankTransactionsQueryCount:
    @pytest.fixture
    def account(self, tenant):
        return BankAccount.objects.create(
            tenant=tenant, name="Giro", bank_code="10000000", account_number="1"
        )

    def _make_transactions(self, tenant, account, start, count):
        for i in range(start, start + count):
            counterparty = Counterparty.objects.create(tenant=tenant, name=f"Partner {i}")
            for j in range(2):
                BankTransaction.objects.create(
                    tenant=tenant,
                    account=account,
                    counterparty=counterparty,
                    entry_date=date(2026, 3, 1) + timedelta(days=i),
                    amount=Decimal("-10.00"),
                    booking_text=f"Buchung {i}/{j}",
                    import_hash=f"tx-{i}-{j}",
                )

    def test_query_count_independent_of_page_size(self, client, tenant, user, account):
        self._make_transactions(tenant, account, 1, 2)
        data, small = _gql(client, user, BANK_TRANSACTIONS_QUERY, {"pageSize": 50})
        assert len(data["bankTransactions"]["items"]) == 4

        self._make_transactions(tenant, account, 3, 15)
        data, large = _gql(client, user, BANK_TRANSACTIONS_QUERY, {"pageSize": 50})
        assert len(data["bankTransactions"]["items"]) == 34

        assert large == small
        assert large <= 6

    def test_transaction_count_still_resolvable(self, client, tenant, user, account):
        self._make_transactions(tenant, account, 1, 2)
        data, _ = _gql(client, user, BANK_TRANSACTIONS_WITH_COUNT_QUERY, {"pageSize": 50})
        counts = {i["counterparty"]["transactionCount"] for i in data["bankTransactions"]["items"]}
        assert counts == {2}


# =============================================================================
# Liquiditaet
# =============================================================================

LIQUIDITY_QUERY = """
query LiquidityAnalysis($year: Int!) {
  liquidityAnalysis(year: $year) { year months { month projectedIncome } }
}
"""


class TestLiquidityQueryCount:
    def _make_contracts(self, tenant, start, count):
        from apps.contracts.models import ContractItem

        for i in range(start, start + count):
            contract = _contract(tenant, _customer(tenant, f"Kunde {i}"))
            for _ in range(2):
                ContractItem.objects.create(
                    tenant=tenant,
                    contract=contract,
                    description="Service",
                    quantity=1,
                    unit_price=Decimal("100.00"),
                    price_period="monthly",
                )

    def test_query_count_independent_of_contract_count(self, client, tenant, user):
        year = date.today().year
        self._make_contracts(tenant, 1, 2)
        _, small = _gql(client, user, LIQUIDITY_QUERY, {"year": year})

        self._make_contracts(tenant, 3, 6)
        _, large = _gql(client, user, LIQUIDITY_QUERY, {"year": year})

        assert large == small
        assert large <= 12
