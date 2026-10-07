"""Core GraphQL schema for authentication."""
import logging
from typing import Annotated, Union

import strawberry
from django.contrib.auth import authenticate
from strawberry.types import Info

from apps.core.auth import (
    create_access_token,
    create_refresh_token,
    create_2fa_challenge_token,
    create_2fa_setup_token,
    decode_2fa_challenge,
    get_user_from_token,
)
from apps.core.context import Context

logger = logging.getLogger(__name__)


@strawberry.type
class AuthPayload:
    """Authentication response with tokens."""

    access_token: str
    refresh_token: str
    user_id: int
    email: str
    tenant_id: int | None


@strawberry.type
class TwoFactorChallenge:
    """Response when 2FA is required."""

    requires_two_factor: bool = True
    challenge_token: str = ""
    method: str = ""  # "totp" or "email"


@strawberry.type
class AuthError:
    """Authentication error."""

    message: str


AuthResult = Annotated[Union[AuthPayload, TwoFactorChallenge, AuthError], strawberry.union("AuthResult")]


@strawberry.type
class OperationResult:
    """Simple success/error result."""
    success: bool
    error: str | None = None


@strawberry.type
class DeleteResult:
    """Result of delete operations."""

    success: bool = False
    error: str | None = None


import enum


@strawberry.enum
class FeedbackType(enum.Enum):
    """Type of feedback being submitted."""

    BUG = "bug"
    FEATURE = "feature"
    GENERAL = "general"


@strawberry.input
class FeedbackInput:
    """Input for submitting feedback."""

    type: FeedbackType
    title: str
    description: str | None = None
    screenshot: str | None = None  # Base64 encoded
    page_url: str | None = None
    viewport: str | None = None  # e.g., "1920x1080"
    user_agent: str | None = None


@strawberry.type
class FeedbackResult:
    """Result of feedback submission."""

    success: bool = False
    error: str | None = None
    task_url: str | None = None


@strawberry.type
class CurrentUser:
    """Current authenticated user info."""

    id: int
    email: str
    first_name: str
    last_name: str
    tenant_id: int | None
    tenant_name: str | None
    company_name: str | None
    role_name: str | None
    is_admin: bool
    roles: list[str] | None = None
    permissions: list[str] | None = None
    two_factor_enabled: bool = False
    two_factor_method: str | None = None


@strawberry.type
class SearchResultItem:
    """A single search result item."""

    # String-ID: Eingangsrechnungen und Gegenparteien haben UUIDs
    id: strawberry.ID
    title: str
    subtitle: str | None = None
    url: str
    # True = aehnlicher (unscharfer) Treffer - im Frontend nicht hervorheben
    fuzzy: bool = False


@strawberry.type
class SearchResultGroup:
    """A group of search results by type."""

    type: str
    label: str
    items: list[SearchResultItem]
    has_more: bool = False


@strawberry.type
class GlobalSearchResult:
    """Global search results grouped by type."""

    groups: list[SearchResultGroup]
    total_count: int


def _get_2fa_enabled(user) -> bool:
    try:
        return user.two_factor_config.is_active
    except Exception:
        return False


def _get_2fa_method(user) -> str | None:
    try:
        cfg = user.two_factor_config
        return cfg.method if cfg.is_active else None
    except Exception:
        return None


@strawberry.type
class CoreQuery:
    """Core queries including auth status."""

    @strawberry.field
    def feedback_enabled(self) -> bool:
        """Check if the selected feedback backend is configured."""
        from apps.core.feedback import get_feedback_service
        return get_feedback_service().is_configured()

    @strawberry.field
    def signup_enabled(self) -> bool:
        """Check if public tenant signup is enabled."""
        from django.conf import settings
        return settings.SIGNUP_ENABLED

    @strawberry.field
    def entra_sso_enabled(self) -> bool:
        """Ob die Anmeldemaske den Weg ueber Entra ID anbieten soll.

        Oeffentlich abfragbar - vor der Anmeldung gibt es keinen Benutzer, aus
        dem sich der Mandant ableiten liesse. Die Antwort verraet nur, dass es
        SSO gibt, keine Konfigurationsdetails.
        """
        from apps.tenants.models import Tenant

        return any(
            (t.settings or {}).get("entra_sso", {}).get("enabled")
            for t in Tenant.objects.filter(is_active=True)
        )

    @strawberry.field
    def latest_version(self) -> str | None:
        """Newest released version tag from the public GitHub repo.

        Returns null when the lookup is unavailable (offline / rate limited).
        The frontend compares this against the running build version.
        """
        from apps.core.version_check import get_latest_version
        return get_latest_version()

    @strawberry.field
    def me(self, info: Info[Context, None]) -> CurrentUser | None:
        """Get current authenticated user."""
        user = info.context.user
        if user is None:
            return None

        role_names = [r.name for r in user.roles.all()]
        permissions = sorted(user.effective_permissions)

        company_name = None
        if user.tenant:
            from apps.invoices.models import CompanyLegalData
            legal = CompanyLegalData.objects.filter(tenant=user.tenant).values_list("company_name", flat=True).first()
            if legal:
                company_name = legal

        return CurrentUser(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            tenant_id=user.tenant_id,
            tenant_name=user.tenant.name if user.tenant else None,
            company_name=company_name,
            role_name=user.role.name if user.role else None,
            is_admin=user.is_admin or user.is_super_admin,
            roles=role_names,
            permissions=permissions,
            two_factor_enabled=_get_2fa_enabled(user),
            two_factor_method=_get_2fa_method(user),
        )

    @strawberry.field
    def global_search(
        self,
        info: Info[Context, None],
        query: str,
        limit: int = 10,
        types: list[str] | None = None,
        offset: int = 0,
    ) -> GlobalSearchResult:
        """Suche ueber Kunden, Vertraege, Rechnungen, Angebote, Eingangsrechnungen,
        Gegenparteien und Produkte (Logik in apps.core.search).

        `types` schraenkt auf Gruppen ein (z. B. ["contract"]), `offset` laedt
        auf der Ergebnisseite je Gruppe nach.
        """
        from apps.core.permissions import check_perm
        from apps.core.search import run_search

        empty = GlobalSearchResult(groups=[], total_count=0)
        # Zu kurze Anfrage: ohne jede Datenbankabfrage zurueck
        if len(query.strip()) < 2:
            return empty
        # Gleiche Regeln wie jede andere Abfrage: ohne Anmeldung oder mit einem
        # 2FA-Setup-Token (nur Passwort, 2FA noch nicht eingerichtet) nichts.
        # Bewusst leere Liste statt Fehler - die Suche laeuft beim Tippen.
        if not info.context.is_authenticated or info.context.is_2fa_setup_restricted:
            return empty
        user = info.context.user
        if user is None or not user.tenant:
            return empty

        def may_read(resource: str) -> bool:
            # Rolle des Benutzers und - bei API-Keys - der Scope des Schluessels
            allowed, _ = check_perm(info, resource, "read")
            return allowed is not None

        groups = [
            SearchResultGroup(
                type=g.type,
                label=g.label,
                has_more=g.has_more,
                items=[
                    SearchResultItem(
                        id=strawberry.ID(h.id),
                        title=h.title,
                        subtitle=h.subtitle,
                        url=h.url,
                        fuzzy=h.fuzzy,
                    )
                    for h in g.items
                ],
            )
            for g in run_search(
                user.tenant,
                query,
                may_read=may_read,
                limit=max(1, min(limit, 50)),
                offset=max(0, min(offset, 10_000)),
                types=types,
            )
        ]
        return GlobalSearchResult(groups=groups, total_count=sum(len(g.items) for g in groups))


@strawberry.type
class AuthMutation:
    """Authentication mutations."""

    @strawberry.mutation
    def login(self, email: str, password: str) -> AuthResult:
        """Authenticate user and return tokens."""
        user = authenticate(username=email, password=password)

        if user is None or not user.is_active:
            return AuthError(message="Invalid email or password")

        if user.tenant and not user.tenant.is_active:
            return AuthError(message="Tenant is inactive")

        # Nach der Umstellung auf SSO duerfen nur noch ausdrueckliche
        # Notfallkonten den Passwort-Weg gehen. Die Entscheidung faellt hier und
        # nicht in der Oberflaeche: Ob das Formular sichtbar war, entscheidet der
        # Browser des Aufrufers.
        if not user.local_login_allowed:
            logger.warning("Password login refused for %s: local login disabled", user.email)
            return AuthError(message="Password sign-in is disabled for this account")

        _record_password_login_under_sso(user)

        from django.utils import timezone
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])

        # Check if user has 2FA enabled
        try:
            tfa = user.two_factor_config
            if tfa.is_active:
                challenge_token = create_2fa_challenge_token(user, tfa.method)

                # Send email code if method is email
                if tfa.method == "email":
                    from apps.tenants.tasks import send_2fa_email_code
                    send_2fa_email_code.delay(user.id)

                return TwoFactorChallenge(
                    challenge_token=challenge_token,
                    method=tfa.method,
                )
        except Exception:
            pass  # No 2FA config — proceed normally

        # Check if tenant enforces 2FA and user doesn't have it
        if user.tenant and (user.tenant.settings or {}).get("two_factor_enforced"):
            access_token = create_2fa_setup_token(user)
            return AuthPayload(
                access_token=access_token,
                refresh_token="",
                user_id=user.id,
                email=user.email,
                tenant_id=user.tenant_id,
            )

        access_token = create_access_token(user)
        refresh_token = create_refresh_token(user)

        return AuthPayload(
            access_token=access_token,
            refresh_token=refresh_token,
            user_id=user.id,
            email=user.email,
            tenant_id=user.tenant_id,
        )

    @strawberry.mutation
    def verify_2fa(self, challenge_token: str, code: str) -> AuthResult:
        """Verify 2FA code and return full tokens."""
        from django.core.cache import cache
        from apps.tenants.models import User

        payload = decode_2fa_challenge(challenge_token)
        if payload is None:
            return AuthError(message="Invalid or expired verification session")

        user_id = int(payload["sub"])
        method = payload.get("method")

        # Rate limiting
        rate_key = f"2fa_attempts:{user_id}"
        attempts = cache.get(rate_key, 0)
        if attempts >= 5:
            return AuthError(message="Too many attempts. Please log in again.")

        try:
            user = User.objects.select_related("tenant", "role").prefetch_related("roles").get(
                id=user_id, is_active=True
            )
        except User.DoesNotExist:
            return AuthError(message="User not found")

        try:
            tfa = user.two_factor_config
        except Exception:
            return AuthError(message="2FA not configured")

        # Verify code
        verified = False
        code_clean = code.strip()

        if method == "totp":
            import pyotp
            totp = pyotp.TOTP(tfa.get_totp_secret())
            if totp.verify(code_clean, valid_window=1):
                verified = True
            elif tfa.verify_recovery_code(code_clean):
                verified = True
        elif method == "email":
            cached_code = cache.get(f"2fa_code:{user_id}")
            if cached_code and cached_code == code_clean:
                cache.delete(f"2fa_code:{user_id}")  # Single-use
                verified = True
            elif tfa.verify_recovery_code(code_clean):
                verified = True

        if not verified:
            cache.set(rate_key, attempts + 1, timeout=900)
            return AuthError(message="Invalid verification code")

        # Clear rate limit on success
        cache.delete(rate_key)

        access_token = create_access_token(user)
        refresh_token_val = create_refresh_token(user)

        return AuthPayload(
            access_token=access_token,
            refresh_token=refresh_token_val,
            user_id=user.id,
            email=user.email,
            tenant_id=user.tenant_id,
        )

    @strawberry.mutation
    def refresh_token(self, refresh_token: str) -> AuthResult:
        """Get new access token using refresh token."""
        user = get_user_from_token(refresh_token)

        if user is None:
            return AuthError(message="Invalid or expired refresh token")

        if user.tenant and not user.tenant.is_active:
            return AuthError(message="Tenant is inactive")

        access_token = create_access_token(user)
        new_refresh_token = create_refresh_token(user)

        return AuthPayload(
            access_token=access_token,
            refresh_token=new_refresh_token,
            user_id=user.id,
            email=user.email,
            tenant_id=user.tenant_id,
        )


@strawberry.type
class FeedbackMutation:
    """Feedback submission mutations."""

    @strawberry.mutation
    def submit_feedback(self, info: Info[Context, None], input: FeedbackInput) -> FeedbackResult:
        """Submit user feedback via the configured backend."""
        from datetime import datetime
        from apps.core.feedback import get_feedback_service

        user = info.context.user
        if user is None:
            return FeedbackResult(success=False, error="Authentication required")

        # Build description with context
        lines = []
        if input.description:
            lines.append(input.description)
            lines.append("")

        lines.append("---")
        lines.append(f"**Submitted by:** {user.first_name} {user.last_name} ({user.email})")
        lines.append(f"**Type:** {input.type.value}")
        lines.append(f"**Time:** {datetime.now().isoformat()}")

        if input.page_url:
            lines.append(f"**Page:** {input.page_url}")
        if input.viewport:
            lines.append(f"**Viewport:** {input.viewport}")
        if input.user_agent:
            lines.append(f"**Browser:** {input.user_agent}")

        description = "\n".join(lines)

        try:
            service = get_feedback_service()

            result = service.create_feedback(
                title=input.title,
                description=description,
                feedback_type=input.type.value,
                screenshot=input.screenshot,
            )

            return FeedbackResult(
                success=True,
                task_url=result.url,
            )

        except Exception as e:
            import logging
            logging.getLogger(__name__).error("Feedback submission failed: %s", e)
            if "not configured" in str(e).lower():
                return FeedbackResult(success=False, error="Feedback system is not configured. Please contact an administrator.")
            return FeedbackResult(success=False, error=str(e))


def _record_password_login_under_sso(user) -> None:
    """Haelt fest, wenn der Notweg benutzt wurde.

    Ein Notweg, den niemand bemerkt, wird zum Hauptweg. Solange SSO fuer den
    Mandanten nicht aktiv ist, ist die Passwort-Anmeldung der normale Weg und
    wird nicht gesondert vermerkt.
    """
    tenant = user.tenant
    if not tenant or not (tenant.settings or {}).get("entra_sso", {}).get("enabled"):
        return

    from apps.audit.models import AuditLog

    try:
        AuditLog.objects.create(
            tenant=tenant,
            action=AuditLog.Action.UPDATE,
            entity_type="user",
            entity_id=user.pk,
            entity_repr=f"Password sign-in {user.email}",
            user=user,
            changes={"method": {"old": None, "new": "password_while_sso_active"}},
        )
    except Exception:
        logger.exception("Could not record the password sign-in for %s", user.email)
