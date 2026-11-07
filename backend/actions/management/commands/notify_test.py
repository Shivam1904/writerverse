"""Seed a few demo notifications for a project so the rail + bell are visible.

    uv run python manage.py notify_test --project 9
"""

from django.core.management.base import BaseCommand
from notifications.notifications import create_notification
from projects.models import Project

DEMOS = [
    {
        "slug": "characters",
        "title": "A character drifted",
        "content": (
            "**Mara Vance** hasn't appeared since *Chapter 4*.\n\n"
            "- Last seen at the harbor\n"
            "- Her thread is still open\n\n"
            "Want to place her, or let the thread close?"
        ),
        "target_url": "characters",
    },
    {
        "slug": "outline",
        "title": "Act II is thin",
        "content": "### Coverage gap\nAct II has **2 scenes** but expects ~6. The midpoint beat has no scene yet.",
        "target_url": "outline",
    },
    {
        "slug": "success",
        "title": "Backup complete",
        "content": "Your story bible was **snapshotted** just now. Nothing to do.",
        "target_url": "",
    },
    {
        "slug": "info",
        "title": "New lens available",
        "content": "A **tone** lens can now watch Chapter 7 against its neighbours.",
        "target_url": "lenses",
    },
]


class Command(BaseCommand):
    help = "Seed demo notifications for a project."

    def add_arguments(self, parser):
        parser.add_argument("--project", type=int, required=True)

    def handle(self, *args, **opts):
        project = Project.objects.get(id=opts["project"])
        for d in DEMOS:
            n = create_notification(project, **d)
            self.stdout.write(self.style.SUCCESS(f"  + #{n.id} {n.slug}"))
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(DEMOS)} notifications for project {project.id}."))
