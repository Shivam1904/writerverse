"""Night Eyes endpoints are scoped to the project's owner (SA-43).

Every view in `night_eyes/stream.py` takes `project_pk` from the URL. Before
SA-43 none of them checked who owned that project, so any logged-in user could
read another author's chat threads and pending proposals, accept/reject their
proposals, or run (and bill) a chat turn on their manuscript just by changing
the number. Now user B gets a 404 on user A's project, on every endpoint, and
nothing is created, changed or charged on A's side.
"""
import uuid

from actions.models import ProjectDomainVersion, Proposal
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework.test import APIClient

from night_eyes.models import ChatThread

User = get_user_model()


class NightEyesOwnershipTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@e.com", password="x")
        self.stranger = User.objects.create_user(email="stranger@e.com", password="x")
        self.project = Project.objects.create(title="Owner's book", user=self.owner)
        self.thread = ChatThread.objects.create(
            project=self.project, thread_id=uuid.uuid4(), title="Private", page="default",
        )
        self.proposal = Proposal.objects.create(
            project=self.project, thread_id=self.thread.thread_id, capability="update_character",
        )
        self.base = f"/api/consistency/projects/{self.project.pk}"
        self.client = APIClient()
        self.client.force_authenticate(self.stranger)

    def test_stranger_gets_404_on_every_read(self):
        for url in [
            f"{self.base}/threads/",
            f"{self.base}/threads/{self.thread.thread_id}/messages/",
            f"{self.base}/pending-proposals/",
            f"{self.base}/frame/?page=braindumps",
        ]:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_stranger_gets_404_on_every_write_and_nothing_changes(self):
        for url, body in [
            (f"{self.base}/chat/", {"message": "rewrite chapter one", "page": "default"}),
            (f"{self.base}/ping-answer/",
             {"thread_id": str(self.thread.thread_id), "answer": "yes"}),
        ]:
            with self.subTest(url=url):
                self.assertEqual(self.client.post(url, body, format="json").status_code, 404)
        self.proposal.refresh_from_db()
        self.assertEqual(self.proposal.status, Proposal.STATUS_PROPOSED)
        self.assertFalse(ProjectDomainVersion.objects.filter(project=self.project).exists())
        self.assertEqual(ChatThread.objects.filter(project=self.project).count(), 1)

    def test_owner_still_reads_their_own_project(self):
        self.client.force_authenticate(self.owner)
        threads = self.client.get(f"{self.base}/threads/")
        self.assertEqual(threads.status_code, 200)
        self.assertEqual(len(threads.json()["threads"]), 1)
        pending = self.client.get(f"{self.base}/pending-proposals/")
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(len(pending.json()["proposals"]), 1)
        frame = self.client.get(f"{self.base}/frame/?page=braindumps")
        self.assertEqual(frame.status_code, 200)


class ThreadDeleteTests(TestCase):
    def test_deleting_a_thread_deletes_its_proposals_only(self):
        owner = User.objects.create_user(email="del@e.com", password="x")
        project = Project.objects.create(title="Del", user=owner)
        thread = ChatThread.objects.create(project=project, thread_id=uuid.uuid4())
        Proposal.objects.create(project=project, thread_id=thread.thread_id, capability="x")
        keep = Proposal.objects.create(project=project, capability="y")  # a button proposal
        thread.delete()
        self.assertEqual(list(Proposal.objects.values_list("pk", flat=True)), [keep.pk])
