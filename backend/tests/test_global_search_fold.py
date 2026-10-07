"""Globale Suche: Faltung, Zerlegung der Anfrage, Betraege.

`fold` (Python, faltet die Anfrage) und `cm_fold` (SQL, faltet die Daten)
muessen gleich arbeiten, sonst findet "Mueller" kein "Müller" mehr. Der
Abgleich gegen die Datenbank braucht Postgres (Migration core.0003):

    TEST_POSTGRES=1 pytest tests/test_global_search_fold.py
"""
from decimal import Decimal

import pytest
from django.db import connection

from apps.core.search import fold, parse_amount, parse_query, word_similarity

# Bereiche, fuer die fold und cm_fold Zeichen fuer Zeichen gleich sein muessen:
# Latein inkl. Erweiterungen, Griechisch, Kyrillisch, Satzzeichen, Waehrungs-
# und Buchstabensymbole, Ligaturen.
COMPARED_RANGES = [
    (0x20, 0x250), (0x1E00, 0x1F00), (0x370, 0x400), (0x400, 0x483), (0x48A, 0x500),
    (0x2000, 0x2070), (0x20A0, 0x20C0), (0x2100, 0x2190), (0xFB00, 0xFB07),
]

SAMPLES = [
    "Gebrüder Müller-Lüdenscheidt Präzisionsmaschinenbau GmbH & Co. KG",
    "Fürstlich Thurn und Taxis'sche Forstverwaltung & Holzvermarktung KG",
    "Gießerei GROSSE STRASSE ẞ",
    "Österreichische Bundesbahnen-Infrastruktur",
    "rechnung@gebrüdermüllerlüdenschei.example",
    "DEMO-RE-2026-0007",
    "  doppelte   Leerzeichen\tund\nUmbrüche  ",
    "Crème brûlée, Ærøskøbing, Łódź, Ørsted, Œuvre, İstanbul",
    "Müller (zerlegt, NFD)",
    "snake_case und 50% Rabatt",
    "½ Preis, ©2026, ™, №5",
    "Москва Αθήνα",
    "",
]


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Müller", "mueller"),
        ("MÜLLER", "mueller"),
        ("Gießerei", "giesserei"),
        ("Gebrüder Müller-Lüdenscheidt GmbH & Co. KG", "gebrueder mueller luedenscheidt gmbh co kg"),
        ("thurn & taxis", "thurn taxis"),
        ("Crème brûlée", "creme brulee"),
        ("Müller", "mueller"),  # zerlegtes ü (NFD) wie ü
        ("DEMO-RE-2026-0007", "demo re 2026 0007"),
        ("snake_case", "snake case"),
        ("  a  b  ", "a b"),
        ("", ""),
        (None, ""),
    ],
)
def test_fold(raw, expected):
    assert fold(raw) == expected


def test_fold_output_needs_no_like_escaping():
    # Woerter landen ohne Escaping in LIKE-Mustern
    folded = fold("100% sicher_und \\ fertig")
    assert "%" not in folded and "_" not in folded and "\\" not in folded


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("38700", Decimal("38700")),
        ("38.700", Decimal("38700")),
        ("38.700,50", Decimal("38700.50")),
        ("38,700.50", Decimal("38700.50")),
        ("38,700", Decimal("38700")),
        ("38700,5", Decimal("38700.5")),
        ("38700.50", Decimal("38700.50")),
        ("1.234.567,89 €", Decimal("1234567.89")),
        ("EUR 119,00", Decimal("119.00")),
        ("0,50", Decimal("0.50")),
        ("0007", None),  # fuehrende Null = Nummer, kein Betrag
        ("38.70.0", None),
        ("RE-0007", None),
        ("abc", None),
    ],
)
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == expected


def test_parse_query_tokens():
    parsed = parse_query("  Müller  a  Gebrüder x eins zwei drei vier fünf sechs ")
    # Woerter < 2 Zeichen fallen weg, hoechstens 6
    assert parsed.tokens == ["mueller", "gebrueder", "eins", "zwei", "drei", "vier"]
    assert parsed.folded == "mueller a gebrueder x eins zwei drei vier fuenf sechs"


@pytest.mark.parametrize(
    "raw, numeric_id",
    [("7", None), ("42", 42), ("0007", None), ("0", None), ("4 2", None), ("٤٢", None)],
)
def test_pure_number_hits_id_only_without_leading_zeros(raw, numeric_id):
    parsed = parse_query(raw)
    assert (parsed.numeric_id if parsed else None) == numeric_id


@pytest.mark.parametrize("raw", ["", " ", "a", "2", "a b", "- -"])
def test_too_short_query_is_nothing(raw):
    assert parse_query(raw) is None


def test_fuzzy_only_for_real_words():
    assert parse_query("Muller").fuzzy_allowed
    assert not parse_query("0007").fuzzy_allowed
    assert not parse_query("ab").fuzzy_allowed
    assert not parse_query("re 0007").fuzzy_allowed
    assert not parse_query("DE781802744").fuzzy_allowed


@pytest.mark.parametrize(
    "needle, haystack, expected",
    [
        # Werte von pg_trgm.word_similarity (Postgres 16, gemessen 07.10.2026)
        ("word", "two words", 0.8),
        ("muller", "gebrueder mueller luedenscheidt", 0.5),
        ("gebruedr", "gebrueder mueller", 0.778),
        ("rahmenvertrag", "rahmenvereinbarung beratung", 0.643),
        ("supportvertrag", "support kontingent 10 stunden", 0.467),
        ("xyz", "gebrueder mueller", 0.0),
    ],
)
def test_python_word_similarity_matches_pg_trgm(needle, haystack, expected):
    assert word_similarity(needle, haystack) == pytest.approx(expected, abs=0.001)


postgres_only = pytest.mark.skipif(
    connection.vendor != "postgresql", reason="cm_fold gibt es nur in Postgres"
)


@postgres_only
@pytest.mark.django_db
def test_cm_fold_matches_python_fold():
    chars = [chr(i) for start, end in COMPARED_RANGES for i in range(start, end)]
    samples = (
        SAMPLES
        + chars
        + [f"a{c}b" for c in chars]
        + [f"X{c}Y{c.upper()}Z" for c in chars]
    )
    with connection.cursor() as cursor:
        cursor.execute("SELECT x, cm_fold(x) FROM unnest(%s::text[]) AS x", [samples])
        rows = cursor.fetchall()
    diffs = [(x, db, fold(x)) for x, db in rows if db != fold(x)]
    assert diffs == [], diffs[:20]


@postgres_only
@pytest.mark.django_db
def test_cm_fold_is_immutable():
    with connection.cursor() as cursor:
        cursor.execute("SELECT provolatile FROM pg_proc WHERE proname = 'cm_fold'")
        assert cursor.fetchone()[0] == "i"


@postgres_only
@pytest.mark.django_db
def test_python_word_similarity_matches_postgres():
    pairs = [
        ("muller", "Gebrüder Müller-Lüdenscheidt Präzisionsmaschinenbau GmbH"),
        ("muler", "Gebrüder Müller-Lüdenscheidt"),
        ("gebruedr", "Gebrüder Müller"),
        ("oesterreichische", "Österreichische Bundesbahnen"),
        ("rahmenvertrag", "Rahmenvereinbarung Beratung"),
        ("supportvertrag", "Support-Kontingent 10 Stunden"),
    ]
    with connection.cursor() as cursor:
        for needle, haystack in pairs:
            cursor.execute("SELECT word_similarity(%s, cm_fold(%s))", [needle, haystack])
            assert word_similarity(needle, fold(haystack)) == pytest.approx(
                cursor.fetchone()[0], abs=0.001
            )
