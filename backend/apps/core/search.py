"""Globale Suche: Faltung, Tokens, Felder je Bereich, Ranking.

Der GraphQL-Resolver `CoreQuery.global_search` prueft nur Anmeldung und
Argumente und ruft dann `run_search` auf. Alles Fachliche steht hier.

Kernidee (openspec/changes/global-search-improvements/design.md):

- Daten und Anfrage werden gleich gefaltet (`fold` in Python, `cm_fold` in
  SQL): klein, ä/ö/ü/ß ausgeschrieben, Akzente weg, Satzzeichen = Leerzeichen.
- Ein Treffer muss jedes Wort der Anfrage irgendwo in seinen Suchfeldern
  enthalten (Reihenfolge egal).
- Rang je Treffer: 0 Feld exakt gleich, 1 Feld beginnt mit der Anfrage,
  2 ein Wort beginnt mit dem ersten Suchwort, 3 Teilstring, 4 unscharf.
- Unscharf (word_similarity) nur als Fallback, wenn die Suche insgesamt keine
  direkten Treffer hat.
"""
from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.db.models import (
    BooleanField,
    Case,
    F,
    FloatField,
    Func,
    IntegerField,
    Q,
    QuerySet,
    TextField,
    Value,
    When,
)
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast, Coalesce, Replace

from apps.core.unaccent_map import UNACCENT_MAP

# --- Faltung ---------------------------------------------------------------

_UMLAUTS = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def _is_alnum(char: str) -> bool:
    """Nachbau von [[:alnum:]] in Postgres (glibc-Locale en_US.utf8).

    Abgeglichen fuer Latein, Griechisch, Kyrillisch, Satzzeichen, Waehrungs-
    und Buchstabensymbole (tests/test_global_search_fold.py). In exotischen
    Schriften kann glibc anders einteilen; dann findet eine Anfrage mit
    genau diesen Zeichen evtl. nichts - kein Fehler, nur kein Treffer.
    """
    if char.isalpha():
        return True
    category = unicodedata.category(char)
    if category in ("Nd", "Nl", "Mc"):
        return True
    # Kombinierende Akzente (U+0300-036F) zaehlt glibc nicht als alnum
    return category == "Mn" and not 0x0300 <= ord(char) <= 0x036F


def fold(value: str | None) -> str:
    """Faltet Text wie die SQL-Funktion cm_fold (Migration core.0003).

    Reihenfolge wie in SQL: NFC, lower, Umlaute/ß ausschreiben, unaccent,
    alles ausser Buchstaben/Ziffern zu einem Leerzeichen, Raender trimmen.
    """
    if not value:
        return ""
    text = unicodedata.normalize("NFC", value).lower().translate(_UMLAUTS)
    text = text.translate(UNACCENT_MAP)
    out = []
    pending_space = False
    for char in text:
        if _is_alnum(char):
            if pending_space and out:
                out.append(" ")
            pending_space = False
            out.append(char)
        else:
            pending_space = True
    return "".join(out)


# --- Anfrage zerlegen --------------------------------------------------------

MAX_TOKENS = 6
MIN_TOKEN_LENGTH = 2
# Unscharf nur mit Woertern ab 3 Zeichen ohne Ziffern - "ab", "0007" oder eine
# USt-ID wuerden per Trigramm fast alles treffen; Nummern sucht man exakt.
FUZZY_MIN_TOKEN_LENGTH = 3
# word_similarity(Suchwort, Felder) ab diesem Wert gilt als aehnlich
# (design.md, Entscheidung 3; nachgemessen gegen die Demo-Daten).
FUZZY_THRESHOLD = 0.45
AMOUNT_TOLERANCE = Decimal("0.01")

_AMOUNT_PATTERNS = (
    # (Muster, Tausendertrenner, Dezimaltrenner) - deutsche Lesart zuerst
    (re.compile(r"^\d{1,3}(\.\d{3})+(,\d{1,2})?$"), ".", ","),  # 38.700 / 38.700,50
    (re.compile(r"^\d{1,3}(,\d{3})+(\.\d{1,2})?$"), ",", "."),  # 38,700 / 38,700.50
    (re.compile(r"^\d+,\d{1,2}$"), "", ","),  # 38700,50
    (re.compile(r"^\d+\.\d{1,2}$"), "", "."),  # 38700.50
    (re.compile(r"^\d+$"), "", ""),  # 38700
)
_CURRENCY = re.compile(r"^(€|eur)|(€|eur)$", re.IGNORECASE)


def parse_amount(raw: str) -> Decimal | None:
    """Liest "38.700", "38700", "38.700,50", "38,700.50" (auch mit €) als Betrag.

    Deutsche Lesart hat Vorrang: "38.700" ist 38700, nicht 38,7. Mit fuehrender
    Null ("0007") ist es eine Nummer, kein Betrag.
    """
    text = _CURRENCY.sub("", raw.strip().replace(" ", ""))
    if not text or (len(text) > 1 and text[0] == "0" and text[1].isdigit()):
        return None
    for pattern, thousands, decimal_sep in _AMOUNT_PATTERNS:
        if pattern.match(text):
            if thousands:
                text = text.replace(thousands, "")
            if decimal_sep:
                text = text.replace(decimal_sep, ".")
            try:
                return Decimal(text)
            except InvalidOperation:
                return None
    return None


@dataclass
class ParsedQuery:
    folded: str
    tokens: list[str]
    numeric_id: int | None = None
    amount: Decimal | None = None

    @property
    def fuzzy_allowed(self) -> bool:
        return bool(self.tokens) and all(
            len(t) >= FUZZY_MIN_TOKEN_LENGTH and not any(c.isdigit() for c in t)
            for t in self.tokens
        )


def parse_query(raw: str) -> ParsedQuery | None:
    """Faltet die Anfrage und zerlegt sie in Woerter; None = nichts zu suchen."""
    raw = raw.strip()
    if len(raw) < MIN_TOKEN_LENGTH:
        return None
    folded = fold(raw)
    tokens = [t for t in folded.split(" ") if len(t) >= MIN_TOKEN_LENGTH][:MAX_TOKENS]
    numeric_id = None
    # Reine Zahl trifft IDs nur exakt und ohne fuehrende Nullen ("0007" nicht)
    if raw.isascii() and raw.isdigit() and not raw.startswith("0") and len(raw) <= 18:
        numeric_id = int(raw)
    amount = parse_amount(raw)
    if not tokens and amount is None:
        return None
    return ParsedQuery(folded=folded, tokens=tokens, numeric_id=numeric_id, amount=amount)


# --- SQL-Bausteine -----------------------------------------------------------


class Fold(Func):
    """cm_fold(text); unter SQLite die Python-Funktion `fold` (siehe unten)."""

    function = "cm_fold"
    output_field = TextField()


class JoinWithSpace(Func):
    """Felder mit Leerzeichen verbinden (Argumente sind schon NULL-frei)."""

    function = "concat_ws"
    template = "%(function)s(' ', %(expressions)s)"
    output_field = TextField()

    def as_sqlite(self, compiler, connection, **extra_context):
        # concat_ws gibt es in SQLite erst ab 3.44 - portabel per ||
        return self.as_sql(
            compiler, connection, template="(%(expressions)s)", arg_joiner=" || ' ' || ",
            **extra_context,
        )


class ContainsAll(Func):
    """Text enthaelt jedes der Woerter: `text LIKE ALL (ARRAY['%w1%', ...])`.

    Ein Ausdruck statt eines LIKE je Wort, damit Postgres den (teuren)
    gefalteten Suchtext je Zeile nur einmal berechnet. Die Woerter kommen aus
    fold() und enthalten nur Buchstaben, Ziffern und Leerzeichen - kein
    Escaping fuer % und _ noetig.
    """

    output_field = BooleanField()
    conditional = True

    def __init__(self, expression, words: list[str]):
        super().__init__(expression)
        self.words = list(words)

    def as_sql(self, compiler, connection, **extra_context):
        sql, params = compiler.compile(self.source_expressions[0])
        patterns = [f"%{w}%" for w in self.words]
        return f"({sql} LIKE ALL (%s::text[]))", (*params, patterns)

    def as_sqlite(self, compiler, connection, **extra_context):
        sql, params = compiler.compile(self.source_expressions[0])
        clauses = " AND ".join(f"{sql} LIKE %s" for _ in self.words)
        all_params = []
        for word in self.words:
            all_params += [*params, f"%{word}%"]
        return f"({clauses})", tuple(all_params)


class WordSimilarity(Func):
    function = "word_similarity"
    output_field = FloatField()


def _join(fields: list) -> JoinWithSpace:
    return JoinWithSpace(*[Coalesce(Cast(f, TextField()), Value("")) for f in fields])


class JsonListText(Func):
    """JSON-Liste von Texten (billing_emails) als durchsuchbarer Text.

    Postgres: jsonb::text liefert die Zeichen wie gespeichert. SQLite legt
    JSON mit Unicode-Escapes ab (\u00fc als Backslash-u00fc), daher dort die
    Elemente einzeln per json_each auslesen.
    """

    template = "(%(expressions)s)::text"
    output_field = TextField()

    def as_sqlite(self, compiler, connection, **extra_context):
        return self.as_sql(
            compiler,
            connection,
            template="(SELECT group_concat(value, ' ') FROM json_each(%(expressions)s))",
            **extra_context,
        )


def _no_spaces(name: str) -> Replace:
    """IBAN/USt-ID ohne Leerzeichen, damit "DE00 1234" auch "DE001234" trifft."""
    return Replace(F(name), Value(" "), Value(""))


# --- Bereiche ----------------------------------------------------------------


@dataclass
class Hit:
    id: str
    title: str
    subtitle: str | None
    url: str
    fuzzy: bool = False


@dataclass
class HitGroup:
    type: str
    label: str
    items: list[Hit]
    has_more: bool
    best_rank: int


@dataclass
class Area:
    """Ein durchsuchter Bereich (= eine Gruppe im Ergebnis).

    key_fields:   Name und Nummern - entscheiden ueber Rang 0 (gleich) und 1
                  (beginnt mit der Anfrage) und zaehlen fuer Rang 2.
    text_fields:  weitere eigene Felder (E-Mail) - zaehlen fuer Rang 2.
    extra_fields: fremde oder beilaeufige Felder (Kundenname am Vertrag, Ort)
                  - machen einen Treffer moeglich, aber hoechstens Rang 3.
    """

    type: str
    label: str
    resource: str
    base: Callable[[object], QuerySet]
    key_fields: list
    order: list
    to_hit: Callable[[object], Hit]
    text_fields: list = field(default_factory=list)
    extra_fields: list = field(default_factory=list)
    amount_fields: list[str] = field(default_factory=list)
    integer_pk: bool = True


def _contract_subtitle(contract) -> str:
    parts = [f"#{contract.id}"]
    if contract.customer:
        parts.append(contract.customer.name)
    if contract.netsuite_sales_order_number:
        parts.append(f"SO: {contract.netsuite_sales_order_number}")
    if contract.po_number:
        parts.append(f"PO: {contract.po_number}")
    return " • ".join(parts)


def _areas() -> list[Area]:
    from urllib.parse import quote

    from apps.banking.models import Counterparty, IncomingInvoice
    from apps.contracts.models import Contract
    from apps.customers.models import Customer
    from apps.invoices.models import InvoiceRecord
    from apps.offers.models import OfferRecord
    from apps.products.models import Product

    # Listenreihenfolge = Gruppenreihenfolge bei gleichem bestem Rang (design.md, 4)
    return [
        Area(
            type="customer",
            label="Customers",
            resource="customers",
            base=lambda tenant: Customer.objects.filter(tenant=tenant).annotate(
                _has_cus_id=Case(
                    When(netsuite_customer_number__gt="", then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            ),
            key_fields=[
                F("name"), F("netsuite_customer_number"), F("vat_id"), _no_spaces("vat_id"),
            ],
            text_fields=[JsonListText(F("billing_emails"))],
            # Ort als Zusatz: "Berlin" findet den Kunden, verdraengt aber keinen
            # Namenstreffer (Kunde in Luedenscheid vs. "Mueller-Luedenscheidt")
            extra_fields=[KeyTextTransform("city", "address")],
            order=["_has_cus_id", "name", "id"],
            to_hit=lambda c: Hit(
                id=str(c.id),
                title=c.name,
                subtitle=c.netsuite_customer_number or f"#{c.id}",
                url=f"/customers/{c.id}",
            ),
        ),
        Area(
            type="contract",
            label="Contracts",
            resource="contracts",
            base=lambda tenant: Contract.objects.filter(tenant=tenant).select_related("customer"),
            key_fields=[
                F("name"),
                F("netsuite_sales_order_number"),
                F("netsuite_contract_number"),
                F("po_number"),
                F("order_confirmation_number"),
                F("offer_number"),
            ],
            extra_fields=[F("customer__name")],
            order=["id"],
            to_hit=lambda c: Hit(
                id=str(c.id),
                title=c.name or f"#{c.id}",
                subtitle=_contract_subtitle(c),
                url=f"/contracts/{c.id}",
            ),
        ),
        Area(
            type="invoice",
            label="Invoices",
            resource="invoices",
            base=lambda tenant: InvoiceRecord.objects.filter(tenant=tenant).exclude(
                status=InvoiceRecord.Status.VOIDED
            ),
            key_fields=[F("invoice_number")],
            extra_fields=[F("customer_name")],
            amount_fields=["total_net", "total_gross"],
            order=["-billing_date", "-id"],
            to_hit=lambda r: Hit(
                id=str(r.id),
                title=r.invoice_number,
                subtitle=r.customer_name,
                url=f"/invoices/{r.id}",
            ),
        ),
        Area(
            type="offer",
            label="Offers",
            resource="offers",
            base=lambda tenant: OfferRecord.objects.filter(tenant=tenant),
            key_fields=[F("offer_number")],
            extra_fields=[F("customer_name")],
            amount_fields=["total_net", "total_gross"],
            order=["-offer_date", "-id"],
            to_hit=lambda o: Hit(
                id=str(o.id),
                title=o.offer_number,
                subtitle=o.customer_name,
                url=f"/offers/{o.id}",
            ),
        ),
        Area(
            type="incoming_invoice",
            label="Incoming invoices",
            resource="incoming_invoices",
            base=lambda tenant: IncomingInvoice.objects.filter(tenant=tenant),
            key_fields=[F("invoice_number"), F("supplier_name")],
            amount_fields=["net_amount", "gross_amount"],
            order=[F("invoice_date").desc(nulls_last=True), "-created_at"],
            integer_pk=False,
            to_hit=lambda i: Hit(
                id=str(i.id),
                title=i.invoice_number or i.original_filename,
                subtitle=i.supplier_name or None,
                url=f"/incoming-invoices?id={i.id}",
            ),
        ),
        Area(
            type="counterparty",
            label="Counterparties",
            resource="banking",
            base=lambda tenant: Counterparty.objects.filter(tenant=tenant),
            key_fields=[F("name"), F("iban"), _no_spaces("iban")],
            order=["name"],
            integer_pk=False,
            to_hit=lambda c: Hit(
                id=str(c.id),
                title=c.name,
                subtitle=c.iban or None,
                url=f"/banking/counterparty/{c.id}",
            ),
        ),
        Area(
            type="product",
            label="Products",
            resource="products",
            base=lambda tenant: Product.objects.filter(tenant=tenant),
            key_fields=[F("name"), F("sku")],
            order=["name", "id"],
            to_hit=lambda p: Hit(
                id=str(p.id),
                title=p.name,
                subtitle=p.sku or None,
                url=f"/products?search={quote(p.name)}",
            ),
        ),
    ]


AREA_TYPES = (
    "customer", "contract", "invoice", "offer", "incoming_invoice", "counterparty", "product",
)


# --- Abfrage je Bereich ------------------------------------------------------


def _haystack(area: Area) -> Fold:
    return Fold(_join(area.key_fields + area.text_fields + area.extra_fields))


def _amount_q(area: Area, amount: Decimal | None) -> Q | None:
    if amount is None or not area.amount_fields:
        return None
    low, high = amount - AMOUNT_TOLERANCE, amount + AMOUNT_TOLERANCE
    q = Q()
    for name in area.amount_fields:
        q |= Q(**{f"{name}__gte": low, f"{name}__lte": high})
    return q


def _direct(area: Area, qs: QuerySet, parsed: ParsedQuery) -> QuerySet:
    """Direkte Treffer mit Rang 0-3 (design.md, Entscheidungen 2, 4, 5)."""
    match = Q(pk__in=[])
    rank_cases = []
    if parsed.numeric_id is not None and area.integer_pk:
        match |= Q(pk=parsed.numeric_id)
        rank_cases.append(When(pk=parsed.numeric_id, then=Value(0)))
    amount_q = _amount_q(area, parsed.amount)
    if amount_q is not None:
        match |= amount_q
        rank_cases.append(When(amount_q, then=Value(0)))
    if parsed.tokens:
        qs = qs.alias(
            _hay=_haystack(area),
            _own=Fold(_join(area.key_fields + area.text_fields)),
        )
        match |= Q(ContainsAll(F("_hay"), parsed.tokens))
        exact, prefix = Q(), Q()
        for i, key in enumerate(area.key_fields):
            qs = qs.alias(**{f"_key{i}": Fold(key)})
            exact |= Q(**{f"_key{i}": parsed.folded})
            prefix |= Q(**{f"_key{i}__startswith": parsed.folded})
        first = parsed.tokens[0]
        rank_cases += [
            When(exact, then=Value(0)),
            When(prefix, then=Value(1)),
            When(Q(_own__startswith=first) | Q(_own__contains=f" {first}"), then=Value(2)),
        ]
    rank = Case(*rank_cases, default=Value(3), output_field=IntegerField())
    return qs.filter(match).annotate(_rank=rank).order_by("_rank", *area.order)


def _fuzzy(area: Area, qs: QuerySet, parsed: ParsedQuery) -> QuerySet:
    """Aehnliche Treffer (Rang 4): jedes Wort muss aehnlich vorkommen."""
    qs = qs.alias(_hay=_haystack(area))
    score = None
    for i, token in enumerate(parsed.tokens):
        qs = qs.alias(**{f"_sim{i}": WordSimilarity(Value(token), F("_hay"))})
        qs = qs.filter(**{f"_sim{i}__gte": FUZZY_THRESHOLD})
        score = F(f"_sim{i}") if score is None else score + F(f"_sim{i}")
    return qs.annotate(
        _score=score, _rank=Value(4, output_field=IntegerField())
    ).order_by("-_score", *area.order)


def search_area(
    area: Area, tenant, parsed: ParsedQuery, limit: int, offset: int, *, fuzzy: bool = False
) -> HitGroup | None:
    """Eine Gruppe, eine Abfrage - direkt oder (zweiter Durchgang) unscharf."""
    base = area.base(tenant)
    finder = _fuzzy if fuzzy else _direct
    rows = list(finder(area, base, parsed)[offset : offset + limit + 1])
    if not rows:
        return None
    has_more = len(rows) > limit
    rows = rows[:limit]
    hits = [area.to_hit(row) for row in rows]
    for hit in hits:
        hit.fuzzy = fuzzy
    return HitGroup(
        type=area.type, label=area.label, items=hits, has_more=has_more, best_rank=rows[0]._rank,
    )


def run_search(
    tenant,
    raw_query: str,
    *,
    may_read: Callable[[str], bool],
    limit: int = 10,
    offset: int = 0,
    types: list[str] | None = None,
) -> list[HitGroup]:
    """Alle erlaubten Bereiche durchsuchen; Gruppen nach bestem Rang.

    `may_read(resource)` prueft das Leserecht (Rolle + API-Key-Scope).
    """
    parsed = parse_query(raw_query)
    if parsed is None:
        return []
    wanted = set(types) if types is not None else None
    areas = [
        (position, area)
        for position, area in enumerate(_areas())
        if (wanted is None or area.type in wanted) and may_read(area.resource)
    ]

    def collect(fuzzy: bool):
        found = []
        for position, area in areas:
            group = search_area(area, tenant, parsed, limit, offset, fuzzy=fuzzy)
            if group is not None:
                found.append((group.best_rank, position, group))
        found.sort(key=lambda entry: entry[:2])
        return [entry[2] for entry in found]

    groups = collect(fuzzy=False)
    # Aehnliche Treffer nur, wenn die Suche insgesamt nichts direkt findet -
    # je Bereich einzeln brachte das Rauschen ("Supportvertrag" ->
    # Produkt "Support-Kontingent") und bis zu doppelt so viele Abfragen.
    # Beim Nachladen (offset > 0) heisst "leer" nur "Liste zu Ende".
    if groups or not parsed.fuzzy_allowed:
        return groups
    if offset > 0 and any(_direct(area, area.base(tenant), parsed).exists() for _, area in areas):
        return []
    return collect(fuzzy=True)


# --- SQLite (Testlauf) -------------------------------------------------------


def _trigrams(text: str) -> list[str]:
    """Trigramme wie pg_trgm: je Wort zwei Leerzeichen davor, eins danach."""
    result = []
    for word in re.findall(r"[^\W_]+", text.lower()):
        padded = f"  {word} "
        result.extend(padded[i : i + 3] for i in range(len(padded) - 2))
    return result


def word_similarity(needle: str | None, haystack: str | None) -> float:
    """Python-Naeherung von pg_trgm.word_similarity - nur fuer SQLite-Tests.

    Groesste Jaccard-Aehnlichkeit zwischen den Trigrammen von `needle` und
    einem zusammenhaengenden Abschnitt der Trigramme von `haystack`, so wie
    die pg_trgm-Doku es beschreibt. Produktiv rechnet Postgres selbst.
    """
    if not needle or not haystack:
        return 0.0
    wanted = set(_trigrams(needle))
    if not wanted:
        return 0.0
    ordered = _trigrams(haystack)
    best = 0.0
    for start, first in enumerate(ordered):
        if first not in wanted:
            continue
        extent: set[str] = set()
        for trigram in ordered[start:]:
            extent.add(trigram)
            if trigram in wanted:
                best = max(best, len(wanted & extent) / len(wanted | extent))
    return best


def register_sqlite_functions(sender, connection, **kwargs) -> None:
    """connection_created-Handler: cm_fold und word_similarity fuer SQLite.

    Die Tests laufen unter SQLite (config.settings.test); dort gibt es weder
    die Migration noch pg_trgm. Unter Postgres tut der Handler nichts.
    """
    if connection.vendor != "sqlite":
        return
    connection.connection.create_function(
        "cm_fold", 1, lambda v: None if v is None else fold(v), deterministic=True
    )
    connection.connection.create_function(
        "word_similarity", 2, word_similarity, deterministic=True
    )
