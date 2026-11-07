"""Paragraph-level scene editing for the AI.

The AI reads a scene as an ordered paragraph list (`get_chapter_prose`) and
proposes a batch of paragraph ops (`propose_scene_edits`). Each op fans out into
its own independently-acceptable Proposal; accept applies that one op against the
CURRENT scene by content anchor (not absolute index), so accepts in any order
stay correct. The AI never builds TipTap and never authors references — an edit
preserves the author's existing references by carrying them to the new paragraph.
"""
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from outline.store import load_outline, save_outline

User = get_user_model()

SCENE_ID = "sc1"


def _outline_data():
    """A scene whose first paragraph carries a character mention; second is plain."""
    scene = {
        "id": SCENE_ID,
        "text": "The Workshop",
        "content": {"type": "doc", "content": [
            {"type": "paragraph", "content": [
                {"type": "text", "text": "Tony saw "},
                {"type": "mention",
                 "attrs": {"entityType": "character", "id": 7, "label": "Pepper"}},
                {"type": "text", "text": " there."},
            ]},
            {"type": "paragraph", "content": [
                {"type": "text", "text": "It rained all day."},
            ]},
        ]},
        "words": 5,
    }
    return {"base_template": "three_act", "acts": [
        {"id": "ac1", "text": "Act I", "chapters": [
            {"id": "ch1", "text": "Ch 1", "scenes": [scene]},
        ]},
    ]}


class SceneParagraphEditTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline_data())
        self.sess = ProjectScope(self.project.id)

    def _scene(self):
        from outline.store import load_outline
        go = load_outline(self.sess)
        return go["acts"][0]["chapters"][0]["scenes"][0]

    def _paras(self):
        return self._scene()["content"]["content"]

    # ---- read ------------------------------------------------------------- #

    def test_get_scene_paragraphs_shape(self):
        # The data reader behind get_chapter_prose (one scene's paragraphs).
        from outline.readers import get_scene_paragraphs
        data = get_scene_paragraphs(self.sess, scene_id=SCENE_ID)
        self.assertEqual(data["title"], "The Workshop")
        paras = data["paragraphs"]
        self.assertEqual(len(paras), 2)
        self.assertEqual(paras[0]["index"], 0)
        self.assertEqual(paras[0]["text"], "Tony saw Pepper there.")
        self.assertEqual(paras[0]["refs"],
                         [{"entityType": "character", "id": 7, "label": "Pepper"}])
        self.assertEqual(paras[1]["text"], "It rained all day.")
        self.assertEqual(paras[1]["refs"], [])

    AI_TYPE = "ai-generated"

    def _ai_marker(self, refs):
        return next((r for r in (refs or []) if r.get("entityType") == self.AI_TYPE), None)

    # ---- edit: writes a pending 'ai-generated' green block in place ------- #

    def test_edit_writes_marked_block_carrying_refs(self):
        res = dispatch("propose_scene_edits", {
            "scene_id": SCENE_ID,
            "edits": [{"index": 0, "text": "Tony watched Pepper leave."}],
        }, Actor.USER_BUTTON, self.sess)
        self.assertEqual(res.status, "ran")
        self.assertIn("outline", res.invalidates)
        # A direct WRITE — no rail proposal row; the marked paragraph IS the proposal.
        self.assertEqual(Proposal.objects.filter(project=self.project).count(), 0)

        para0 = self._paras()[0]
        self.assertEqual(para0["content"][0]["text"], "Tony watched Pepper leave.")
        refs = para0["attrs"]["refs"]
        # The author's reference is preserved on the rewritten paragraph...
        self.assertIn({"entityType": "character", "id": 7, "label": "Pepper"}, refs)
        # ...alongside the ai-generated marker, which stashes the original prose.
        marker = self._ai_marker(refs)
        self.assertIsNotNone(marker)
        self.assertEqual(marker["original"], "Tony saw Pepper there.")
        # The scene TITLE is never touched by a prose edit.
        self.assertEqual(self._scene()["text"], "The Workshop")

    def test_edit_unreferenced_paragraph_marked_only(self):
        dispatch("propose_scene_edits", {
            "scene_id": SCENE_ID,
            "edits": [{"index": 1, "text": "The sun blazed."}],
        }, Actor.USER_BUTTON, self.sess)
        para1 = self._paras()[1]
        self.assertEqual(para1["content"][0]["text"], "The sun blazed.")
        # Only the ai-generated marker — no entity refs on this paragraph.
        self.assertEqual([r.get("entityType") for r in para1["attrs"]["refs"]],
                         ["ai-generated"])

    def test_edit_split_into_paragraphs_marks_every_one_pending(self):
        # A rewrite that splits into 2 paragraphs: both pending, so the editor can
        # dismiss each. Only the first stashes the original (dismiss restores it);
        # the extra one has none (dismiss removes it).
        dispatch("propose_scene_edits", {
            "scene_id": SCENE_ID,
            "edits": [{"index": 0, "text": "Tony watched.\n\nPepper left."}],
        }, Actor.USER_BUTTON, self.sess)
        first, extra = self._paras()[0], self._paras()[1]
        self.assertEqual(self._ai_marker(first["attrs"]["refs"])["original"],
                         "Tony saw Pepper there.")
        self.assertEqual(extra["content"][0]["text"], "Pepper left.")
        self.assertEqual(extra["attrs"]["refs"], [{"entityType": "ai-generated"}])

    def test_edit_batch_applies_all(self):
        dispatch("propose_scene_edits", {
            "scene_id": SCENE_ID,
            "edits": [
                {"index": 0, "text": "First rewritten."},
                {"index": 1, "text": "Second rewritten."},
            ],
        }, Actor.USER_BUTTON, self.sess)
        texts = [p["content"][0]["text"] for p in self._paras()]
        self.assertEqual(texts, ["First rewritten.", "Second rewritten."])
        self.assertTrue(all(self._ai_marker(p["attrs"]["refs"]) for p in self._paras()))

    # ---- insert: marked 'ai-generated', written straight into the scene --- #

    AI_REF = {"entityType": "ai-generated"}

    def test_insert_writes_marked_paragraph_directly(self):
        # A direct WRITE (not a proposal): the marked paragraph lands in the doc
        # immediately for the editor to render as a pending block. New API:
        # `paragraphs` (plain strings) + `position` (insert-before index).
        res = dispatch("insert_scene_paragraphs", {
            "scene_id": SCENE_ID,
            "paragraphs": ["A knock at the door."],
            "position": 1,
        }, Actor.CHAT, self.sess)
        self.assertEqual(res.status, "ran")
        self.assertIn("outline", res.invalidates)
        # No Proposal row — inserts don't use the rail.
        self.assertEqual(Proposal.objects.filter(project=self.project).count(), 0)

        paras = self._paras()
        self.assertEqual(len(paras), 3)
        self.assertEqual(paras[1]["content"][0]["text"], "A knock at the door.")
        # Marked 'ai-generated' so the editor renders it as a pending block.
        self.assertEqual(paras[1]["attrs"]["refs"], [self.AI_REF])

    def test_insert_multiple_lands_as_contiguous_block(self):
        # Phase 5: `paragraphs` insert as a CONTIGUOUS, in-order block at `position`.
        dispatch("insert_scene_paragraphs", {
            "scene_id": SCENE_ID,
            "paragraphs": ["Morning broke.", "Then silence."],
            "position": 0,
        }, Actor.CHAT, self.sess)
        paras = self._paras()
        self.assertEqual(len(paras), 4)
        # Both inserted (marked) paragraphs land contiguously at the top, in order.
        self.assertEqual(paras[0]["content"][0]["text"], "Morning broke.")
        self.assertEqual(paras[0]["attrs"]["refs"], [self.AI_REF])
        self.assertEqual(paras[1]["content"][0]["text"], "Then silence.")
        self.assertEqual(paras[1]["attrs"]["refs"], [self.AI_REF])
        # The originals follow, untouched (no ai marker) and in order.
        self.assertNotIn("refs", paras[2].get("attrs", {}))  # the Tony paragraph
        self.assertEqual(paras[3]["content"][0]["text"], "It rained all day.")

    def test_propose_scene_edits_rejects_insert_mode(self):
        # Inserts must go through insert_scene_paragraphs now.
        res = dispatch("propose_scene_edits", {
            "scene_id": SCENE_ID,
            "edits": [{"mode": "insert", "index": 1, "text": "nope"}],
        }, Actor.USER_BUTTON, self.sess)
        self.assertEqual(res.status, "error")
        self.assertIn("insert_scene_paragraphs", res.error)

    # ---- guard rails ------------------------------------------------------ #

    def test_edit_out_of_range_index_errors(self):
        res = dispatch("propose_scene_edits", {
            "scene_id": SCENE_ID,
            "edits": [{"index": 9, "text": "nope"}],
        }, Actor.USER_BUTTON, self.sess)
        self.assertEqual(res.status, "error")

    # ---- production path: real saved session (locked write) --------------- #

    def test_real_session_direct_write_persists(self):
        """The path the frontend drives: the AI rewrite is a direct WRITE that
        persists the marked paragraph through the locked write — no rail accept."""


        sess = ProjectScope(self.project.id)

        res = dispatch("propose_scene_edits", {
            "scene_id": SCENE_ID,
            "edits": [{"index": 0, "text": "Tony watched Pepper leave."}],
        }, Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "ran")
        self.assertIn("outline", res.invalidates)

        para0 = load_outline(SimpleNamespace(project_id=self.project.pk))["acts"][0]["chapters"][0]["scenes"][0]["content"]["content"][0]
        self.assertEqual(para0["content"][0]["text"], "Tony watched Pepper leave.")
        self.assertEqual(para0["attrs"]["refs"][-1]["entityType"], "ai-generated")
        # No rail proposal row was created.
        self.assertEqual(Proposal.objects.filter(project=self.project).count(), 0)
