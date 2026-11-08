from django.db import models
from django.db.models.functions import Lower


class StoryItem(models.Model):
    """An object that matters to the story ("the Memory Stones"), accepted by the
    author from the AI's first read of their braindumps."""

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="story_items",
        db_index=False,  # covered by a composite index (see Meta)
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "worldbuilding_storyitem"
        ordering = ["id"]  # = the order the author accepted them
        constraints = [
            models.UniqueConstraint(
                "project", Lower("name"), name="uniq_story_item_name_per_project",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class StoryRule(models.Model):
    """A rule of the story's world ("magic costs memories"), accepted by the
    author from the AI's first read of their braindumps."""

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="story_rules",
        db_index=False,  # covered by a composite index (see Meta)
    )
    text = models.TextField()
    scope = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "worldbuilding_storyrule"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                "project", Lower("text"), name="uniq_story_rule_text_per_project",
            ),
        ]

    def __str__(self) -> str:
        return self.text[:60]
