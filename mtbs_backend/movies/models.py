from django.db import models
from django.utils.text import slugify

# Room for a long title plus the "-2" disambiguator appended on collision.
SLUG_MAX_LENGTH = 280


class Movie(models.Model):
    title = models.CharField(max_length=255)
    # The public URL: /movies/interstellar rather than /movies/3. Blank is
    # allowed on input only — save() fills it before the row ever lands.
    slug = models.SlugField(max_length=SLUG_MAX_LENGTH, unique=True, blank=True)
    # Soft delete. Removing a movie outright would cascade through its
    # showtimes and take every booking made against them with it, so the
    # catalogue hides the film and the history stays readable.
    is_active = models.BooleanField(
        default=True,
        help_text='Unticked films are hidden from the catalogue but keep their bookings.',
    )
    genre = models.CharField(max_length=100, help_text='Comma-separated, e.g. "Action, Sci-Fi"')
    language = models.CharField(max_length=100, blank=True, help_text='Comma-separated, e.g. "English, Hindi"')
    director = models.CharField(max_length=100)
    cast = models.TextField(help_text='Comma-separated cast names')
    description = models.TextField()
    duration_minutes = models.PositiveIntegerField(null=True, blank=True, help_text='Runtime in minutes')
    release_date = models.DateField(null=True, blank=True)
    poster_url = models.URLField(blank=True, null=True)
    trailer_url = models.URLField(blank=True, null=True, help_text='YouTube or any video link')

    class Meta:
        ordering = ['title']
        # Every listing sorts by title, so this turns a full sort into an
        # index scan as the catalogue grows.
        #
        # Deliberately no index on genre/language: those are filtered with
        # `icontains`, which is a leading-wildcard LIKE and cannot use a
        # B-tree index. Speeding those up needs a trigram/full-text index,
        # which is a Postgres decision, not a portable one.
        indexes = [models.Index(fields=['title'])]

    def build_slug(self):
        """A unique URL slug for this title.

        Titles are not unique — two remakes share one — so a collision appends
        a counter rather than raising. `slugify` strips everything non-ASCII,
        which can leave nothing at all (a CJK-only title), hence the pk/'movie'
        fallback: a blank slug would collide with every other blank one.
        """
        base = slugify(self.title)[:SLUG_MAX_LENGTH - 8] or f'movie-{self.pk or ""}'.rstrip('-')
        candidate = base or 'movie'
        # Excluding self keeps a re-save from bumping its own slug to "-2".
        siblings = Movie.objects.exclude(pk=self.pk) if self.pk else Movie.objects.all()
        counter = 2
        while siblings.filter(slug=candidate).exists():
            candidate = f'{base}-{counter}'
            counter += 1
        return candidate

    def save(self, *args, **kwargs):
        # Only when absent: an existing slug is a published URL, and silently
        # rewriting it on every title edit would break links already in the
        # wild. An admin who wants a new one clears the field.
        if not self.slug:
            self.slug = self.build_slug()
            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = set(update_fields) | {'slug'}
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
