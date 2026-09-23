"""Role gates for the REST API.

`role` lives on the user model, so these are cheap — no extra query. They are
deliberately written against `user.is_admin` rather than comparing the raw
string in each view, so there is one place to change if roles ever grow.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    """Admin-only. Anonymous users fall through `is_authenticated` first."""
    message = 'Administrator access is required for this action.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_admin', False))


class IsUser(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated
                    and getattr(user, 'role', None) == 'USER')


class CanVerifyTickets(BasePermission):
    """Door staff and admins. The one thing ROLE_STAFF is allowed to do.

    Kept separate from `IsAdmin` rather than widening it: `IsAdmin` guards the
    analytics figures, the catalogue and every booking in the system, and a
    role that only needs to answer "let this person in?" has no business
    passing that gate.
    """
    message = 'Ticket verification access is required for this action.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated
                    and getattr(user, 'can_verify_tickets', False))


class CanBook(BasePermission):
    """Any logged-in account except door staff.

    They check tickets; they don't buy them. Without this they would inherit
    booking from the plain `IsAuthenticated` on the booking viewset, which is
    the one write path a staff account could otherwise reach.
    """
    message = 'Ticket staff accounts cannot make bookings.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated
                    and getattr(user, 'can_book', True))


class IsAdminOrReadOnly(BasePermission):
    """Anyone may browse; only admins may change anything.

    Replaces the `IsAuthenticatedOrReadOnly` + per-action `IsAdmin` pairing,
    which relied on every viewset remembering to list all four write actions —
    miss one (`partial_update` is the usual casualty) and it silently falls
    back to "any logged-in user may write".
    """
    message = 'Administrator access is required for this action.'

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_admin', False))
