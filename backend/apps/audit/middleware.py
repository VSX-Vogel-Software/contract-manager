"""Middleware for audit logging."""

from apps.audit.services import clear_current_user, set_current_user
from apps.core.auth import get_user_from_request


class AuditUserMiddleware:
    """Middleware to set the current user for audit logging from request context."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # User aus dem Authorization-Header (JWT); das Ergebnis bleibt am
        # Request haengen und wird im GraphQL-Kontext wiederverwendet.
        user = get_user_from_request(request)

        # Set the user in thread-local storage
        if user:
            set_current_user(user)

        try:
            response = self.get_response(request)
            return response
        finally:
            # Always clear the user after the request
            clear_current_user()
