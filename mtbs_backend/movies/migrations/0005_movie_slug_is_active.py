from django.db import migrations, models
from django.utils.text import slugify

# Re-declared rather than imported from movies.models: a historical model has
# no save() override to lean on, and a migration that imports live code
# silently changes meaning the day that code does.
SLUG_MAX_LENGTH = 280


def backfill_slugs(apps, schema_editor):
    """Give every existing movie a URL slug.

    Runs while `slug` is still nullable, so the AlterField that follows finds a
    full column and the NOT NULL applies cleanly.
    """
    Movie = apps.get_model('movies', 'Movie')
    taken = set(Movie.objects.exclude(slug=None).values_list('slug', flat=True))
    for movie in Movie.objects.filter(slug=None).order_by('pk'):
        base = slugify(movie.title)[:SLUG_MAX_LENGTH - 8] or f'movie-{movie.pk}'
        candidate = base
        counter = 2
        while candidate in taken:
            candidate = f'{base}-{counter}'
            counter += 1
        taken.add(candidate)
        movie.slug = candidate
        movie.save(update_fields=['slug'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('movies', '0004_movie_movies_movi_title_652549_idx'),
    ]

    operations = [
        # Nullable first. A unique constraint permits many NULLs, which is what
        # lets this land on a table that already has rows in it.
        migrations.AddField(
            model_name='movie',
            name='slug',
            field=models.SlugField(max_length=SLUG_MAX_LENGTH, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='movie',
            name='is_active',
            field=models.BooleanField(
                default=True,
                help_text='Unticked films are hidden from the catalogue but keep their bookings.',
            ),
        ),
        migrations.RunPython(backfill_slugs, noop),
        migrations.AlterField(
            model_name='movie',
            name='slug',
            field=models.SlugField(blank=True, max_length=SLUG_MAX_LENGTH, unique=True),
        ),
    ]
