"""Management-Kommando fuer realistische Demo-Daten (Layout-Tests, v. a. mobil).

Setzt ``setup_test_data`` voraus (Mandant "Test Company", admin@test.local)
und ruft es bei Bedarf selbst auf. Die Daten sind bewusst unbequem: lange
Firmennamen, lange Vertragstitel, grosse Betraege, viele Positionen - damit
Ueberlaeufe im Layout sichtbar werden.

Idempotenz: Jeder Demo-Datensatz traegt eine Markierung in einem Feld, das im
Alltag keine Rolle spielt (z. B. ``netsuite_customer_number = "DEMO-K-0001"``,
``po_number = "DEMO-PO-0001"``, Rechnungsnummer ``DEMO-RE-…``). Angelegt wird
per ``get_or_create`` ueber diese Schluessel; ein zweiter Lauf legt nichts
doppelt an. ``--reset`` loescht vorher nur die markierten Demo-Daten.

Externe Dienste (HubSpot, Clockodo, Mail, Anthropic) werden nicht angefasst:
Es werden ausschliesslich Modelle direkt geschrieben, keine Services oder
Celery-Tasks aufgerufen. Die einzigen Signals auf diesen Modellen sind das
Audit-Log und die Invalidierung des Forecast-Caches - beide rein lokal.
PDFs (Eingangs-/Ausgangsrechnungen, Angebot, AB, Anhaenge, Abwesenheitsbericht)
sind ein Mini-PDF im konfigurierten Storage. Das Rechnungspostfach ist inaktiv
und ohne Zugangsdaten, der API-Schluessel hat keinen bekannten Klartext.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.permissions import ALL_PERMISSIONS, normalize_permissions
from apps.tenants.models import Role, Tenant, User

# Rechte, die das Frontend abfragt (hasPermission(...) und permission: '...'
# in frontend/src, Stand feature/mobile-support). Vergeben wird ALL_PERMISSIONS
# aus apps.core.permissions; diese Liste dient als Gegenprobe im Kommando und
# im Test, damit ein neues Frontend-Recht ausserhalb der Registry auffaellt.
FRONTEND_PERMISSIONS = (
    "assistant.use",
    "banking.read",
    "contracts.export",
    "department_analysis.read",
    "incoming_invoices.config",
    "incoming_invoices.read",
    "invoices.export",
    "invoices.generate",
    "invoices.read",
    "invoices.settings",
    "offers.read",
    "offers.write",
    "products.write",
    "reminders.send",
    "reminders.settings",
    "settings.read",
    "settings.write",
    "todos.delete",
    "users.read",
    "users.write",
)

SEED = 42

# Markierungen der Demo-Daten (Grundlage fuer Idempotenz und --reset)
CUSTOMER_MARK = "DEMO-K-"
PRODUCT_MARK = "DEMO-P-"
CONTRACT_MARK = "DEMO-PO-"
INVOICE_MARK = "DEMO-RE-"
STORNO_MARK = "DEMO-ST-"
OFFER_MARK = "DEMO-AN-"
AB_MARK = "DEMO-AB-"
COUNTERPARTY_BIC = "DEMODEMOXXX"
BANK_ACCOUNT_NUMBER = "DEMO0000001"
BANK_CODE = "99999999"
COST_CENTER_MARK = "DEMO-"
INCOMING_MAIL_DOMAIN = "@demo-seed.local"
DEMO_USER_DOMAIN = "@demo.test.local"
IMPORTED_MARK = "DEMO-IMP-"
IMPORT_BATCH_NAME = "DEMO-Import Ausgangsrechnungen (Altsystem).csv"
ORDER_CONFIRMATION_NUMBER = f"{AB_MARK}OC-0001"
ATTACHMENT_MARK = "DEMO-"
INBOX_NAME = "DEMO Rechnungseingang (ohne Zugangsdaten)"
INBOX_HOST = "imap.demo-seed.invalid"
API_KEY_PREFIX = "DEMOKEY1"
API_KEY_NAME = "DEMO MCP-Schlüssel für Revoke-Test"
ABSENCE_USER_MARK = "DEMO-U-"
# KPI-Snapshots tragen die Markierung in metrics["source"]
KPI_SNAPSHOT_MARK = "DEMO-SEED"
KPI_SNAPSHOT_MONTHS = 5

# Zusaetzliche Kommentare am Vorzeige-Vertrag (eigene Texte, damit
# get_or_create nicht mit den Kommentaren aus _seed_comments kollidiert).
SHOWCASE_COMMENT_TEXTS = [
    "[Demo] Kickoff mit dem Kunden hat stattgefunden, Protokoll liegt in den Anhängen.",
    "[Demo] Kunde wünscht quartalsweise Abrechnung ab dem nächsten Vertragsjahr – bitte vor der Verlängerung klären.",
    "[Demo] Auftragsbestätigung erstellt.",
    "[Demo] Ansprechpartner Technik: Herr Lüdenscheidt-Ost, erreichbar nur vormittags.",
    "[Demo] Leistungsbeschreibung Anlage 3 wurde vom Kunden gegengezeichnet zurückgeschickt.",
]

# Bewusst lange Namen zuerst, danach normale.
CUSTOMER_NAMES = [
    "Gebrüder Müller-Lüdenscheidt Präzisionsmaschinenbau GmbH & Co. KG",
    "Süddeutsche Versorgungs- und Entsorgungsgesellschaft für kommunale Infrastruktur mbH",
    "Schwarzwälder Feinwerktechnik und Mikrosystemintegration Aktiengesellschaft",
    "Internationale Handelsgesellschaft für Industriearmaturen, Pumpen und Ventiltechnik Hamburg-Altona GmbH",
    "Krankenhausträgergesellschaft des Landkreises Mecklenburgische Seenplatte gGmbH",
    "Österreichische Bundesbahnen-Infrastruktur Instandhaltungs- und Wartungsdienste GesmbH",
    "Zweckverband Wasserversorgung und Abwasserbeseitigung Oberes Donautal-Sigmaringen",
    "Hochleistungs-Rechenzentrum Rhein-Neckar Betriebs- und Verwaltungsgesellschaft mbH",
    "Fürstlich Thurn und Taxis'sche Forstverwaltung & Holzvermarktung KG",
    "Bayerische Landesanstalt für Landwirtschaft, Ernährung und Verbraucherschutz",
    "Ingenieurbüro Dr.-Ing. Hans-Joachim Schreiber-Wolkenstein Partnerschaftsgesellschaft mbB",
    "Verwaltungsgesellschaft der Vereinigten Stahlwerke Nordrhein-Westfalen Beteiligungs-GmbH",
]
CUSTOMER_PREFIXES = [
    "Alpen", "Nordsee", "Rhein", "Elbe", "Weser", "Harz", "Eifel", "Taunus",
    "Spessart", "Allgäu", "Bodensee", "Lausitz", "Vogtland", "Hunsrück",
]
CUSTOMER_CORES = [
    "Hydraulik", "Logistik", "Antriebstechnik", "Kunststofftechnik", "Medizintechnik",
    "Elektronik", "Anlagenbau", "Fördertechnik", "Pumpenwerke", "Messtechnik",
    "Gießerei", "Automation", "Verpackung", "Sensorik",
]
CUSTOMER_SUFFIXES = ["GmbH", "AG", "GmbH & Co. KG", "SE", "KG", "e.K.", "Ltd.", "S.r.l."]

ADDRESSES = [
    ("Industriestraße 12", "58507", "Lüdenscheid", "Deutschland"),
    ("Am Großen Wannsee 156-160, Gebäude C, 3. OG", "14109", "Berlin", "Deutschland"),
    ("Kaiser-Friedrich-Promenade 2a", "61348", "Bad Homburg vor der Höhe", "Deutschland"),
    ("Hauptstraße 1", "78048", "Villingen-Schwenningen", "Deutschland"),
    ("Mariahilfer Straße 123/4/17", "1060", "Wien", "Österreich"),
    ("Bahnhofstrasse 45", "8001", "Zürich", "Schweiz"),
    ("Unit 4, Riverside Business Park, Long Lane", "M1 2AB", "Manchester", "United Kingdom"),
    ("Via della Moscova 18", "20121", "Milano", "Italy"),
    ("Theodor-Heuss-Ring 78-80", "50668", "Köln", "Deutschland"),
    ("Gewerbegebiet Nord, Zufahrt über Tor 7", "06217", "Merseburg", "Deutschland"),
]

# (Name, Typ, Abrechnungsintervall, Erloesart, Listenpreis)
PRODUCTS = [
    ("Wartungsvertrag Premium inkl. 24/7-Rufbereitschaft und garantierter Reaktionszeit von vier Stunden", "subscription", "monthly", "recurring", "2450.00"),
    ("Softwarelizenz Enterprise Edition (Named User, unbegrenzte Mandanten, Hochverfügbarkeitscluster)", "subscription", "annual", "recurring", "48750.00"),
    ("Hosting Managed Private Cloud – Rechenzentrum Frankfurt, georedundant gespiegelt", "subscription", "monthly", "recurring", "3890.00"),
    ("Schulung Anwender (Tagessatz vor Ort)", "one_off", None, "training_implementation", "1850.00"),
    ("Implementierungspauschale Standardmandant", "one_off", None, "training_implementation", "12500.00"),
    ("Individualentwicklung Schnittstelle SAP S/4HANA ↔ Vertragsmanagement inkl. Mapping-Workshop", "one_off", None, "advanced_development", "86400.00"),
    ("Support-Kontingent 10 Stunden", "subscription", "quarterly", "recurring", "1150.00"),
    ("Datenmigration Altsystem", "one_off", None, "training_implementation", "24900.00"),
    ("Lizenz Mobile Sales Agent", "subscription", "monthly", "recurring", "39.90"),
    ("Lizenz Mobile Sales Agent – Offline-Synchronisation und Kartenmodul", "subscription", "monthly", "recurring", "14.50"),
    ("Backup & Restore Service", "subscription", "monthly", "recurring", "289.00"),
    ("Penetrationstest extern (jährlich)", "subscription", "annual", "recurring", "9800.00"),
    ("Projektmanagement (Tagessatz)", "one_off", None, "training_implementation", "1450.00"),
    ("Hardware-Gateway Industrie 4.0", "one_off", None, "advanced_development", "6750.00"),
    ("Speichererweiterung 1 TB", "subscription", "monthly", "recurring", "49.00"),
    ("Zusatzmodul Dokumentenmanagement mit revisionssicherer Archivierung gemäß GoBD", "subscription", "semi_annual", "recurring", "4200.00"),
    ("Rahmenvereinbarung Beratung", "subscription", "annual", "recurring", "120000.00"),
    ("API-Zugang", "subscription", "monthly", "recurring", "199.00"),
    ("Konfigurationsworkshop", "one_off", None, "training_implementation", "3200.00"),
    ("Sonderentwicklung Reporting-Dashboard mit Drill-down über Kostenstellen, Regionen und Produktlinien", "one_off", None, "advanced_development", "57300.00"),
    ("SSL-Zertifikat Wildcard", "subscription", "annual", "recurring", "349.00"),
    ("Remote-Monitoring", "subscription", "monthly", "recurring", "95.00"),
    ("Lizenz Analytics Add-on", "subscription", "quarterly", "recurring", "2975.00"),
    ("Reisekostenpauschale", "one_off", None, None, "480.00"),
    ("Hochverfügbarkeits-Upgrade", "subscription", "annual", "recurring", "18900.00"),
]
PRODUCT_CATEGORIES = [
    "Lizenzen & Abonnements",
    "Dienstleistungen, Schulungen und Implementierungsprojekte",
    "Hosting",
    "Hardware",
]

CONTRACT_TITLES = [
    "Rahmenvertrag über Lieferung, Implementierung, Betrieb und Weiterentwicklung der Vertragsmanagementplattform",
    "Wartungs- und Pflegevertrag Standort {city}",
    "Software-as-a-Service Vereinbarung inkl. Auftragsverarbeitungsvertrag nach Art. 28 DSGVO",
    "Lizenzvertrag Enterprise",
    "Hosting {city}",
    "Rollout Mobile Sales Agent Außendienst Region Süd-West, Phase 2 von 3",
    "Supportvertrag",
    "Migrationsprojekt Altsystem → Cloud",
    "Ergänzungsvereinbarung Nr. {n} zum Rahmenvertrag vom 01.04.2021",
    "Pilotprojekt",
]

STATUS_PLAN = (
    ["active"] * 30 + ["draft"] * 8 + ["paused"] * 5
    + ["cancelled"] * 7 + ["ended"] * 8 + ["deleted"] * 2
)
INVOICE_STATUS_PLAN = (
    ["finalized"] * 8 + ["sent"] * 8 + ["paid"] * 8 + ["dunning"] * 4 + ["voided"] * 2
)
OFFER_STATUS_PLAN = ["draft"] * 4 + ["sent"] * 3 + ["finalized"] * 2 + ["rejected"]

DEMO_USERS = [
    ("demo.mueller" + DEMO_USER_DOMAIN, "Maximiliane", "Müller-Lüdenscheidt"),
    ("demo.schmidt" + DEMO_USER_DOMAIN, "Jan", "Schmidt"),
    ("demo.oezdemir" + DEMO_USER_DOMAIN, "Ayşe", "Özdemir-Wolkenstein"),
]

TODO_TEXTS = [
    "Kündigungsfrist prüfen – Mindestlaufzeit endet bald, Kunde hat Verlängerung angedeutet, aber noch keine schriftliche Bestätigung geschickt",
    "Preiserhöhung ankündigen",
    "Rechnungsadresse aktualisieren",
    "Ansprechpartner hat gewechselt: neue Kontaktdaten aus der Signatur der letzten Mail übernehmen und im CRM nachziehen",
    "Auftragsbestätigung nachreichen",
    "Lieferung Hardware-Gateway terminieren",
    "Zahlungseingang klären",
    "Mahnung Stufe 2 vorbereiten, vorher mit Vertrieb abstimmen, ob ein Kulanzfall vorliegt",
    "Vertrag gegenzeichnen lassen",
    "Bestellnummer (PO) vom Einkauf anfordern",
    "Schulungstermin bestätigen",
    "Angebot nachfassen",
    "Lizenzanzahl mit tatsächlicher Nutzung abgleichen – laut Monitoring sind 37 von 250 Named-User-Lizenzen seit über 90 Tagen inaktiv",
    "AVV unterschreiben lassen",
    "SEPA-Mandat einholen",
    "Rabattvereinbarung dokumentieren",
    "Verlängerung anbieten",
    "Projektabnahme einholen",
    "Kostenstelle klären",
    "Rückfrage Steuerberater beantworten",
]

COMMENT_TEXTS = [
    "Kunde hat telefonisch bestätigt, dass die Verlängerung kommt. Schriftliche Bestätigung folgt laut Einkauf in KW 43.",
    "Achtung: abweichende Rechnungsanschrift für die Niederlassung Österreich, siehe Mail vom 12.09.",
    "Ok.",
    "Preisanpassung gemäß Indexklausel (VPI) wurde angekündigt, Widerspruchsfrist läuft bis Monatsende.",
    "Ansprechpartner im Einkauf: Frau Dr. Schreiber-Wolkenstein, Durchwahl -4711. Bitte nicht die Zentrale anrufen, die verbinden nicht weiter.",
    "Erledigt.",
    "Lieferung verschiebt sich um zwei Wochen, weil der Kunde die Zugänge für die Testumgebung noch nicht freigeschaltet hat.",
    "PO-Nummer muss auf jeder Rechnung stehen, sonst wird sie von der Kreditorenbuchhaltung ungeprüft zurückgeschickt.",
    "Rabatt von 12,5 % gilt nur für das erste Vertragsjahr.",
    "Bitte bis Freitag prüfen.",
]

COUNTERPARTIES = [
    "Bundesagentur für Arbeit – Familienkasse Nordrhein-Westfalen West",
    "Deutsche Telekom Geschäftskunden GmbH",
    "Finanzamt Frankfurt am Main V-Höchst",
    "Amazon Web Services EMEA SARL, Niederlassung Deutschland",
    "Techniker Krankenkasse",
    "Vermietungsgesellschaft Gewerbepark Rhein-Main Grundbesitz GmbH & Co. KG",
]

# Kleinstmoegliches gueltiges PDF fuer Eingangsrechnungen (eine leere Seite).
MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)

PERIOD_MONTHS = {"monthly": 1, "quarterly": 3, "semi_annual": 6, "annual": 12}


def money(value) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"))


class Command(BaseCommand):
    help = (
        "Legt realistische Demo-Daten fuer Layout-Tests an (lange Namen, grosse "
        "Betraege, viele Positionen). Setzt setup_test_data voraus und ist "
        "idempotent."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant-name",
            default="Test Company",
            help="Name des Mandanten (Standard: Test Company)",
        )
        parser.add_argument(
            "--admin-email",
            default="admin@test.local",
            help="Admin-Benutzer, der alle Rechte bekommt (Standard: admin@test.local)",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Vorhandene Demo-Daten vorher loeschen (nur markierte Demo-Daten)",
        )

    def handle(self, *args, **options):
        tenant_name = options["tenant_name"]
        admin_email = options["admin_email"]

        if not Tenant.objects.filter(name=tenant_name).exists() or not User.objects.filter(email=admin_email).exists():
            self.stdout.write("Basisdaten fehlen, rufe setup_test_data auf ...")
            call_command(
                "setup_test_data",
                tenant_name=tenant_name,
                admin_email=admin_email,
                stdout=self.stdout,
            )

        tenant = Tenant.objects.get(name=tenant_name)
        admin = User.objects.get(email=admin_email)
        if admin.tenant_id != tenant.id:
            raise CommandError(f"{admin_email} gehoert nicht zum Mandanten {tenant_name}.")

        self.rng = random.Random(SEED)
        self.today = date.today()
        self.tenant = tenant
        self.admin = admin
        self.counts = {}

        with transaction.atomic():
            if options["reset"]:
                self._reset()
            self._grant_all_permissions()
            self.users = self._seed_users()
            self.categories = self._seed_categories()
            self.products = self._seed_products()
            self.customers = self._seed_customers()
            self.contracts = self._seed_contracts()
            self.cost_centers = self._seed_cost_centers()
            self.bank_account, self.counterparties = self._seed_banking_base()
            self.invoices = self._seed_invoices()
            self.offers = self._seed_offers()
            self._seed_todos()
            self._seed_comments()
            self._seed_bank_transactions()
            self._seed_incoming_invoices()
            # Ab hier: Datensaetze fuer Detail-/Dialog-Routen der UI-Tests.
            # Bewusst ohne self.rng, damit die Zufallsfolge der Bestandsdaten
            # oben unveraendert bleibt.
            self.showcase_contract = self._showcase_contract()
            self.imported_invoices = self._seed_imported_invoices()
            self.pdf_offer = self._seed_pdf_offer()
            self.order_confirmation = self._seed_order_confirmation()
            self.contract_attachment, self.customer_attachment = self._seed_attachments()
            self._seed_showcase_comments()
            self.inbox = self._seed_invoice_inbox()
            self.api_key = self._seed_api_key()
            self.absence_report = self._seed_absence_report()
            self._seed_new_business_and_price_increases()
            self._seed_kpi_snapshots()

        self._print_summary()

    # ----------------------------------------------------------------
    # Hilfen
    # ----------------------------------------------------------------

    def _count(self, key, created):
        total, new = self.counts.get(key, (0, 0))
        self.counts[key] = (total + 1, new + (1 if created else 0))

    def _company_snapshot(self):
        from apps.invoices.models import CompanyLegalData

        legal = CompanyLegalData.objects.filter(tenant=self.tenant).first()
        if legal:
            return legal.to_snapshot()
        return {"company_name": self.tenant.name, "default_tax_rate": "19.00"}

    # ----------------------------------------------------------------
    # Rechte
    # ----------------------------------------------------------------

    def _grant_all_permissions(self):
        """Admin-Rolle auf alle Rechte der Registry erweitern und zuweisen."""
        missing = set(FRONTEND_PERMISSIONS) - ALL_PERMISSIONS
        if missing:
            raise CommandError(
                "Frontend-Rechte fehlen in PERMISSION_REGISTRY: " + ", ".join(sorted(missing))
            )

        role, _ = Role.objects.get_or_create(tenant=self.tenant, name="Admin")
        perms = normalize_permissions(role.permissions or {})
        perms.update({perm: True for perm in ALL_PERMISSIONS})
        if perms != role.permissions:
            role.permissions = perms
            role.save(update_fields=["permissions", "updated_at"])

        self.admin.roles.add(role)
        if self.admin.role_id != role.id:
            self.admin.role = role
            self.admin.save(update_fields=["role"])

    # ----------------------------------------------------------------
    # Benutzer (fuer die Spalten im Todo-Board)
    # ----------------------------------------------------------------

    def _seed_users(self):
        viewer = Role.objects.filter(tenant=self.tenant, name="Viewer").first()
        users = []
        for email, first, last in DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "tenant": self.tenant,
                    "first_name": first,
                    "last_name": last,
                    "is_active": True,
                    "local_login_allowed": False,
                },
            )
            if created:
                user.set_unusable_password()
                user.save(update_fields=["password"])
                if viewer:
                    user.roles.add(viewer)
            self._count("Benutzer", created)
            users.append(user)
        return users

    # ----------------------------------------------------------------
    # Produkte
    # ----------------------------------------------------------------

    def _seed_categories(self):
        from apps.products.models import ProductCategory

        cats = []
        for name in PRODUCT_CATEGORIES:
            cat, created = ProductCategory.objects.get_or_create(tenant=self.tenant, name=name)
            self._count("Produktkategorien", created)
            cats.append(cat)
        return cats

    def _seed_products(self):
        from apps.products.models import Product, ProductPrice

        products = []
        for i, (name, ptype, freq, revenue, price) in enumerate(PRODUCTS, start=1):
            if ptype == "one_off":
                category = self.categories[1] if revenue != "advanced_development" else self.categories[3]
            else:
                category = self.categories[2] if "Hosting" in name else self.categories[0]
            product, created = Product.objects.get_or_create(
                tenant=self.tenant,
                sku=f"{PRODUCT_MARK}{i:03d}",
                defaults={
                    "name": name,
                    "description": f"Demo-Produkt {i}: {name}",
                    "category": category,
                    "type": ptype,
                    "billing_frequency": freq,
                    "revenue_type": revenue,
                    "is_active": i != 24,
                },
            )
            if created:
                ProductPrice.objects.create(
                    tenant=self.tenant,
                    product=product,
                    price=Decimal(price),
                    valid_from=date(self.today.year - 2, 1, 1),
                )
            self._count("Produkte", created)
            products.append(product)
        return products

    # ----------------------------------------------------------------
    # Kunden
    # ----------------------------------------------------------------

    def _customer_names(self):
        names = list(CUSTOMER_NAMES)
        seen = set(names)
        while len(names) < 40:
            name = (
                f"{self.rng.choice(CUSTOMER_PREFIXES)} {self.rng.choice(CUSTOMER_CORES)} "
                f"{self.rng.choice(CUSTOMER_SUFFIXES)}"
            )
            if name not in seen:
                seen.add(name)
                names.append(name)
        return names

    def _seed_customers(self):
        from apps.customers.models import Customer

        customers = []
        for i, name in enumerate(self._customer_names(), start=1):
            street, zip_code, city, country = ADDRESSES[self.rng.randrange(len(ADDRESSES))]
            email_count = self.rng.choice([0, 1, 1, 2, 4])
            slug = "".join(ch for ch in name.lower() if ch.isalnum())[:24] or f"kunde{i}"
            emails = [
                f"{prefix}@{slug}.example"
                for prefix in ["rechnung", "buchhaltung.kreditoren", "einkauf", "zentrale"][:email_count]
            ]
            vat = f"DE{self.rng.randrange(100000000, 999999999)}" if country == "Deutschland" else ""
            term = self.rng.choice([None, None, 14, 30, 45, 90])
            language = "en" if country in ("United Kingdom", "Italy") else self.rng.choice(["", "de"])
            customer, created = Customer.objects.get_or_create(
                tenant=self.tenant,
                netsuite_customer_number=f"{CUSTOMER_MARK}{i:04d}",
                defaults={
                    "name": name,
                    "address": {"street": street, "zip": zip_code, "city": city, "country": country},
                    "is_active": i % 13 != 0,
                    "billing_emails": emails,
                    "invoice_language": language,
                    "vat_id": vat,
                    "payment_term_days": term,
                },
            )
            self._count("Kunden", created)
            customers.append(customer)
        return customers

    # ----------------------------------------------------------------
    # Vertraege, Positionen, Amendments
    # ----------------------------------------------------------------

    def _seed_contracts(self):
        from apps.contracts.models import Contract, ContractAmendment, ContractItem

        contracts = []
        statuses = list(STATUS_PLAN)
        self.rng.shuffle(statuses)
        # Die ersten Kunden (lange Namen) bekommen garantiert Vertraege.
        customer_cycle = self.customers[:12] + [self.rng.choice(self.customers) for _ in range(48)]
        project_count = 0

        for i in range(1, 61):
            customer = customer_cycle[i - 1]
            status = statuses[i - 1]
            title = self.rng.choice(CONTRACT_TITLES).format(
                city=(customer.address or {}).get("city", ""), n=self.rng.randint(2, 17)
            )
            start = self.today - timedelta(days=self.rng.randint(30, 1400))
            interval = self.rng.choice(["monthly", "monthly", "quarterly", "annual", "semi_annual"])
            min_months = self.rng.choice([None, 12, 24, 36])
            notice = self.rng.choice([1, 3, 3, 6])
            item_count = self.rng.randint(1, 8)
            item_plan = []
            for pos in range(item_count):
                product = self.rng.choice(self.products)
                item_plan.append({
                    "product": product,
                    "qty": self.rng.choice([1, 1, 2, 5, 10, 25, 250, 1200]),
                    "factor": Decimal(self.rng.choice(["1", "1", "0.9", "0.875", "1.15"])),
                    "long_desc": self.rng.random() < 0.3,
                })
            amendment_roll = self.rng.random()

            defaults = {
                "name": title,
                "customer": customer,
                "status": status,
                "start_date": start,
                "billing_start_date": start,
                "billing_interval": interval,
                "billing_anchor_day": 1,
                "min_duration_months": min_months,
                "notice_period_months": notice,
                "notes": "Interne Notiz: Sonderkonditionen beachten." if i % 4 == 0 else "",
                "invoice_text": (
                    "Bitte geben Sie bei Zahlung unbedingt die Rechnungsnummer sowie Ihre "
                    "Bestellnummer an, da wir die Zahlung sonst nicht zuordnen können."
                ) if i % 5 == 0 else "",
                "offer_number": f"{OFFER_MARK}V{i:04d}" if i % 6 == 0 else None,
            }
            if status == "ended":
                defaults["end_date"] = self.today - timedelta(days=self.rng.randint(10, 300))
            elif status == "cancelled":
                defaults["cancelled_at"] = timezone.now() - timedelta(days=20)
                defaults["cancellation_effective_date"] = self.today + timedelta(days=60)
            contract, created = Contract.objects.get_or_create(
                tenant=self.tenant,
                po_number=f"{CONTRACT_MARK}{i:04d}",
                defaults=defaults,
            )
            self._count("Vertraege", created)
            contracts.append(contract)

            items = []
            for pos, plan in enumerate(item_plan, start=1):
                product = plan["product"]
                price = product.prices.first().price if product.prices.exists() else Decimal("100")
                is_one_off = product.type == "one_off"
                description = ""
                if plan["long_desc"]:
                    description = (
                        "Gemäß Leistungsbeschreibung Anlage 3, Abschnitt 4.2.1 bis 4.2.7, "
                        "einschließlich aller im Lastenheft vom 14.03. genannten Erweiterungen."
                    )
                item_defaults = {
                    "product": product,
                    "description": description,
                    "quantity": plan["qty"] if not is_one_off else min(plan["qty"], 25),
                    "unit_price": money(price * plan["factor"]),
                    "price_period": product.billing_frequency or "monthly",
                    "price_source": "list" if plan["factor"] == 1 else "custom",
                    "start_date": start,
                    "is_one_off": is_one_off,
                }
                # Fuenf Einmalpositionen werden zu "Projekten" (Lieferverfolgung).
                if is_one_off and project_count < 5 and status == "active":
                    project_count += 1
                    item_defaults.update({
                        "delivery_status": "delivered" if project_count == 5 else "pending",
                        "delivered_at": self.today - timedelta(days=5) if project_count == 5 else None,
                        "estimated_delivery_date": self.today + timedelta(days=30 * project_count),
                        "order_confirmation_number": f"{AB_MARK}{project_count:04d}",
                    })
                item, item_created = ContractItem.objects.get_or_create(
                    tenant=self.tenant,
                    contract=contract,
                    sort_order=pos,
                    defaults=item_defaults,
                )
                self._count("Vertragspositionen", item_created)
                if item.delivery_status:
                    self._count("Projekte", item_created)
                items.append(item)

            # Rund ein Viertel der Vertraege bekommt Amendments.
            if amendment_roll < 0.25 and status != "draft":
                self._seed_amendments(contract, items, len(item_plan) + 1)

        return contracts

    def _seed_amendments(self, contract, items, next_sort):
        from apps.contracts.models import ContractAmendment, ContractItem

        first = items[0]
        eff = contract.start_date + relativedelta(months=6)
        amendment, created = ContractAmendment.objects.get_or_create(
            tenant=self.tenant,
            contract=contract,
            type=ContractAmendment.AmendmentType.PRICE_CHANGED,
            defaults={
                "effective_date": eff,
                "description": f"Preisanpassung gemäß Indexklausel für {first}",
                "changes": {
                    "item_id": str(first.id),
                    "product_name": first.product.name if first.product else None,
                    "description": first.description,
                    "old_values": {"unit_price": str(money(first.unit_price / Decimal("1.035")))},
                    "new_values": {"unit_price": str(first.unit_price)},
                },
                "arr_delta": money(first.unit_price * first.quantity * Decimal("0.035") * 12),
            },
        )
        self._count("Amendments", created)

        added_product = self.products[8]  # Lizenz Mobile Sales Agent
        amendment, created = ContractAmendment.objects.get_or_create(
            tenant=self.tenant,
            contract=contract,
            type=ContractAmendment.AmendmentType.PRODUCT_ADDED,
            defaults={
                "effective_date": eff + relativedelta(months=3),
                "description": f"Added {added_product.name} x120",
                "changes": {
                    "product_id": str(added_product.id),
                    "product_name": added_product.name,
                    "description": "",
                    "quantity": 120,
                    "unit_price": "39.90",
                    "price_period": "monthly",
                },
                "arr_delta": money(Decimal("39.90") * 120 * 12),
            },
        )
        self._count("Amendments", created)
        _, item_created = ContractItem.objects.get_or_create(
            tenant=self.tenant,
            contract=contract,
            sort_order=next_sort,
            defaults={
                "product": added_product,
                "quantity": 120,
                "unit_price": Decimal("39.90"),
                "price_period": "monthly",
                "price_source": "list",
                "start_date": eff + relativedelta(months=3),
                "added_by_amendment": amendment,
            },
        )
        self._count("Vertragspositionen", item_created)

    # ----------------------------------------------------------------
    # Rechnungen
    # ----------------------------------------------------------------

    def _line_items(self, contract, months):
        lines = []
        total = Decimal("0.00")
        for item in contract.items.all():
            if item.is_one_off:
                amount = money(item.unit_price * item.quantity)
            else:
                period = PERIOD_MONTHS.get(item.price_period, 1)
                amount = money(item.unit_price * item.quantity * Decimal(months) / Decimal(period))
            total += amount
            lines.append({
                "item_id": item.id,
                "product_name": item.product.name if item.product else "",
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "amount": str(amount),
                "is_prorated": False,
                "prorate_factor": None,
                "is_one_off": item.is_one_off,
            })
        return lines, money(total)

    def _seed_invoices(self):
        from apps.invoices.models import InvoiceRecord

        snapshot = self._company_snapshot()
        billable = [c for c in self.contracts if c.status in ("active", "cancelled", "ended", "paused")]
        statuses = list(INVOICE_STATUS_PLAN)
        self.rng.shuffle(statuses)
        invoices = []
        year = self.today.year

        for i in range(1, 31):
            contract = billable[(i * 7) % len(billable)]
            status = statuses[i - 1]
            months = {"monthly": 1, "quarterly": 3, "semi_annual": 6, "annual": 12}.get(contract.billing_interval, 1)
            age_days = self.rng.randint(3, 200)
            invoice_date = self.today - timedelta(days=age_days)
            if status == "dunning":
                invoice_date = self.today - timedelta(days=self.rng.randint(60, 120))
            period_start = invoice_date.replace(day=1)
            period_end = period_start + relativedelta(months=months) - timedelta(days=1)
            lines, total_net = self._line_items(contract, months)
            customer = contract.customer
            domestic = (customer.address or {}).get("country", "Deutschland") == "Deutschland"
            tax_rate = Decimal("19.00") if domestic else Decimal("0.00")
            tax_amount = money(total_net * tax_rate / 100)

            invoice, created = InvoiceRecord.objects.get_or_create(
                tenant=self.tenant,
                invoice_number=f"{INVOICE_MARK}{year}-{i:04d}",
                defaults={
                    "contract": contract,
                    "customer": customer,
                    "billing_date": invoice_date,
                    "invoice_date": invoice_date,
                    "due_date": invoice_date + timedelta(days=customer.payment_term_days or 30),
                    "period_start": period_start,
                    "period_end": period_end,
                    "total_net": total_net,
                    "tax_rate": tax_rate,
                    "tax_amount": tax_amount,
                    "total_gross": total_net + tax_amount,
                    "line_items_snapshot": lines,
                    "company_data_snapshot": snapshot,
                    "status": status,
                    "customer_name": customer.name,
                    "contract_name": contract.name,
                    "invoice_text": contract.invoice_text,
                    "void_reason": "Falscher Leistungszeitraum, wird neu gestellt." if status == "voided" else "",
                    "email_sent_at": timezone.now() - timedelta(days=age_days) if status in ("sent", "paid", "dunning") else None,
                    "email_sent_to": customer.billing_emails if status in ("sent", "paid", "dunning") else [],
                },
            )
            self._count("Rechnungen", created)
            invoices.append(invoice)

            # Stornierte Rechnungen bekommen ihre Gutschrift wie im echten Ablauf.
            if status == "voided":
                storno, s_created = InvoiceRecord.objects.get_or_create(
                    tenant=self.tenant,
                    invoice_number=f"{STORNO_MARK}{year}-{i:04d}",
                    defaults={
                        "document_type": InvoiceRecord.DocumentType.STORNO,
                        "storno_of": invoice,
                        "contract": contract,
                        "customer": customer,
                        "billing_date": invoice_date,
                        "invoice_date": invoice_date + timedelta(days=2),
                        "period_start": period_start,
                        "period_end": period_end,
                        "total_net": -invoice.total_net,
                        "tax_rate": tax_rate,
                        "tax_amount": -invoice.tax_amount,
                        "total_gross": -invoice.total_gross,
                        "line_items_snapshot": lines,
                        "company_data_snapshot": snapshot,
                        "status": InvoiceRecord.Status.VOIDED,
                        "customer_name": customer.name,
                        "contract_name": contract.name,
                    },
                )
                self._count("Gutschriften (Storno)", s_created)
        return invoices

    # ----------------------------------------------------------------
    # Angebote
    # ----------------------------------------------------------------

    def _seed_offers(self):
        from apps.offers.models import OfferRecord

        snapshot = self._company_snapshot()
        candidates = [c for c in self.contracts if c.status == "draft"] + [
            c for c in self.contracts if c.status == "active"
        ]
        statuses = list(OFFER_STATUS_PLAN)
        offers = []
        year = self.today.year
        for i in range(1, 11):
            contract = candidates[i - 1]
            status = statuses[i - 1]
            customer = contract.customer
            offer_date = self.today - timedelta(days=self.rng.randint(1, 90))
            lines, total_net = self._line_items(contract, 12)
            domestic = (customer.address or {}).get("country", "Deutschland") == "Deutschland"
            tax_rate = Decimal("19.00") if domestic else Decimal("0.00")
            tax_amount = money(total_net * tax_rate / 100)
            offer, created = OfferRecord.objects.get_or_create(
                tenant=self.tenant,
                offer_number=f"{OFFER_MARK}{year}-{i:04d}",
                defaults={
                    "contract": contract,
                    "customer": customer,
                    "offer_date": offer_date,
                    "valid_until": offer_date + timedelta(days=30),
                    "billing_date": offer_date,
                    "period_start": offer_date,
                    "period_end": offer_date + relativedelta(years=1) - timedelta(days=1),
                    "total_net": total_net,
                    "tax_rate": tax_rate,
                    "tax_amount": tax_amount,
                    "total_gross": total_net + tax_amount,
                    "line_items_snapshot": lines,
                    "company_data_snapshot": snapshot,
                    "status": status,
                    "customer_name": customer.name,
                    "contract_name": contract.name,
                    "free_text_after_items": (
                        "Alle Preise verstehen sich zuzüglich der gesetzlichen Umsatzsteuer. "
                        "Reisekosten werden nach Aufwand abgerechnet."
                    ) if i % 2 else "",
                    "minimum_term_months": contract.min_duration_months,
                    "notice_period_months": contract.notice_period_months,
                    "email_sent_at": timezone.now() - timedelta(days=3) if status == "sent" else None,
                    "email_sent_to": customer.billing_emails if status == "sent" else [],
                },
            )
            self._count("Angebote", created)
            offers.append(offer)
        return offers

    # ----------------------------------------------------------------
    # Todos und Kommentare
    # ----------------------------------------------------------------

    def _seed_todos(self):
        from apps.todos.models import TodoComment, TodoItem

        assignees = [self.admin, *self.users, None]
        for i, text in enumerate(TODO_TEXTS):
            assignee = assignees[i % len(assignees)]
            target = i % 3
            link = {}
            if target == 0:
                link["contract"] = self.contracts[i]
            elif target == 1:
                link["customer"] = self.customers[i]
            else:
                link["contract_item"] = self.contracts[i].items.order_by("sort_order").first()
            reminder = self.today + timedelta(days=self.rng.randint(-20, 40))
            todo, created = TodoItem.objects.get_or_create(
                tenant=self.tenant,
                text=text,
                created_by=self.admin,
                defaults={
                    "reminder_date": reminder if i % 4 else None,
                    "is_public": True,
                    "assigned_to": assignee,
                    **link,
                },
            )
            self._count("Todos", created)
            if i % 3 == 0:
                for j in range(1 + i % 4):
                    _, c_created = TodoComment.objects.get_or_create(
                        tenant=self.tenant,
                        todo=todo,
                        text=COMMENT_TEXTS[(i + j) % len(COMMENT_TEXTS)],
                        defaults={"author": self.users[j % len(self.users)]},
                    )
                    self._count("Todo-Kommentare", c_created)

    def _seed_comments(self):
        from apps.contracts.models import ContractComment
        from apps.customers.models import CustomerNote

        authors = [self.admin, *self.users]
        for i, contract in enumerate(self.contracts[:6]):
            for j in range(1 + i % 3):
                _, created = ContractComment.objects.get_or_create(
                    tenant=self.tenant,
                    contract=contract,
                    text=COMMENT_TEXTS[(i * 2 + j) % len(COMMENT_TEXTS)],
                    defaults={"author": authors[(i + j) % len(authors)]},
                )
                self._count("Vertragskommentare", created)
        for i, customer in enumerate(self.customers[:5]):
            _, created = CustomerNote.objects.get_or_create(
                tenant=self.tenant,
                customer=customer,
                content=COMMENT_TEXTS[(i * 3) % len(COMMENT_TEXTS)],
                defaults={"user": authors[i % len(authors)]},
            )
            self._count("Kundennotizen", created)

    # ----------------------------------------------------------------
    # Banking (bewusst einfach: ein Konto, wenige Gegenparteien)
    # ----------------------------------------------------------------

    def _seed_cost_centers(self):
        from apps.banking.models import CostCenter

        result = []
        for code, name in [
            ("VT", "Vertrieb Außendienst Region Süd-West inkl. Key-Account-Management"),
            ("IT", "IT-Betrieb"),
            ("VW", "Verwaltung"),
        ]:
            cc, created = CostCenter.objects.get_or_create(
                tenant=self.tenant, code=f"{COST_CENTER_MARK}{code}", defaults={"name": name}
            )
            self._count("Kostenstellen", created)
            result.append(cc)
        return result

    def _seed_banking_base(self):
        from apps.banking.models import BankAccount, Counterparty

        account, created = BankAccount.objects.get_or_create(
            tenant=self.tenant,
            bank_code=BANK_CODE,
            account_number=BANK_ACCOUNT_NUMBER,
            defaults={
                "name": "Demo Geschäftskonto Hauptniederlassung (Sparkasse Rhein-Main)",
                "iban": "DE00999999990000000001",
                "bic": COUNTERPARTY_BIC,
            },
        )
        self._count("Bankkonten", created)

        counterparties = []
        # Lieferanten / Behoerden
        for i, name in enumerate(COUNTERPARTIES):
            cp, created = Counterparty.objects.get_or_create(
                tenant=self.tenant,
                name=name,
                defaults={
                    "iban": f"DE00999999990000{i + 100:06d}",
                    "bic": COUNTERPARTY_BIC,
                    "default_cost_center": self.cost_centers[i % len(self.cost_centers)],
                },
            )
            self._count("Gegenparteien", created)
            counterparties.append(cp)
        # Kunden als Zahler (fuer bezahlte Rechnungen)
        for i, customer in enumerate(self.customers[:8]):
            cp, created = Counterparty.objects.get_or_create(
                tenant=self.tenant,
                name=customer.name.upper()[:255],
                defaults={
                    "iban": f"DE00999999990001{i:06d}",
                    "bic": COUNTERPARTY_BIC,
                    "customer": customer,
                },
            )
            self._count("Gegenparteien", created)
            counterparties.append(cp)
        return account, counterparties

    def _transaction(self, counterparty, entry_date, amount, booking_text, reference, cost_center=None):
        from apps.banking.models import BankTransaction

        import_hash = BankTransaction.compute_hash(
            self.bank_account.id, entry_date, amount, "EUR", reference, counterparty.name
        )
        tx, created = BankTransaction.objects.get_or_create(
            tenant=self.tenant,
            import_hash=import_hash,
            defaults={
                "account": self.bank_account,
                "entry_date": entry_date,
                "value_date": entry_date,
                "amount": amount,
                "currency": "EUR",
                "transaction_type": "NTRF" if amount > 0 else "NDDT",
                "counterparty": counterparty,
                "cost_center": cost_center,
                "booking_text": booking_text,
                "reference": reference,
            },
        )
        self._count("Banktransaktionen", created)
        return tx

    def _seed_bank_transactions(self):
        from apps.invoices.models import InvoicePaymentMatch

        # Feste Lauf-Daten, damit der Hash (und damit die Idempotenz) stabil bleibt.
        base = date(self.today.year, self.today.month, 1)
        suppliers = self.counterparties[: len(COUNTERPARTIES)]
        for i in range(18):
            cp = suppliers[i % len(suppliers)]
            amount = -money(Decimal(self.rng.randint(1500, 2_500_000)) / 100)
            entry = base - timedelta(days=i * 9)
            self._transaction(
                cp, entry, amount,
                f"SEPA-Lastschrift {cp.name} Mandatsreferenz DEMO{i:05d} Abrechnungszeitraum {entry:%m/%Y}",
                f"DEMO-TX-{i:04d}",
                cost_center=self.cost_centers[i % len(self.cost_centers)],
            )

        # Bezahlte Rechnungen: Zahlungseingang vom Kunden plus Zuordnung.
        payer_by_customer = {cp.customer_id: cp for cp in self.counterparties if cp.customer_id}
        for invoice in self.invoices:
            if invoice.status != "paid":
                continue
            payer = payer_by_customer.get(invoice.customer_id) or self.counterparties[-1]
            tx = self._transaction(
                payer,
                invoice.invoice_date + timedelta(days=12),
                invoice.total_gross,
                f"Zahlung Rechnung {invoice.invoice_number} Kd-Nr. {invoice.customer.netsuite_customer_number}",
                f"DEMO-PAY-{invoice.invoice_number}",
            )
            _, created = InvoicePaymentMatch.objects.get_or_create(
                tenant=self.tenant,
                invoice_record=invoice,
                transaction=tx,
                defaults={
                    "match_type": InvoicePaymentMatch.MatchType.INVOICE_NUMBER,
                    "confidence": Decimal("1.00"),
                },
            )
            self._count("Zahlungszuordnungen", created)

    def _seed_incoming_invoices(self):
        from apps.banking.models import IncomingInvoice

        for i, cp in enumerate(self.counterparties[:5], start=1):
            net = money(Decimal(self.rng.randint(5_000, 4_800_000)) / 100)
            vat = money(net * Decimal("0.19"))
            message_id = f"<demo-{i:04d}{INCOMING_MAIL_DOMAIN}>"
            filename = f"Rechnung_{i:04d}_{cp.name[:40].replace(' ', '_')}.pdf"
            existing = IncomingInvoice.objects.filter(
                tenant=self.tenant, email_message_id=message_id, original_filename=filename
            ).first()
            if existing:
                self._count("Eingangsrechnungen", False)
                continue
            invoice = IncomingInvoice(
                tenant=self.tenant,
                counterparty=cp,
                supplier_name=cp.name,
                invoice_number=f"ER-{self.today.year}-{i:05d}",
                invoice_date=self.today - timedelta(days=10 * i),
                due_date=self.today + timedelta(days=30 - 10 * i),
                net_amount=net,
                vat_amount=vat,
                gross_amount=net + vat,
                original_filename=filename,
                file_size=len(MINIMAL_PDF),
                extraction_status=["extracted", "confirmed", "matched", "extraction_failed", "pending"][i - 1],
                extraction_error="Seite 2 nicht lesbar" if i == 4 else "",
                email_message_id=message_id,
                source_email_subject=f"Ihre Rechnung {i:04d} von {cp.name}",
                source_email_date=timezone.now() - timedelta(days=10 * i),
            )
            invoice.pdf_file.save(filename, ContentFile(MINIMAL_PDF), save=False)
            invoice.save()
            self._count("Eingangsrechnungen", True)

    # ----------------------------------------------------------------
    # Datensaetze fuer Detail- und Dialog-Routen (UI-Tests)
    # ----------------------------------------------------------------

    def _showcase_contract(self):
        """Erster aktiver Demo-Vertrag: traegt AB, Anhang und viele Kommentare."""
        return next(c for c in self.contracts if c.status == "active")

    def _seed_imported_invoices(self):
        """Importierte Ausgangsrechnungen: ohne Kunde, ohne Vertrag, bezahlt."""
        from apps.invoices.models import ImportedInvoice, InvoiceImportBatch, InvoicePaymentMatch

        batch, created = InvoiceImportBatch.objects.get_or_create(
            tenant=self.tenant,
            name=IMPORT_BATCH_NAME,
            defaults={"uploaded_by": self.admin},
        )
        self._count("Import-Batches", created)

        # Weder Vertrag noch billing_date: sonst zaehlt die Rechnung im
        # Umsatz-Forecast als "abgerechnet" und veraendert Bestandsansichten.
        plan = [
            # (a) kein Kunde verknuepft, nur der extrahierte Name
            (1, None, "Unbekannte Spedition Rhein-Ruhr-Transporte GmbH & Co. KG (nicht zugeordnet)",
             ImportedInvoice.ExtractionStatus.EXTRACTED, "4165.00"),
            # (b) Kunde verknuepft, aber kein Vertrag
            (2, self.customers[0], self.customers[0].name,
             ImportedInvoice.ExtractionStatus.SENT, "28917.45"),
            # (c) bezahlt (Zahlungszuordnung zu einer Demo-Banktransaktion)
            (3, self.customers[1], self.customers[1].name,
             ImportedInvoice.ExtractionStatus.PAID, "1190.00"),
        ]
        result = []
        for i, customer, customer_name, status, amount in plan:
            number = f"{IMPORTED_MARK}{self.today.year}-{i:04d}"
            invoice = ImportedInvoice.objects.filter(tenant=self.tenant, invoice_number=number).first()
            created = invoice is None
            if created:
                filename = f"Ausgangsrechnung_{number}.pdf"
                invoice = ImportedInvoice(
                    tenant=self.tenant,
                    invoice_number=number,
                    invoice_date=self.today - timedelta(days=20 * i),
                    total_amount=Decimal(amount),
                    customer_name=customer_name,
                    customer=customer,
                    original_filename=filename,
                    file_size=len(MINIMAL_PDF),
                    extraction_status=status,
                    created_by=self.admin,
                    import_batch=batch,
                    expected_filename=filename,
                    receiver_emails=list(customer.billing_emails or []) if customer else [],
                )
                invoice.pdf_file.save(filename, ContentFile(MINIMAL_PDF), save=False)
                invoice.save()
            self._count("Importierte Rechnungen", created)
            result.append(invoice)

            if status == ImportedInvoice.ExtractionStatus.PAID:
                payer = next(
                    (cp for cp in self.counterparties if cp.customer_id == customer.id),
                    self.counterparties[-1],
                )
                tx = self._transaction(
                    payer,
                    invoice.invoice_date + timedelta(days=9),
                    invoice.total_amount,
                    f"Zahlung Rechnung {number} Kd-Nr. {customer.netsuite_customer_number}",
                    f"DEMO-PAY-{number}",
                )
                _, m_created = InvoicePaymentMatch.objects.get_or_create(
                    tenant=self.tenant,
                    invoice=invoice,
                    transaction=tx,
                    defaults={
                        "match_type": InvoicePaymentMatch.MatchType.INVOICE_NUMBER,
                        "confidence": Decimal("1.00"),
                    },
                )
                self._count("Zahlungszuordnungen", m_created)

        batch.update_counts()
        return result

    def _seed_pdf_offer(self):
        """Angebot im Status draft mit PDF (fuer den Senden-Dialog)."""
        from apps.offers.models import OfferRecord

        number = f"{OFFER_MARK}{self.today.year}-PDF1"
        offer = OfferRecord.objects.filter(tenant=self.tenant, offer_number=number).first()
        if offer:
            self._count("Angebote", False)
            return offer

        drafts = [c for c in self.contracts if c.status == "draft"]
        contract = next((c for c in drafts if c.customer.billing_emails), drafts[0])
        customer = contract.customer
        lines, total_net = self._line_items(contract, 12)
        domestic = (customer.address or {}).get("country", "Deutschland") == "Deutschland"
        tax_rate = Decimal("19.00") if domestic else Decimal("0.00")
        tax_amount = money(total_net * tax_rate / 100)
        offer = OfferRecord(
            tenant=self.tenant,
            offer_number=number,
            contract=contract,
            customer=customer,
            offer_date=self.today,
            valid_until=self.today + timedelta(days=30),
            billing_date=self.today,
            period_start=self.today,
            period_end=self.today + relativedelta(years=1) - timedelta(days=1),
            total_net=total_net,
            tax_rate=tax_rate,
            tax_amount=tax_amount,
            total_gross=total_net + tax_amount,
            line_items_snapshot=lines,
            company_data_snapshot=self._company_snapshot(),
            status=OfferRecord.Status.DRAFT,
            customer_name=customer.name,
            contract_name=contract.name,
            minimum_term_months=contract.min_duration_months,
            notice_period_months=contract.notice_period_months,
        )
        offer.pdf_file.save(f"Angebot_{number}.pdf", ContentFile(MINIMAL_PDF), save=False)
        offer.save()
        self._count("Angebote", True)
        return offer

    def _seed_order_confirmation(self):
        """Auftragsbestaetigung (Entwurf mit PDF) am Vorzeige-Vertrag."""
        from apps.contracts.order_confirmation_models import OrderConfirmation

        ab = OrderConfirmation.objects.filter(
            tenant=self.tenant, order_confirmation_number=ORDER_CONFIRMATION_NUMBER
        ).first()
        created = ab is None
        if created:
            ab = OrderConfirmation(
                tenant=self.tenant,
                contract=self.showcase_contract,
                created_by=self.admin,
                order_confirmation_number=ORDER_CONFIRMATION_NUMBER,
                status=OrderConfirmation.Status.DRAFT,
                personal_message=(
                    "Vielen Dank für Ihren Auftrag. Anbei erhalten Sie unsere "
                    "Auftragsbestätigung mit allen vereinbarten Positionen."
                ),
                language="de",
            )
            ab.pdf_file.save(f"{ORDER_CONFIRMATION_NUMBER}.pdf", ContentFile(MINIMAL_PDF), save=False)
            ab.save()
        self._count("Auftragsbestaetigungen", created)
        return ab

    def _seed_attachments(self):
        """Je ein PDF-Anhang am Vorzeige-Vertrag und an dessen Kunden."""
        from apps.contracts.models import ContractAttachment
        from apps.customers.models import CustomerAttachment

        contract = self.showcase_contract
        filename = f"{ATTACHMENT_MARK}Anlage_3_Leistungsbeschreibung_gegengezeichnet.pdf"
        attachment = ContractAttachment.objects.filter(
            tenant=self.tenant, contract=contract, original_filename=filename
        ).first()
        created = attachment is None
        if created:
            attachment = ContractAttachment(
                tenant=self.tenant,
                contract=contract,
                original_filename=filename,
                file_size=len(MINIMAL_PDF),
                content_type="application/pdf",
                uploaded_by=self.admin,
                description="Demo-Anhang: Leistungsbeschreibung mit Unterschrift des Kunden",
                category="contract",
            )
            attachment.file.save(filename, ContentFile(MINIMAL_PDF), save=False)
            attachment.save()
        self._count("Vertragsanhaenge", created)

        customer = contract.customer
        filename = f"{ATTACHMENT_MARK}Rahmenvereinbarung_Kunde_unterschrieben.pdf"
        c_attachment = CustomerAttachment.objects.filter(
            tenant=self.tenant, customer=customer, original_filename=filename
        ).first()
        created = c_attachment is None
        if created:
            c_attachment = CustomerAttachment(
                tenant=self.tenant,
                customer=customer,
                original_filename=filename,
                file_size=len(MINIMAL_PDF),
                content_type="application/pdf",
                uploaded_by=self.admin,
                description="Demo-Anhang am Kunden",
                category="contract",
            )
            c_attachment.file.save(filename, ContentFile(MINIMAL_PDF), save=False)
            c_attachment.save()
        self._count("Kundenanhaenge", created)
        return attachment, c_attachment

    def _seed_showcase_comments(self):
        """Mehr als drei Kommentare am Vorzeige-Vertrag ("All Comments")."""
        from apps.contracts.models import ContractComment

        authors = [self.admin, *self.users]
        for i, text in enumerate(SHOWCASE_COMMENT_TEXTS):
            _, created = ContractComment.objects.get_or_create(
                tenant=self.tenant,
                contract=self.showcase_contract,
                text=text,
                defaults={"author": authors[i % len(authors)]},
            )
            self._count("Vertragskommentare", created)

    def _seed_invoice_inbox(self):
        """Postfach ohne Zugangsdaten, inaktiv.

        Abrufen wuerde nur ``apps.banking.tasks.poll_invoice_inboxes`` - der
        Task steht nicht im CELERY_BEAT_SCHEDULE und filtert zudem auf
        ``is_active=True``. Host liegt unter der reservierten TLD .invalid,
        ein manueller Verbindungstest laeuft damit sofort ins Leere.
        """
        from apps.banking.models import InvoiceInbox

        inbox, created = InvoiceInbox.objects.get_or_create(
            tenant=self.tenant,
            name=INBOX_NAME,
            defaults={
                "inbox_type": InvoiceInbox.InboxType.IMAP,
                "host": INBOX_HOST,
                "port": 993,
                "username": "",
                "password": "",
                "folder": "INBOX",
                "use_ssl": True,
                "is_active": False,
            },
        )
        self._count("Rechnungspostfaecher", created)
        return inbox

    def _seed_api_key(self):
        """API-Schluessel des Admins (nur DB-Datensatz, fuer den Revoke-Dialog).

        Der Hash stammt aus einem nie gespeicherten Zufallswert - der
        Schluessel existiert also nur als Datensatz und kann nicht benutzt werden.
        """
        import hashlib
        import secrets

        from apps.tenants.models import APIKey

        key = APIKey.objects.filter(
            tenant=self.tenant, user=self.admin, prefix=API_KEY_PREFIX, name=API_KEY_NAME
        ).first()
        created = key is None
        if created:
            key = APIKey.objects.create(
                tenant=self.tenant,
                user=self.admin,
                name=API_KEY_NAME,
                prefix=API_KEY_PREFIX,
                key_hash=hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
                permissions={p: True for p in ("contracts.read", "customers.read") if p in ALL_PERMISSIONS},
                expires_at=timezone.now() + timedelta(days=365),
            )
        self._count("API-Schluessel", created)
        return key

    def _seed_absence_report(self):
        """Finalisierter Abwesenheitsbericht vor zwei Monaten (ohne Zeiterfassung).

        Nicht der Vormonat: den greift der Report-Versand (send_scheduled_reports)
        auf, falls ein Zeitplan aktiv ist. Liegt fuer den Monat schon ein echter
        Bericht vor, wird nichts angelegt.
        """
        from apps.contracts.models import AbsenceReport, AbsenceReportEntry

        existing = AbsenceReport.objects.filter(
            tenant=self.tenant, entries__external_user_id__startswith=ABSENCE_USER_MARK
        ).distinct().first()
        if existing:
            self._count("Abwesenheitsberichte", False)
            return existing

        month_start = (self.today.replace(day=1) - relativedelta(months=2))
        if AbsenceReport.objects.filter(
            tenant=self.tenant, year=month_start.year, month=month_start.month
        ).exists():
            return None

        report = AbsenceReport(
            tenant=self.tenant,
            year=month_start.year,
            month=month_start.month,
            status=AbsenceReport.Status.FINALIZED,
            finalized_at=timezone.now(),
            finalized_by=self.admin,
        )
        report.pdf_file.save(
            f"absence-report-{report.year}-{report.month:02d}.pdf", ContentFile(MINIMAL_PDF), save=False
        )
        report.save()
        entries = [
            ("Maximiliane Müller-Lüdenscheidt", "vacation", 3, 7, "5.00"),
            ("Jan Schmidt", "sick", 10, 11, "2.00"),
            ("Ayşe Özdemir-Wolkenstein", "education", 14, 14, "1.00"),
            ("Jan Schmidt", "overtime_reduction", 20, 20, "0.50"),
        ]
        for n, (name, kind, day_from, day_to, days) in enumerate(entries, start=1):
            AbsenceReportEntry.objects.create(
                tenant=self.tenant,
                report=report,
                user_name=name,
                external_user_id=f"{ABSENCE_USER_MARK}{n:03d}",
                absence_type=kind,
                date_from=month_start.replace(day=day_from),
                date_to=month_start.replace(day=day_to),
                days_count=Decimal(days),
            )
        self._count("Abwesenheitsberichte", True)
        return report

    def _seed_new_business_and_price_increases(self):
        """Daten fuer die Dashboard-Bereiche "New Bookings" und "Price Increase
        Impact" - ohne sie blenden sich beide Bereiche aus.

        - Gewonnene Deals: jeder fuenfte aktive Vertrag bekommt eine Demo-Deal-ID
          und ein Gewinn-Datum im laufenden Jahr (New Name ARR, Deal-Anzahl).
        - Upsell: einige Positionen anderer aktiver Vertraege bekommen ein
          eigenes Gewinn-Datum (Back-to-Base ARR, bei Einmalpositionen
          Development).
        - Preiserhoehungen: wiederkehrende Positionen aktiver Vertraege bekommen
          zwei Preisperioden - bisheriger Preis bis 31.3., heutiger Preis ab 1.4.
          (abwechselnd Inflation/verhandelt). Der aktuelle Preis bleibt gleich.
        - Ziele des Jahres, sofern noch keine gesetzt sind.

        Deterministisch und ohne self.rng; nur Vertraege mit Demo-Kennung, nur
        Felder, die noch leer sind - ein zweiter Lauf aendert nichts.
        """
        from apps.contracts.models import ContractItemPrice, NewBusinessGoal, NewBusinessGoalType

        year = self.today.year
        # Monate bis heute, damit kein Gewinn-Datum in der Zukunft liegt
        months = [m for m in (2, 3, 5, 6, 8, 9) if date(year, m, 15) <= self.today] or [self.today.month]
        active = sorted((c for c in self.contracts if c.status == "active"), key=lambda c: c.id)
        won = active[::5][:6]
        won_ids = {c.id for c in won}

        for i, contract in enumerate(won):
            created = False
            if not contract.hubspot_deal_id:
                contract.hubspot_deal_id = f"DEMO-DEAL-{contract.id:04d}"
                contract.deal_won_date = date(year, months[i % len(months)], 15)
                contract.save(update_fields=["hubspot_deal_id", "deal_won_date"])
                created = True
            self._count("Gewonnene Deals", created)

        expansion_contracts = [c for c in active if c.id not in won_ids][:8]
        for i, contract in enumerate(expansion_contracts):
            item = contract.items.order_by("sort_order", "id").first()
            if item is None:
                continue
            created = False
            if item.deal_won_date is None:
                item.deal_won_date = date(year, months[(i + 2) % len(months)], 10)
                item.save(update_fields=["deal_won_date"])
                created = True
            self._count("Upsell-Positionen", created)

        jan1 = date(year, 1, 1)
        increase_from = date(year, 4, 1)
        candidates = [
            item
            for contract in active
            if contract.start_date and contract.start_date < jan1
            for item in contract.items.order_by("sort_order", "id")
            if not item.is_one_off
        ][:10]
        for i, item in enumerate(candidates):
            created = False
            if not item.price_periods.exists():
                previous = money(item.unit_price / Decimal("1.06"))
                ContractItemPrice.objects.create(
                    tenant=self.tenant,
                    item=item,
                    valid_from=item.contract.start_date,
                    valid_to=increase_from - timedelta(days=1),
                    unit_price=previous,
                    price_period=item.price_period,
                )
                ContractItemPrice.objects.create(
                    tenant=self.tenant,
                    item=item,
                    valid_from=increase_from,
                    unit_price=item.unit_price,
                    price_period=item.price_period,
                    increase_type=(
                        ContractItemPrice.IncreaseType.INFLATION
                        if i % 2 == 0
                        else ContractItemPrice.IncreaseType.NEGOTIATED
                    ),
                )
                created = True
            self._count("Preiserhoehungen", created)

        goals = {
            NewBusinessGoalType.NEW_ARR: Decimal("250000"),
            NewBusinessGoalType.BACK_TO_BASE_ARR: Decimal("150000"),
            NewBusinessGoalType.NEW_DEVELOPMENT: Decimal("100000"),
            NewBusinessGoalType.NEW_DEAL_COUNT: Decimal("6"),
        }
        for goal_type, target in goals.items():
            _, created = NewBusinessGoal.objects.get_or_create(
                tenant=self.tenant, year=year, goal_type=goal_type, defaults={"target_amount": target}
            )
            self._count("New-Business-Ziele", created)

    def _seed_kpi_snapshots(self):
        """KPI-Snapshots der fuenf Vormonate, damit die Sparklines der reinen
        Snapshot-Kennzahlen (TCV, Forecasts, Forecast je Erloesart) etwas zeigen.

        Aktive Vertraege und ARR kommen aus der Rueckrechnung zum Monatsende,
        Betraege der Prognosen sind der heutige Stand mit einem leichten,
        festen Abschlag je Monat (ohne self.rng). Kumulierte Jahreswerte fehlen
        bewusst, dort bleibt die Rueckrechnung massgeblich. Monate mit einem
        echten Snapshot werden nicht angefasst.
        """
        from apps.contracts.kpi_trends import (
            calculate_active_and_arr_at,
            collect_snapshot_metrics,
        )
        from apps.contracts.models import DashboardKpiSnapshot

        month_firsts = [
            self.today.replace(day=1) - relativedelta(months=back)
            for back in range(KPI_SNAPSHOT_MONTHS, 0, -1)
        ]
        missing = [
            m for m in month_firsts
            if not DashboardKpiSnapshot.objects.filter(tenant=self.tenant, year_month=m).exists()
        ]
        for _ in range(len(month_firsts) - len(missing)):
            self._count("KPI-Snapshots", False)
        if not missing:
            return

        live = collect_snapshot_metrics(self.tenant)
        month_ends = [m + relativedelta(months=1) - timedelta(days=1) for m in missing]
        history = dict(zip(missing, calculate_active_and_arr_at(self.tenant, month_ends), strict=True))

        for month_first in missing:
            back = (self.today.year - month_first.year) * 12 + self.today.month - month_first.month
            # 3 % weniger je Monat, dazu ein kleiner fester Schlenker
            factor = Decimal("1") - Decimal("0.03") * back + Decimal("0.01") * ((back * 7) % 3 - 1)

            def scaled(value):
                return str(money(Decimal(value) * factor))

            active, arr = history[month_first]
            DashboardKpiSnapshot.objects.create(
                tenant=self.tenant,
                year_month=month_first,
                metrics={
                    "source": KPI_SNAPSHOT_MARK,
                    "year": month_first.year,
                    "active_contracts": active,
                    "annual_recurring_revenue": str(money(arr)),
                    "total_contract_value": scaled(live["total_contract_value"]),
                    "current_year_forecast": scaled(live["current_year_forecast"]),
                    "next_year_forecast": scaled(live["next_year_forecast"]),
                    "revenue_stream_forecast": {
                        stream: scaled(amount) for stream, amount in live["revenue_stream_forecast"].items()
                    },
                },
            )
            self._count("KPI-Snapshots", True)

    # ----------------------------------------------------------------
    # Reset (loescht nur markierte Demo-Daten)
    # ----------------------------------------------------------------

    def _reset(self):
        from apps.banking.models import (
            BankAccount,
            BankTransaction,
            CostCenter,
            Counterparty,
            IncomingInvoice,
        )
        from apps.contracts.models import Contract
        from apps.customers.models import Customer
        from apps.invoices.models import InvoiceRecord
        from apps.offers.models import OfferRecord
        from apps.products.models import Product, ProductCategory

        from apps.banking.models import InvoiceInbox
        from apps.contracts.models import AbsenceReport, ContractAttachment, DashboardKpiSnapshot
        from apps.contracts.order_confirmation_models import OrderConfirmation
        from apps.customers.models import CustomerAttachment
        from apps.invoices.models import ImportedInvoice, InvoiceImportBatch
        from apps.tenants.models import APIKey

        t = self.tenant

        def delete_with_file(queryset, field):
            for obj in queryset:
                stored = getattr(obj, field)
                if stored:
                    stored.delete(save=False)
                obj.delete()

        delete_with_file(IncomingInvoice.objects.filter(tenant=t, email_message_id__endswith=INCOMING_MAIL_DOMAIN + ">"), "pdf_file")
        delete_with_file(ImportedInvoice.objects.filter(tenant=t, invoice_number__startswith=IMPORTED_MARK), "pdf_file")
        InvoiceImportBatch.objects.filter(tenant=t, name=IMPORT_BATCH_NAME).delete()
        delete_with_file(OrderConfirmation.objects.filter(tenant=t, order_confirmation_number=ORDER_CONFIRMATION_NUMBER), "pdf_file")
        delete_with_file(
            ContractAttachment.objects.filter(
                tenant=t, contract__po_number__startswith=CONTRACT_MARK, original_filename__startswith=ATTACHMENT_MARK
            ),
            "file",
        )
        delete_with_file(
            CustomerAttachment.objects.filter(
                tenant=t, customer__netsuite_customer_number__startswith=CUSTOMER_MARK,
                original_filename__startswith=ATTACHMENT_MARK,
            ),
            "file",
        )
        delete_with_file(
            AbsenceReport.objects.filter(tenant=t, entries__external_user_id__startswith=ABSENCE_USER_MARK).distinct(),
            "pdf_file",
        )
        delete_with_file(OfferRecord.objects.filter(tenant=t, offer_number__startswith=OFFER_MARK), "pdf_file")
        InvoiceInbox.objects.filter(tenant=t, name=INBOX_NAME, host=INBOX_HOST).delete()
        APIKey.objects.filter(tenant=t, prefix=API_KEY_PREFIX, name=API_KEY_NAME).delete()
        BankTransaction.objects.filter(tenant=t, account__account_number=BANK_ACCOUNT_NUMBER).delete()
        BankAccount.objects.filter(tenant=t, account_number=BANK_ACCOUNT_NUMBER, bank_code=BANK_CODE).delete()
        Counterparty.objects.filter(tenant=t, bic=COUNTERPARTY_BIC, transactions__isnull=True).delete()
        InvoiceRecord.objects.filter(tenant=t, invoice_number__startswith=STORNO_MARK).delete()
        InvoiceRecord.objects.filter(tenant=t, invoice_number__startswith=INVOICE_MARK).delete()
        OfferRecord.objects.filter(tenant=t, offer_number__startswith=OFFER_MARK).delete()
        # Todos, Kommentare, Positionen und Amendments haengen per CASCADE dran.
        Contract.objects.filter(tenant=t, po_number__startswith=CONTRACT_MARK).delete()
        Customer.objects.filter(tenant=t, netsuite_customer_number__startswith=CUSTOMER_MARK).delete()
        Product.objects.filter(tenant=t, sku__startswith=PRODUCT_MARK).delete()
        ProductCategory.objects.filter(tenant=t, name__in=PRODUCT_CATEGORIES, products__isnull=True).delete()
        CostCenter.objects.filter(tenant=t, code__startswith=COST_CENTER_MARK, transactions__isnull=True).delete()
        User.objects.filter(email__endswith=DEMO_USER_DOMAIN).delete()
        DashboardKpiSnapshot.objects.filter(tenant=t, metrics__source=KPI_SNAPSHOT_MARK).delete()
        self.stdout.write(self.style.WARNING("Vorhandene Demo-Daten geloescht."))

    # ----------------------------------------------------------------
    # Ausgabe
    # ----------------------------------------------------------------

    def _print_summary(self):
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 50))
        self.stdout.write(self.style.SUCCESS("Demo-Daten bereit (gesamt / davon neu)"))
        self.stdout.write(self.style.SUCCESS("=" * 50))
        for key, (total, new) in self.counts.items():
            self.stdout.write(f"  {key:<24} {total:>4} / {new:>4}")
        self.stdout.write("")
        self.stdout.write("Beispiel-IDs fuer Detailrouten:")
        self.stdout.write(f"  /customers/{self.customers[0].id}")
        self.stdout.write(f"  /contracts/{self.contracts[0].id}")
        self.stdout.write(f"  /invoices/{self.invoices[0].id}")
        self.stdout.write(f"  /offers/{self.offers[0].id}")
        demo_cp = next((cp for cp in self.counterparties if cp.customer_id is None), None)
        if demo_cp:
            self.stdout.write(f"  /banking/counterparty/{demo_cp.id}")
        labels = ["ohne Kunde", "ohne Vertrag", "bezahlt"]
        for label, inv in zip(labels, self.imported_invoices):
            self.stdout.write(f"  /invoices/{inv.id}?type=imported   (importiert, {label})")
        self.stdout.write(f"  /offers/{self.pdf_offer.id}   (Entwurf mit PDF)")
        self.stdout.write(
            f"  /contracts/{self.showcase_contract.id}/order-confirmation/{self.order_confirmation.id}"
        )
        self.stdout.write(f"  /attachments/{self.contract_attachment.id}   (Vertragsanhang)")
        self.stdout.write(
            f"  /customers/{self.customer_attachment.customer_id}   (Kundenanhang {self.customer_attachment.id})"
        )
        self.stdout.write(f"  /contracts/{self.showcase_contract.id}   (> 3 Kommentare)")
        self.stdout.write(f"  Rechnungspostfach {self.inbox.id} (inaktiv), API-Schluessel {self.api_key.id}")
        if self.absence_report:
            self.stdout.write(
                f"  Abwesenheitsbericht {self.absence_report.year}-{self.absence_report.month:02d} (finalisiert)"
            )
