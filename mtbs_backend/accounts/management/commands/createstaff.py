"""Create (or promote) a ticket-staff account.

Self-registration is hard-coded to ROLE_USER — deliberately, since a writable
`role` on a public endpoint would let anyone mint themselves an admin. That
leaves no way to make a staff account outside the Django admin site, which is
what this command is for:

    python manage.py createstaff usher1
    python manage.py createstaff usher1 --email door@cinema.test

Promoting an existing account needs --promote, so a typo in a username can't
silently strip a customer of their booking history by turning them into staff.
"""
import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Create a ticket-staff account, or promote an existing user to one.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--email', default='')
        parser.add_argument(
            '--password',
            help='Skip the prompt. Avoid on a shared machine — it lands in your '
                 'shell history.',
        )
        parser.add_argument(
            '--promote', action='store_true',
            help='Change an existing account to ticket staff instead of failing.',
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options['username']
        existing = User.objects.filter(username=username).first()

        if existing:
            if not options['promote']:
                raise CommandError(
                    f'User "{username}" already exists. Re-run with --promote to '
                    f'change their role from {existing.role} to STAFF.')
            if existing.is_superuser:
                # Demoting a superuser would be a no-op anyway: `is_admin`
                # returns True for them regardless of role, so the result would
                # be an account that looks like staff and behaves like an admin.
                raise CommandError(
                    f'"{username}" is a Django superuser, which outranks the role '
                    f'field. Remove superuser status first if that is intended.')
            existing.role = User.ROLE_STAFF
            existing.save(update_fields=['role'])
            self.stdout.write(self.style.SUCCESS(
                f'"{username}" is now ticket staff.'))
            return

        password = options['password'] or self._prompt_password()
        user = User.objects.create_user(
            username=username, email=options['email'], password=password,
            role=User.ROLE_STAFF)
        self.stdout.write(self.style.SUCCESS(
            f'Created ticket-staff account "{user.username}". '
            f'They can sign in and scan tickets — nothing else.'))

    def _prompt_password(self):
        """Ask twice, and run the project's own validators.

        `create_user` hashes whatever it is given without checking strength, so
        without this a door account could end up with a weaker password than
        the register endpoint would ever have accepted.
        """
        while True:
            password = getpass.getpass('Password: ')
            if password != getpass.getpass('Password (again): '):
                self.stderr.write('Passwords do not match. Try again.')
                continue
            try:
                validate_password(password)
            except ValidationError as exc:
                for message in exc.messages:
                    self.stderr.write(f'  {message}')
                continue
            return password
