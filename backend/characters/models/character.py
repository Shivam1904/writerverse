from django.db import models

# Blue-family identity shades auto-assigned to new characters so the cast reads
# as "people = blue" (the `characters` aspect) while staying mutually
# distinguishable. Picked by creation order (count % len) so consecutive
# characters differ; the author can override via the colour picker. Kept in the
# blue band on purpose — mirrors theme/aspects.ts. Theme-independent hex.
CHARACTER_COLOR_SHADES = [
    '#4a72b0',  # base people-blue (the characters aspect)
    '#3f5e96',  # deep indigo-blue
    '#5b86c4',  # cornflower
    '#3d7d9a',  # steel blue-teal
    '#6a6fb0',  # periwinkle
    '#4a8aa8',  # blue leaning teal
]


class LiveCharacterManager(models.Manager):
    """Default manager: hides characters the author deleted (soft delete, so
    the 10-second Undo can bring them back). Use `all_objects` to see them."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Character(models.Model):
    """Character within a project with supporting metadata."""

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('archived', 'Archived'),
    ]

    name = models.CharField(max_length=100, help_text="Character name")
    description = models.TextField(blank=True, help_text="Character description")
    appearance = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Physical appearance as a small dict. A free-text `description` is "
            "enough on its own; the rest are optional structured slots: age, "
            "gender, build, hair, eyes, clothing, home, costumes, features."
        ),
    )
    pnote = models.TextField(blank=True, help_text="Planning note")
    summary = models.TextField(blank=True, help_text="Summary")
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='characters', db_index=False)
    type = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Character type (e.g., Protagonist, Antagonist, Supporting)"
    )
    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default='active',
        help_text="Character status"
    )
    story = models.TextField(blank=True, default='', help_text="The character's story arc or background (the external/outer arc)")
    internal_arc = models.TextField(blank=True, default='', help_text="The character's internal/emotional arc — the inner belief/need that changes")
    backstory = models.TextField(blank=True, default='', help_text="What happened before page one that the book is still answering")
    want = models.TextField(blank=True, default='', help_text="What the character wants")
    want_items = models.JSONField(
        default=list,
        blank=True,
        help_text="List of outline draft item IDs related to what the character wants"
    )
    need = models.TextField(blank=True, default='', help_text="What the character needs")
    need_items = models.JSONField(
        default=list,
        blank=True,
        help_text="List of outline draft item IDs related to what the character needs"
    )
    misbelief = models.TextField(blank=True, default='', help_text="The character's misbelief or false belief")
    misbelief_items = models.JSONField(
        default=list,
        blank=True,
        help_text="List of outline draft item IDs related to the character's misbelief"
    )
    permanent_traits = models.JSONField(
        default=dict,
        help_text="Permanent traits that never change (e.g., eye color, birth date)"
    )
    evolving_states = models.JSONField(
        default=dict,
        help_text="Evolving states that can change (e.g., location, mood, injuries)"
    )
    is_main_character = models.BooleanField(default=False, help_text="Is this a main character?")
    is_protagonist = models.BooleanField(default=False, help_text="Is this the protagonist?")
    is_antagonist = models.BooleanField(default=False, help_text="Is this the antagonist?")
    voice_profile = models.JSONField(
        default=dict,
        help_text="Voice characteristics (lexicon, sentence length, taboo words, pet phrases)"
    )
    relationship_notes = models.TextField(
        blank=True,
        default='',
        help_text="Freeform author notes on this character's relationships and connections"
    )
    aliases = models.JSONField(
        default=list,
        blank=True,
        help_text="Other names this character goes by. Each entry is {name} for a plain-text "
                  "alias, or {name, character_id} when the alias references another character."
    )
    portrait_url = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text="URL of an AI-generated (transparent-background) portrait for this character."
    )
    color = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text="Identity colour for this character (hex or CSS token). Auto-assigned "
                  "a distinct blue-family shade on creation; author-overridable. Its "
                  "character-scoped threads mirror this colour."
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when the author deletes the character; cleared by Undo. "
                  "Deleted rows are hidden from `objects`.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = LiveCharacterManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        # Names are unique among live characters only, so the author can delete
        # "Mira" and add a new "Mira" straight away.
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'name'],
                condition=models.Q(deleted_at__isnull=True),
                name='unique_live_character_name',
            ),
        ]
        indexes = [
            models.Index(fields=['project', 'is_main_character']),
            models.Index(fields=['project', 'name']),
            models.Index(fields=['project', 'status']),
        ]

    def save(self, *args, **kwargs):
        # Auto-assign a distinct blue-family shade on first save when the author
        # hasn't picked one. Covers every create path (viewset, capability,
        # generated, direct create) since they all funnel through save().
        if not self.pk and not self.color and self.project_id:
            n = Character.objects.filter(project_id=self.project_id).count()
            self.color = CHARACTER_COLOR_SHADES[n % len(CHARACTER_COLOR_SHADES)]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name}"

