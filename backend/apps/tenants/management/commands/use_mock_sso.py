"""Richtet den Mandanten auf die lokale OIDC-Attrappe aus (nur Entwicklung)."""
from django.core.management.base import BaseCommand

from apps.tenants.models import Tenant

TENANT_ID = "11111111-1111-1111-1111-111111111111"
CLIENT_ID = "mock-client"


class Command(BaseCommand):
    help = "Schaltet SSO fuer den ersten Mandanten auf den Dienst mock-oidc um"

    def add_arguments(self, parser):
        parser.add_argument("--off", action="store_true", help="SSO wieder abschalten")
        parser.add_argument(
            "--browser-host",
            default="localhost:4003",
            help=(
                "Wie der Browser die Attrappe erreicht. Im eigenen Browser "
                "localhost:4003, aus einem Container heraus mock-oidc:8080."
            ),
        )
        parser.add_argument(
            "--app-url",
            default="",
            help="Feste Rueckkehradresse, z.B. http://localhost:3000 fuer die E2E-Tests",
        )

    def handle(self, *args, **options):
        tenant = Tenant.objects.first()
        if not tenant:
            self.stderr.write("Kein Mandant vorhanden - erst setup_test_data laufen lassen.")
            return

        settings = tenant.settings or {}
        if options["off"]:
            settings.pop("entra_sso", None)
            tenant.settings = settings
            tenant.save(update_fields=["settings"])
            self.stdout.write(self.style.SUCCESS(f"SSO fuer {tenant.name} abgeschaltet."))
            return

        browser_host = options["browser_host"]
        config = {
            "enabled": True,
            "tenant_id": TENANT_ID,
            "client_id": CLIENT_ID,
            "client_secret": "mock-secret",
            # Der Browser erreicht die Attrappe anders als das Backend: die
            # Autorisierung laeuft ueber den Browser, der Code-Tausch und der
            # Schluesselabruf ueber das Containernetz.
            "authorize_url": f"http://{browser_host}/vsx/authorize",
            "token_url": "http://mock-oidc:8080/vsx/token",
            "jwks_url": "http://mock-oidc:8080/vsx/jwks",
            "issuer": "http://mock-oidc:8080/vsx",
        }
        if options["app_url"]:
            config["redirect_uri"] = f"{options['app_url'].rstrip('/')}/auth/entra/callback"
        settings["entra_sso"] = config
        tenant.settings = settings
        tenant.save(update_fields=["settings"])

        self.stdout.write(self.style.SUCCESS(f"SSO fuer {tenant.name} auf mock-oidc gestellt."))
        self.stdout.write(f"  Autorisierung ueber: {config['authorize_url']}")
        if config.get("redirect_uri"):
            self.stdout.write(f"  Rueckkehr nach:      {config['redirect_uri']}")
        self.stdout.write("Attrappe starten: docker compose --profile sso up -d mock-oidc")
