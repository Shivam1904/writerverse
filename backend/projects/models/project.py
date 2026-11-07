"""
Project-related models: Project
"""

from django.contrib.auth import get_user_model
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

User = get_user_model()


class Project(models.Model):
    """
    Writing project model - represents a complete writing project (novel, story, etc.)
    """
    STATUS_CHOICES = [
        ('imagine', 'Imagine'),
        ('plan', 'Plan'),
        ('write', 'Write'),
        ('completed', 'Completed'),
        ('paused', 'Paused'),
        ('abandoned', 'Abandoned'),
    ]

    # Story-craft metadata (edited from the World page "more metadata" form)
    PERSPECTIVE_CHOICES = [
        ('first', 'First person'),
        ('second', 'Second person'),
        ('third-limited', 'Third person — limited'),
        ('third-omniscient', 'Third person — omniscient'),
        ('multiple', 'Multiple / alternating'),
    ]

    TENSE_CHOICES = [
        ('past', 'Past'),
        ('present', 'Present'),
        ('mixed', 'Mixed'),
    ]

    AUDIENCE_CHOICES = [
        ('children', 'Children'),
        ('middle-grade', 'Middle grade'),
        ('young-adult', 'Young adult'),
        ('adult', 'Adult'),
        ('general', 'General'),
    ]

    # Core fields
    title = models.CharField(max_length=200, help_text="Project title")
    description = models.TextField(blank=True, help_text="Project description")
    synopsis = models.TextField(blank=True, help_text="Project synopsis or summary")
    # Multiple genre and tone support
    genres = models.JSONField(
        default=list,
        blank=True,
        help_text="List of genres (allows multiple selections)"
    )
    tones = models.JSONField(
        default=list,
        blank=True,
        help_text="List of tones — the story's mood (dark, hopeful, comedic…)"
    )
    themes = models.JSONField(
        default=list,
        blank=True,
        help_text="List of themes — what the story is about (betrayal, identity…). "
                  "Distinct from `tones` (mood) and the legacy single `theme` text."
    )
    # Story-craft fields (see *_CHOICES above). All optional / secondary.
    logline = models.CharField(
        max_length=300, blank=True,
        help_text="One-sentence pitch or hook for the story"
    )
    perspective = models.CharField(
        max_length=20, choices=PERSPECTIVE_CHOICES, blank=True,
        help_text="Narrative point of view"
    )
    tense = models.CharField(
        max_length=10, choices=TENSE_CHOICES, blank=True,
        help_text="Narrative tense"
    )
    audience = models.CharField(
        max_length=20, choices=AUDIENCE_CHOICES, blank=True,
        help_text="Intended readership"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='imagine')

    # User relationship
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects', db_index=False)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Set when the author moves the book to "Deleted books". The book and all
    # its data stay; only an archived book can be permanently deleted.
    archived_at = models.DateTimeField(null=True, blank=True)

    # Project settings
    target_word_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(100), MaxValueValidator(1000000)],
        help_text="Target word count for the project"
    )

    # Statistics (calculated fields)
    total_word_count = models.PositiveIntegerField(default=0)
    total_acts = models.PositiveIntegerField(default=0)
    total_chapters = models.PositiveIntegerField(default=0)
    total_scenes = models.PositiveIntegerField(default=0)

    # Outline settings (the outline itself is in the outline app's tables).
    # Read and written only through outline.store.
    outline_base_template = models.CharField(
        max_length=50, blank=True,
        help_text="The structure the outline was started from (e.g. three_act). Blank = no outline yet.",
    )
    pov_default = models.JSONField(
        default=dict, blank=True,
        help_text="POV a new chapter starts with: {mode, character, character_id?}.",
    )
    scene_pipelines = models.JSONField(
        default=dict, blank=True,
        help_text="On/off switch per scene analysis pipeline: {<key>: bool}.",
    )

    # Book configuration stored as a single JSON blob.
    # The only key in use is "page" (PageEstimate fields including calculated results).
    book_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Book metadata, style, and page-estimate settings merged into one JSON blob."
    )

    # AI Tool Settings (dev-only)
    ai_tool_settings = models.JSONField(
        default=dict,
        blank=True,
        help_text="Dev-only settings for toggling AI tools on/off. Shape: {disabled_tools: [], disabled_planners: []}"
    )

    class Meta:
        ordering = ['-updated_at', '-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['user', 'created_at']),
        ]

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"
