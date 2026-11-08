from django.db import models


class CharacterRelationship(models.Model):
    """One directed link between two characters in the same project.

    Directed on purpose: "Ana is a mentor to Ben" is not the same fact as "Ben is
    a mentor to Ana". The row belongs to `from_character` (the page where the
    author typed it); the other character's page shows it as an incoming link.

    Both ends are foreign keys, so a rename never breaks a link, and hard-deleting
    either character deletes the row. A soft-deleted character (the 10-second
    Undo window) keeps its rows; readers hide links to it, and Undo brings them
    back.
    """

    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE,
        related_name='character_relationships', db_index=False,
    )
    from_character = models.ForeignKey(
        'characters.Character', on_delete=models.CASCADE, related_name='relationships_out',
    )
    to_character = models.ForeignKey(
        'characters.Character', on_delete=models.CASCADE, related_name='relationships_in',
    )
    label = models.CharField(
        max_length=60,
        help_text='How from_character relates to to_character, e.g. "rival", "mentor to".',
    )
    note = models.TextField(blank=True, default='')
    position = models.PositiveIntegerField(default=0, help_text='Order on the from_character page.')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['from_character_id', 'position', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['from_character', 'to_character', 'label'],
                name='unique_character_relationship',
            ),
            models.CheckConstraint(
                condition=~models.Q(from_character=models.F('to_character')),
                name='character_relationship_not_self',
            ),
        ]

    def __str__(self):
        return f"{self.from_character_id} -[{self.label}]-> {self.to_character_id}"
