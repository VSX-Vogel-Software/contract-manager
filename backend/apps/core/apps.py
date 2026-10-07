from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        from django.db.backends.signals import connection_created

        from apps.core.search import register_sqlite_functions

        # Globale Suche unter SQLite (Tests): cm_fold/word_similarity in Python
        connection_created.connect(register_sqlite_functions, dispatch_uid="core_search_sqlite")
