"""The grand outline as tables: Act → Chapter → Scene → OutlineBeat, plus each
scene's prose in its own SceneContent row.

Readers still see the outline as ONE nested dict (`outline.store.load_outline`
builds it from these rows). The common writers change only their own rows
(`outline.outline_writes`); big merges and templates sync a whole dict back
with `save_outline`. `uid` is the string id that dict uses ("ac-…", "ch-…", "sc-…",
"bt-…"); `position` is the order among siblings (only the order matters).

`created_at` / `updated_at` are the author-edit stamps the dict carries (the
gauges compare them), not row bookkeeping: they change only on a real edit.
`extra` keeps any rarely-used dict key that has no column, so a round trip
never loses data.
"""
from django.db import models


class Act(models.Model):
    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="outline_acts",
        db_index=False,  # covered by the unique constraint (project, uid)
    )
    uid = models.CharField(max_length=100)
    title = models.TextField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "outline_act"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "uid"], name="uniq_outline_act_uid"),
        ]

    def __str__(self) -> str:
        return self.title or self.uid


class Chapter(models.Model):
    """One chapter. `project` is here too so chapter ids are unique per project
    and a chapter can move to another act without changing its id.

    POV: `pov_mode` None = no POV saved. `pov_character` is the real link (a
    rename follows); `pov_name` is the name as saved, shown if the character is
    ever hard-deleted."""

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="outline_chapters",
        db_index=False,  # covered by the unique constraint (project, uid)
    )
    act = models.ForeignKey(Act, on_delete=models.CASCADE, related_name="chapters")
    uid = models.CharField(max_length=100)
    title = models.TextField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    pov_mode = models.CharField(max_length=40, null=True, blank=True)
    pov_name = models.CharField(max_length=200, blank=True)
    pov_character = models.ForeignKey(
        "characters.Character", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="pov_chapters",
    )
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "outline_chapter"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "uid"], name="uniq_outline_chapter_uid"),
        ]

    def __str__(self) -> str:
        return self.title or self.uid


class Scene(models.Model):
    """One scene: the outline's leaf. Its prose is in `SceneContent` (one row,
    loaded only when a reader wants prose). `words` is the stored word count
    (None = never counted); `mention_counts` the stored @mention counts. `entity_links` is the small list of ideas / world
    entries linked to the scene, read and written whole with the scene."""

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="outline_scenes",
        db_index=False,  # covered by the unique constraint (project, uid)
    )
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name="scenes")
    uid = models.CharField(max_length=100)
    title = models.TextField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    words = models.PositiveIntegerField(null=True, blank=True)
    analysis = models.JSONField(null=True, blank=True)
    entity_links = models.JSONField(null=True, blank=True)
    # How often each entity is @mentioned in the prose, e.g.
    # {"character": {"51": 3}}. Worked out from the prose on every prose write
    # (outline_rows.mention_counts); None = no mentions (or not written since).
    mention_counts = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "outline_scene"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "uid"], name="uniq_outline_scene_uid"),
        ]

    def __str__(self) -> str:
        return self.title or self.uid


class SceneContent(models.Model):
    """A scene's prose: the TipTap document the Write page edits.

    `rev` goes up by one every time `doc` changes (a version number, for a
    later "someone else changed this scene" check). `doc_hash` is the hash of
    `doc` (`outline.outline_rows.content_hash`), so a save can tell whether the
    prose changed without reading every scene's prose back from the database."""

    scene = models.OneToOneField(Scene, on_delete=models.CASCADE, related_name="content")
    doc = models.JSONField(null=True, blank=True)
    doc_hash = models.CharField(max_length=64, blank=True)
    rev = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "outline_scenecontent"

    def __str__(self) -> str:
        return f"SceneContent(scene={self.scene_id}, rev={self.rev})"


class OutlineBeat(models.Model):
    """One beat inside a scene. A beat placed from a plot thread links to the
    thread (`thread`, shown as the dict's `from_rough`) and to the thread beat
    (`thread_beat`, `from_item`). Deleting either only clears the link; the
    beat and its text stay (they are the author's outline writing)."""

    scene = models.ForeignKey(Scene, on_delete=models.CASCADE, related_name="beats", db_index=False)
    uid = models.CharField(max_length=100)
    kind = models.CharField(max_length=20, null=True, blank=True)
    text = models.TextField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    # Author toggle: "this beat is written into the prose". None = never set.
    written = models.BooleanField(null=True, blank=True)
    thread = models.ForeignKey(
        "outline.PlotThread", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="outline_beats",
    )
    thread_beat = models.ForeignKey(
        "outline.ThreadBeat", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="outline_beats",
    )
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "outline_outlinebeat"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["scene", "uid"], name="uniq_outline_beat_uid"),
        ]

    def __str__(self) -> str:
        return (self.text or self.uid)[:60]


class SceneRevision(models.Model):
    """One earlier version of a scene's prose (a safety net against lost work).

    Written just before a save replaces the scene's content. Only the newest
    ``settings.SCENE_REVISION_CAP`` per scene are kept; older ones are pruned.
    Deleting the scene deletes its history.
    """

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="scene_revisions",
    )
    scene = models.ForeignKey(
        Scene, on_delete=models.CASCADE, related_name="revisions",
        db_index=False,  # covered by a composite index (see Meta)
    )
    content = models.JSONField()
    content_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "outline_scenerevision"
        indexes = [models.Index(fields=["scene", "-id"], name="outline_scenerev_scene_idx")]

    def __str__(self) -> str:
        return f"SceneRevision(scene={self.scene_id}, id={self.pk})"
