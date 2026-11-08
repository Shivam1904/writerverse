from django.db import models


class WorldBlock(models.Model):
    """One World-page heading the author added or restyled (e.g. "Calendar").

    Built-in headings (Places, Factions…) live in code; a row exists only when
    the author registered a heading or overrode its label/hint/glyph/color.
    Blank fields mean "no override".
    """

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="world_blocks",
        db_index=False,  # covered by a composite index (see Meta)
    )
    # Canonical key from block_key(): trimmed, lower-cased ("sacred sites").
    name = models.CharField(max_length=200)
    label = models.CharField(max_length=200, blank=True)
    hint = models.CharField(max_length=500, blank=True)
    glyph = models.CharField(max_length=100, blank=True)
    color = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "worldbuilding_worldblock"
        ordering = ["id"]  # = the order the author added them
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"], name="uniq_world_block_per_project",
            ),
        ]

    def __str__(self) -> str:
        return f"WorldBlock(project={self.project_id}, name={self.name!r})"

    def to_dict(self) -> dict:
        """The dict shape readers expect: `name` plus only the overrides set."""
        out = {"name": self.name}
        for f in ("label", "hint", "glyph", "color"):
            val = getattr(self, f)
            if val:
                out[f] = val
        return out
