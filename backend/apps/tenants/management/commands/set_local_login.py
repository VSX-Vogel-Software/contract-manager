"""Schaltet die Passwort-Anmeldung um - der Umstellungsschritt auf SSO.

Nach der Umstellung duerfen nur noch ausdrueckliche Notfallkonten den
Passwort-Weg gehen. Ein Notweg ohne Notfallkonten ist kein Notweg, deshalb
verlangt der Befehl beim Abschalten mindestens eines.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.tenants.models import Tenant, User


class Command(BaseCommand):
    help = "Setzt local_login_allowed fuer die Benutzer eines Mandanten"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", type=int, help="Mandanten-ID (Standard: der einzige)")
        parser.add_argument(
            "--disable",
            action="store_true",
            help="Passwort-Anmeldung abschalten, ausser fuer die Notfallkonten",
        )
        parser.add_argument(
            "--enable", action="store_true", help="Passwort-Anmeldung wieder fuer alle erlauben"
        )
        parser.add_argument(
            "--emergency",
            default="",
            help="Kommagetrennte Adressen, die den Passwort-Weg behalten",
        )
        parser.add_argument("--dry-run", action="store_true", help="Nur anzeigen, nichts aendern")

    def handle(self, *args, **options):
        if options["disable"] == options["enable"]:
            raise CommandError("Genau eines von --disable oder --enable angeben.")

        tenant = self._tenant(options["tenant"])
        users = User.objects.filter(tenant=tenant, is_active=True)

        if options["enable"]:
            self._apply(users, True, options["dry_run"])
            return

        emergency = {e.strip().lower() for e in options["emergency"].split(",") if e.strip()}
        if not emergency:
            raise CommandError(
                "Mindestens ein Notfallkonto angeben (--emergency). Ohne waere niemand "
                "mehr hereinzubekommen, wenn das Verzeichnis ausfaellt."
            )

        unknown = emergency - {u.email.lower() for u in users}
        if unknown:
            raise CommandError(f"Unbekannte oder inaktive Notfallkonten: {', '.join(sorted(unknown))}")

        not_linked = [u.email for u in users if not u.entra_object_id and u.email.lower() not in emergency]
        if not_linked:
            self.stdout.write(
                self.style.WARNING(
                    "Diese Konten sind noch nicht mit dem Verzeichnis verknuepft und "
                    "kaemen nach dem Abschalten nicht mehr herein:\n  "
                    + "\n  ".join(sorted(not_linked))
                )
            )

        self._apply(
            [u for u in users if u.email.lower() not in emergency], False, options["dry_run"]
        )
        self._apply([u for u in users if u.email.lower() in emergency], True, options["dry_run"])

    def _tenant(self, tenant_id):
        if tenant_id:
            tenant = Tenant.objects.filter(pk=tenant_id).first()
            if not tenant:
                raise CommandError(f"Mandant {tenant_id} nicht gefunden.")
            return tenant
        tenants = list(Tenant.objects.filter(is_active=True))
        if len(tenants) != 1:
            raise CommandError("Mehrere Mandanten vorhanden - bitte --tenant angeben.")
        return tenants[0]

    def _apply(self, users, allowed: bool, dry_run: bool):
        changed = [u for u in users if u.local_login_allowed != allowed]
        for u in changed:
            self.stdout.write(f"  {u.email}: local_login_allowed -> {allowed}")
        if dry_run:
            self.stdout.write(self.style.WARNING(f"Probelauf: {len(changed)} Konten unveraendert."))
            return
        for u in changed:
            u.local_login_allowed = allowed
            u.save(update_fields=["local_login_allowed"])
        self.stdout.write(self.style.SUCCESS(f"{len(changed)} Konten geaendert."))
