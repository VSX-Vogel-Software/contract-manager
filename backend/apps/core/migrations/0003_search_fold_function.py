"""Faltungsfunktion cm_fold(text) fuer die globale Suche.

Legt die Extensions `unaccent` und `pg_trgm` an (beide mit IF NOT EXISTS,
pg_trgm gibt es meist schon aus invoices.0005) und die IMMUTABLE-Funktion
`cm_fold`. Sie muss dieselben Ergebnisse liefern wie `apps.core.search.fold`
(Test: tests/test_global_search_fold.py).

`unaccent(text)` mit einem Argument ist nur STABLE, weil es das Woerterbuch
ueber den search_path sucht. Mit fest angegebenem Woerterbuch und
schema-qualifiziertem Aufruf ist die Funktion deterministisch und darf als
IMMUTABLE markiert werden - Voraussetzung fuer einen spaeteren Index auf
cm_fold(...).

`normalize` nur, wenn der Text nicht schon NFC ist - die Pruefung ist deutlich
billiger als normalize selbst (gemessen ~30 % weniger je Aufruf).

Unter SQLite (Testlauf) passiert nichts; dort registriert apps.core.search
die Python-Funktionen direkt an der Verbindung.

Rueckweg: die Funktion wird entfernt, die Extensions bleiben (harmlos, und
pg_trgm wird von anderen Apps benutzt).
"""
from django.db import migrations

FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION cm_fold(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $fn$
  SELECT btrim(regexp_replace(
    {schema}.unaccent(
      '{schema}.unaccent'::regdictionary,
      replace(replace(replace(replace(
        lower(CASE WHEN value IS NFC NORMALIZED THEN value ELSE normalize(value, NFC) END),
        'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')
    ),
    '[^[:alnum:]]+', ' ', 'g'
  ))
$fn$;
"""


def create_fold_function(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
        cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        # Schema der Extension ermitteln statt "public" anzunehmen
        cursor.execute(
            "SELECT quote_ident(n.nspname) FROM pg_extension e "
            "JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent'"
        )
        schema = cursor.fetchone()[0]
        cursor.execute(FUNCTION_SQL.format(schema=schema))


def drop_fold_function(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute("DROP FUNCTION IF EXISTS cm_fold(text)")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_remove_storagemigration"),
    ]

    operations = [
        migrations.RunPython(create_fold_function, drop_fold_function),
    ]
