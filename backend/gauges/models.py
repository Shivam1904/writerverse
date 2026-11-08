"""Gauge tables — one row per preset, binding, candidate, analysis and data point.

The rest of the app still works with ONE plain dict per project
(`{presets, bindings, suggested, invented, analyses}`); `gauges/store.py`
turns these rows into that dict and back. Every model keeps the keys it has
no column for in a JSON field (`config` / `extra` / `spec` / `summary`), so
nothing the writers put in the dict is lost.
"""
from django.db import models


class GaugePreset(models.Model):
    """One lens in the author's own bank (a reusable config). `uid` is the id
    the bindings point at (`ref.id`)."""

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="gauge_presets",
        db_index=False,  # covered by the unique constraint
    )
    uid = models.CharField(max_length=200)
    name = models.CharField(max_length=300, blank=True)
    type_id = models.CharField(max_length=80, blank=True)
    # Every other config key (axis, y_items, rules, the AI heads, …).
    config = models.JSONField(default=dict, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "uid"], name="uniq_gauge_preset_uid"),
        ]

    def __str__(self) -> str:
        return self.name or self.uid


class GaugeBinding(models.Model):
    """One gauge on the board: a preset (`ref`) pointed at a scope.

    `binding_id` is the key every caller uses (the analysis is filed under it).
    It is set once, when the gauge is bound, and never rebuilt — so it may
    still hold a character's OLD name after a rename. Don't read the scope out
    of it; read `scope_name`.

    For a character scope, `character` is the real link: the store reads the
    character's current name, so a rename shows up on the gauge. `scope_name`
    stays as the label if the character is ever hard-deleted.
    """

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="gauge_bindings",
        db_index=False,  # covered by the unique constraint
    )
    binding_id = models.CharField(max_length=500)
    ref_kind = models.CharField(max_length=40, blank=True)
    ref_id = models.CharField(max_length=200, blank=True)
    scope_type = models.CharField(max_length=40, blank=True)
    scope_name = models.CharField(max_length=300, blank=True)
    character = models.ForeignKey(
        "characters.Character", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="gauge_bindings",
    )
    thread_ref = models.CharField(max_length=200, blank=True)
    source = models.CharField(max_length=40, blank=True)
    bound_at = models.DateTimeField(null=True, blank=True)
    # pair, block_key, visual, report_view, and anything else.
    extra = models.JSONField(default=dict, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "binding_id"], name="uniq_gauge_binding_id"),
        ]

    def __str__(self) -> str:
        return self.binding_id


class GaugeCandidate(models.Model):
    """One entry in the `suggested` or `invented` list (a lens the AI offered;
    accepting it makes a preset)."""

    KIND_CHOICES = [("suggested", "Suggested"), ("invented", "Invented")]

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="gauge_candidates",
        db_index=False,  # covered by the unique constraint
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    uid = models.CharField(max_length=200)
    # Every other key (lens_id / scope / reason / fit, or the full invented spec).
    spec = models.JSONField(default=dict, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "kind", "uid"], name="uniq_gauge_candidate_uid"),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.uid}"


class GaugeAnalysis(models.Model):
    """The latest analysis of one binding. Re-analysing replaces it."""

    binding = models.OneToOneField(GaugeBinding, on_delete=models.CASCADE, related_name="analysis")
    verdict = models.TextField(blank=True)
    score = models.FloatField(null=True, blank=True)
    analysed_at = models.DateTimeField(null=True, blank=True)
    # coverage, pairs, rules, offending, deferred, partial, and anything else.
    summary = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name_plural = "gauge analyses"

    def __str__(self) -> str:
        return f"analysis of {self.binding_id}"


class GaugeDataPoint(models.Model):
    """One value on a chart: what the analysis read at one tick (a scene, beat,
    chapter, …). One row per tick, so an analysis holds at most one point per
    tick of the book.

    `scene` is the scene the point is about (empty for a tick that is not a
    scene). Deleting the scene deletes its points (CASCADE), so a chart never
    points at a scene that is gone."""

    analysis = models.ForeignKey(
        GaugeAnalysis, on_delete=models.CASCADE, related_name="points",
        db_index=False,  # covered by the unique constraint
    )
    position = models.PositiveIntegerField(default=0)
    tick_id = models.CharField(max_length=200, blank=True)
    scene = models.ForeignKey(
        "outline.Scene", null=True, blank=True,
        on_delete=models.CASCADE, related_name="gauge_points",
    )
    value = models.JSONField(null=True, blank=True)
    confidence = models.FloatField(null=True, blank=True)
    reasoning = models.TextField(blank=True)
    # values (the full per-tick list), and anything else.
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["analysis", "position"], name="uniq_gauge_point_position"),
        ]

    def __str__(self) -> str:
        return f"{self.tick_id or self.position}"
