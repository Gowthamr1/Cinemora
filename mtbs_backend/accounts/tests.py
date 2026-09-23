from io import StringIO
from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from .models import CustomUser

PASSWORD = 'Testpass123!'


class RegistrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.payload = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'Testpass123!',
            'password2': 'Testpass123!',
        }

    def test_user_registration(self):
        response = self.client.post(reverse('register'), self.payload)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(CustomUser.objects.get(username='testuser').role, 'USER')

    def test_registration_cannot_grant_itself_admin(self):
        """The whole admin gate hangs off `role`, so this has to stay closed."""
        response = self.client.post(
            reverse('register'), {**self.payload, 'role': 'ADMIN'})

        self.assertEqual(response.status_code, 201)
        user = CustomUser.objects.get(username='testuser')
        self.assertEqual(user.role, 'USER')
        self.assertFalse(user.is_admin)
        # Nor via the back doors that would let them into the Django admin.
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_registration_cannot_grant_itself_staff(self):
        response = self.client.post(
            reverse('register'),
            {**self.payload, 'is_staff': True, 'is_superuser': True},
        )

        self.assertEqual(response.status_code, 201)
        user = CustomUser.objects.get(username='testuser')
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_mismatched_passwords_are_rejected(self):
        response = self.client.post(
            reverse('register'), {**self.payload, 'password2': 'Different123!'})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(CustomUser.objects.filter(username='testuser').exists())

    def test_email_is_required(self):
        payload = dict(self.payload)
        payload.pop('email')
        response = self.client.post(reverse('register'), payload)

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_duplicate_email_is_rejected_regardless_of_case(self):
        CustomUser.objects.create_user(
            username='first', email='Test@Example.com', password='Testpass123!')

        response = self.client.post(reverse('register'), self.payload)

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)


class IsAdminTests(TestCase):
    def test_superuser_counts_as_admin(self):
        """A superuser already owns the Django admin; withholding the REST
        admin endpoints from them would be a distinction without a benefit."""
        user = CustomUser.objects.create_superuser(
            username='root', email='root@example.com', password='Testpass123!')
        self.assertTrue(user.is_admin)

    def test_plain_user_is_not_admin(self):
        user = CustomUser.objects.create_user(
            username='joe', email='joe@example.com', password='Testpass123!')
        self.assertFalse(user.is_admin)

    def test_role_admin_is_admin(self):
        user = CustomUser.objects.create_user(
            username='mgr', email='mgr@example.com', password='Testpass123!',
            role='ADMIN')
        self.assertTrue(user.is_admin)


class TicketStaffRoleTests(TestCase):
    """The three capability properties, at the model level.

    Worth pinning here as well as through the API: `is_admin` is the single
    gate on analytics, the catalogue, every booking and every payment, so a
    change that quietly admits STAFF would widen all of them at once.
    """

    def setUp(self):
        self.staff = CustomUser.objects.create_user(
            username='usher', email='usher@example.com', password=PASSWORD,
            role=CustomUser.ROLE_STAFF)

    def test_staff_is_not_an_admin(self):
        self.assertFalse(self.staff.is_admin)

    def test_staff_may_verify_but_not_book(self):
        self.assertTrue(self.staff.can_verify_tickets)
        self.assertFalse(self.staff.can_book)

    def test_a_customer_may_book_but_not_verify(self):
        user = CustomUser.objects.create_user(
            username='joe', email='joe@example.com', password=PASSWORD)
        self.assertTrue(user.can_book)
        self.assertFalse(user.can_verify_tickets)

    def test_an_admin_can_do_both(self):
        """So a manager can cover a shift on the door without a second login."""
        admin = CustomUser.objects.create_user(
            username='boss', email='boss@example.com', password=PASSWORD,
            role=CustomUser.ROLE_ADMIN)
        self.assertTrue(admin.can_verify_tickets)
        self.assertTrue(admin.can_book)

    def test_staff_is_not_django_staff(self):
        """ROLE_STAFF and Django's `is_staff` are unrelated — the latter opens
        the Django admin site, which a door account has no business in."""
        self.assertFalse(self.staff.is_staff)
        self.assertFalse(self.staff.is_superuser)

    def test_registration_cannot_mint_a_staff_account(self):
        response = APIClient().post(reverse('register'), {
            'username': 'sneaky', 'email': 'sneaky@example.com',
            'password': PASSWORD, 'password2': PASSWORD, 'role': 'STAFF',
        })

        self.assertEqual(response.status_code, 201)
        self.assertEqual(CustomUser.objects.get(username='sneaky').role, 'USER')


class CreateStaffCommandTests(TestCase):
    """`createstaff` is the only way to make one of these accounts."""

    def run_command(self, *args, **kwargs):
        out = StringIO()
        call_command('createstaff', *args, stdout=out, stderr=StringIO(), **kwargs)
        return out.getvalue()

    def test_it_creates_a_staff_account(self):
        self.run_command('usher1', password=PASSWORD, email='door@cinema.test')

        user = CustomUser.objects.get(username='usher1')
        self.assertEqual(user.role, CustomUser.ROLE_STAFF)
        self.assertEqual(user.email, 'door@cinema.test')
        self.assertTrue(user.check_password(PASSWORD))
        self.assertTrue(user.can_verify_tickets)
        self.assertFalse(user.can_book)

    def test_an_existing_username_is_refused_without_promote(self):
        """A typo must not silently turn a customer into a door account and
        strip them of the ability to reach their own bookings."""
        CustomUser.objects.create_user(
            username='rita', email='rita@example.com', password=PASSWORD)

        with self.assertRaises(CommandError):
            self.run_command('rita', password=PASSWORD)

        self.assertEqual(CustomUser.objects.get(username='rita').role, 'USER')

    def test_promote_converts_an_existing_account(self):
        CustomUser.objects.create_user(
            username='rita', email='rita@example.com', password=PASSWORD)

        self.run_command('rita', promote=True)

        self.assertEqual(CustomUser.objects.get(username='rita').role, 'STAFF')

    def test_promoting_a_superuser_is_refused(self):
        """`is_admin` returns True for a superuser whatever the role says, so
        the result would look like staff and behave like an admin."""
        CustomUser.objects.create_superuser(
            username='root', email='root@example.com', password=PASSWORD)

        with self.assertRaises(CommandError):
            self.run_command('root', promote=True)

        self.assertTrue(CustomUser.objects.get(username='root').is_admin)


# The suite runs with rate limiting off (see settings.TESTING) because the
# counter is process-wide and would make test order decide pass/fail. These two
# tests turn it back on deliberately, and clear the counter either side.
#
# It has to be patched on the class, not via `override_settings`: DRF binds
# `SimpleRateThrottle.THROTTLE_RATES` to the settings dict when the module is
# first imported, so a later settings change never reaches it — the tests would
# pass against an unthrottled view and prove nothing.
def throttled(**rates):
    return mock.patch.object(SimpleRateThrottle, 'THROTTLE_RATES', rates)


class AuthThrottleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def tearDown(self):
        cache.clear()

    @throttled(auth='3/min')
    def test_repeated_login_attempts_are_throttled(self):
        CustomUser.objects.create_user(
            username='victim', email='v@example.com', password='Testpass123!')
        guess = {'username': 'victim', 'password': 'wrong'}

        for _ in range(3):
            self.assertEqual(self.client.post(reverse('token_obtain_pair'), guess).status_code, 401)

        # Fourth guess inside the window is refused outright — and crucially the
        # correct password is refused too, so the limit can't be probed past.
        self.assertEqual(self.client.post(reverse('token_obtain_pair'), guess).status_code, 429)
        self.assertEqual(
            self.client.post(reverse('token_obtain_pair'),
                             {'username': 'victim', 'password': 'Testpass123!'}).status_code,
            429)

    @throttled(auth='3/min')
    def test_bulk_registration_is_throttled(self):
        def register(n):
            return self.client.post(reverse('register'), {
                'username': f'bot{n}', 'email': f'bot{n}@example.com',
                'password': 'Testpass123!', 'password2': 'Testpass123!'})

        for n in range(3):
            self.assertEqual(register(n).status_code, 201)

        self.assertEqual(register(99).status_code, 429)
        self.assertEqual(CustomUser.objects.count(), 3)

    def test_the_suite_itself_runs_unthrottled(self):
        """Guards the settings.TESTING switch above.

        If the `auth` rate ever comes back during tests, unrelated tests that
        happen to log in a few times start failing for reasons that have
        nothing to do with what they assert.
        """
        for n in range(12):
            response = self.client.post(reverse('register'), {
                'username': f'user{n}', 'email': f'user{n}@example.com',
                'password': 'Testpass123!', 'password2': 'Testpass123!'})
            self.assertEqual(response.status_code, 201)


class CookieAuthTests(TestCase):
    """The tokens live in httpOnly cookies; JavaScript must never see them."""

    def setUp(self):
        # enforce_csrf_checks is not optional here. Django's test client
        # normally sets `_dont_enforce_csrf_checks`, which CsrfViewMiddleware
        # honours — so a CSRF test written with the default client passes
        # against a completely unprotected API and proves nothing.
        self.client = APIClient(enforce_csrf_checks=True)
        self.user = CustomUser.objects.create_user(
            username='rita', email='rita@example.com', password=PASSWORD)
        cache.clear()

    def tearDown(self):
        cache.clear()

    def login(self):
        return self.client.post(
            reverse('token_obtain_pair'),
            {'username': self.user.username, 'password': PASSWORD})

    def test_login_returns_cookies_and_never_the_tokens(self):
        response = self.login()

        self.assertEqual(response.status_code, 200)
        # The whole point: handing these to JS in the body would undo it.
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh', response.data)
        # The user comes back instead — the client used to get username/role by
        # decoding the JWT and can't any more.
        self.assertEqual(response.data['username'], 'rita')
        self.assertEqual(response.data['role'], 'USER')

        for name in (settings.AUTH_COOKIE_ACCESS, settings.AUTH_COOKIE_REFRESH):
            cookie = response.cookies[name]
            self.assertTrue(cookie.value)
            self.assertTrue(cookie['httponly'])
        # Scoped so the long-lived credential isn't sent to every endpoint.
        self.assertEqual(
            response.cookies[settings.AUTH_COOKIE_REFRESH]['path'],
            settings.AUTH_COOKIE_REFRESH_PATH)

    def test_the_cookie_alone_authenticates(self):
        self.assertEqual(self.client.get(reverse('profile')).status_code, 401)

        self.login()  # the test client now holds the cookies

        response = self.client.get(reverse('profile'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'rita')
        # No Authorization header was involved at any point.
        self.assertNotIn('HTTP_AUTHORIZATION', self.client._credentials)

    def test_refresh_reads_the_cookie_and_reissues_access(self):
        self.login()
        original = self.client.cookies[settings.AUTH_COOKIE_ACCESS].value

        # No body: the refresh token is httpOnly, so the client couldn't put
        # it there even if it wanted to.
        response = self.client.post(reverse('token_refresh'))

        self.assertEqual(response.status_code, 204)
        reissued = response.cookies[settings.AUTH_COOKIE_ACCESS]
        self.assertTrue(reissued.value)
        self.assertTrue(reissued['httponly'])
        self.assertNotEqual(reissued.value, original)
        self.assertEqual(self.client.get(reverse('profile')).status_code, 200)

    def test_refresh_without_a_cookie_is_rejected(self):
        response = self.client.post(reverse('token_refresh'))
        self.assertEqual(response.status_code, 401)

    def test_logout_clears_both_cookies(self):
        self.login()
        self.assertEqual(self.client.get(reverse('profile')).status_code, 200)

        response = self.client.post(reverse('logout'))

        self.assertEqual(response.status_code, 204)
        for name in (settings.AUTH_COOKIE_ACCESS, settings.AUTH_COOKIE_REFRESH):
            self.assertEqual(response.cookies[name].value, '')
        # And the cleared cookie really is dead, not just blanked in the jar.
        self.assertEqual(self.client.get(reverse('profile')).status_code, 401)


class CsrfEnforcementTests(TestCase):
    """A cookie is sent automatically, so writes have to prove intent.

    This is the half of the httpOnly trade that isn't free: without it, moving
    the token out of localStorage would swap an XSS-exfiltration risk for an
    unguarded CSRF surface and come out behind.
    """

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.admin = CustomUser.objects.create_user(
            username='boss', email='boss@example.com', password=PASSWORD,
            role='ADMIN')
        cache.clear()
        self.client.post(reverse('token_obtain_pair'),
                         {'username': 'boss', 'password': PASSWORD})
        self.payload = {
            'title': 'Arrival', 'genre': 'Sci-Fi', 'director': 'Villeneuve',
            'cast': 'Amy Adams', 'description': 'Heptapods.',
        }

    def tearDown(self):
        cache.clear()

    def csrf_token(self):
        # Planted by ensure_csrf_cookie on the login view; readable by JS on
        # purpose, so the client can echo it back in a header.
        return self.client.cookies['csrftoken'].value

    def test_write_without_the_csrf_header_is_rejected(self):
        response = self.client.post(reverse('movie-list'), self.payload)

        self.assertEqual(response.status_code, 403)
        self.assertIn('CSRF', str(response.data['detail']))

    def test_write_with_the_csrf_header_succeeds(self):
        response = self.client.post(
            reverse('movie-list'), self.payload,
            HTTP_X_CSRFTOKEN=self.csrf_token())

        self.assertEqual(response.status_code, 201)

    def test_reads_need_no_csrf_token(self):
        """Safe methods can't be a CSRF vector, and demanding a token on them
        would break the session-restore call that has to run first."""
        self.assertEqual(self.client.get(reverse('profile')).status_code, 200)
        self.assertEqual(self.client.get(reverse('movie-list')).status_code, 200)

    def test_login_itself_needs_no_csrf_token(self):
        """It has to work for someone who has never held a cookie — including
        the very visitor who is about to be issued one."""
        fresh = APIClient(enforce_csrf_checks=True)
        response = fresh.post(reverse('token_obtain_pair'),
                              {'username': 'boss', 'password': PASSWORD})
        self.assertEqual(response.status_code, 200)

