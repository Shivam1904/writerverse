"""link_scene_entity / unlink_scene_entity — an idea or world entry attached to
a scene is stored on the scene as `entity_links`, comes back from
get_grand_outline (so it survives a reload), can be removed, and never touches
the scene's prose (SA-87)."""
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.test import TestCase

PROSE = {"type": "doc", "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "She ran."}]},
]}


def _outline_data():
    return {"base_template": "three_act", "acts": [
        {"id": "ac1", "text": "Act I", "chapters": [
            {"id": "ch1", "text": "Ch 1", "scenes": [
                {"id": "sc1", "text": "S", "words": 2, "content": PROSE, "beats": []},
            ]},
        ]},
    ]}


class SceneEntityLinkTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        from outline.store import save_outline
        user = get_user_model().objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline_data())
        self.sess = ProjectScope(self.project.id)

    def _op(self, name, **args):
        return dispatch(name, args, Actor.USER_BUTTON, self.sess)

    def _scene_from_read(self):
        res = self._op("get_grand_outline")
        return res.result["grand_outline"]["acts"][0]["chapters"][0]["scenes"][0]

    def test_link_persists_and_is_read_back(self):
        res = self._op("link_scene_entity", scene_id="sc1",
                       link_type="braindump", link_id=7)
        self.assertEqual(res.status, "ran")
        expected = [{"link_type": "braindump", "link_id": 7}]
        self.assertEqual(res.result["entity_links"], expected)

        scene = self._scene_from_read()
        self.assertEqual(scene["entity_links"], expected)
        self.assertEqual(scene["content"], PROSE)  # prose untouched

    def test_link_twice_is_a_noop(self):
        self._op("link_scene_entity", scene_id="sc1", link_type="worldbuilding", link_id=3)
        self._op("link_scene_entity", scene_id="sc1", link_type="worldbuilding", link_id="3")
        self.assertEqual(len(self._scene_from_read()["entity_links"]), 1)

    def test_unlink_removes_only_that_link(self):
        self._op("link_scene_entity", scene_id="sc1", link_type="braindump", link_id=1)
        self._op("link_scene_entity", scene_id="sc1", link_type="worldbuilding", link_id=1)
        res = self._op("unlink_scene_entity", scene_id="sc1",
                       link_type="braindump", link_id=1)
        self.assertEqual(res.status, "ran")
        scene = self._scene_from_read()
        self.assertEqual(scene["entity_links"],
                         [{"link_type": "worldbuilding", "link_id": 1}])
        self.assertEqual(scene["content"], PROSE)

    def test_bad_input_is_refused(self):
        from actions.capabilities.spec import CapabilityError
        cases = [
            {"scene_id": "nope", "link_type": "braindump", "link_id": 1},
            {"scene_id": "sc1", "link_type": "character", "link_id": 1},
            {"scene_id": "sc1", "link_type": "braindump", "link_id": "x"},
        ]
        for args in cases:
            with self.subTest(args=args):
                try:
                    res = self._op("link_scene_entity", **args)
                except CapabilityError:
                    continue
                self.assertNotEqual(res.status, "ran")
        self.assertNotIn("entity_links", self._scene_from_read())
