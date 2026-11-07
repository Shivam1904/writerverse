"""Scene analysis pipelines — the on-save framework (factory + fan-out + switches).

Verifies the reusable plumbing, NOT any one real analyzer:
  - register_scene_pipeline() registers a Route.WRITE capability
  - dispatching a pipeline writes scene["analysis"][<key>] in the outline
  - an analyzer that raises is stored as status:"failed" (never crashes dispatch)
  - analyze_scene fans out a follow-up per ENABLED pipeline (switch-gated)
  - set_scene_pipeline toggles the switch; get_scene_pipelines reads it back
  - save_scene_content queues pipelines by default; auto_analyze=False opts out

The analyzers here are plain Python (no LLM) — the framework is what's under test.
"""
from datetime import timedelta
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch, registry
from actions.capabilities.dispatch import run_followups
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from projects.models import Project

from outline.capabilities import pipelines as scene_pipelines
from outline.capabilities.pipelines import register_scene_pipeline
from outline.models import SceneRevision
from outline.store import load_outline, load_scene_pipelines, save_outline

User = get_user_model()


def _ok_analyzer(body, *, context=None):
    return {"status": "ok", "summary": f"sum:{body[:12]}"}


def _boom_analyzer(body, *, context=None):
    raise RuntimeError("analyzer blew up")


def _scene_doc(text):
    return {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": text}]},
    ]}


class ScenePipelineFrameworkTests(TestCase):
    SCENE_ID = "sc1"

    def setUp(self):
        self.user = User.objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)

        self._outline_data = self._outline()
        save_outline(SimpleNamespace(project_id=self.project.pk), self._outline_data)

        self._reg_snap = registry.snapshot()
        self._pipe_snap = dict(scene_pipelines._PIPELINES)
        scene_pipelines._PIPELINES.clear()
        register_scene_pipeline(
            key="t1", label="Test One", analyze=_ok_analyzer, default_enabled=True,
        )
        register_scene_pipeline(
            key="t2", label="Test Two", analyze=_ok_analyzer, default_enabled=False,
        )

    def tearDown(self):
        registry.restore(self._reg_snap)
        scene_pipelines._PIPELINES.clear()
        scene_pipelines._PIPELINES.update(self._pipe_snap)

    def _outline(self, **scene_extra):
        scene = {
            "id": self.SCENE_ID,
            "text": "Existing Title",
            "content": _scene_doc("The hero walked into the storm."),
            "words": 6,
        }
        scene.update(scene_extra)
        return {
            "base_template": "three_act",
            "acts": [
                {"id": "ac1", "text": "Act I", "chapters": [
                    {"id": "ch1", "text": "Ch 1", "scenes": [scene]},
                ]},
            ],
        }

    def _session(self, **scene_extra):
        if scene_extra:
            save_outline(SimpleNamespace(project_id=self.project.pk), self._outline(**scene_extra))
        return ProjectScope(self.project.id)

    def _scene(self, sess):
        go = load_outline(sess)
        return go["acts"][0]["chapters"][0]["scenes"][0]

    # ---- factory + per-pipeline write ------------------------------------- #

    def test_register_scene_pipeline_registers_write_capability(self):
        cap = registry.get("analyze_scene__t1")
        self.assertIsNotNone(cap)
        self.assertEqual(cap.route.value, "write")

    def test_pipeline_dispatch_writes_namespaced_analysis(self):
        sess = self._session()
        res = dispatch("analyze_scene__t1", {"scene_id": self.SCENE_ID},
                       Actor.USER_BUTTON, sess)

        self.assertEqual(res.status, "ran")
        analysis = self._scene(sess).get("analysis") or {}
        self.assertIn("t1", analysis)
        self.assertEqual(analysis["t1"]["status"], "ok")
        self.assertTrue(analysis["t1"]["summary"].startswith("sum:The hero"))
        self.assertNotIn("t2", analysis)
        self.assertIn("outline", res.invalidates)

    def test_gather_context_hook_reaches_analyzer(self):
        def ctx_hook(ctx, scene):
            return {"known_entities": ["Zed"], "prior_text": "earlier prose."}

        def echo_analyzer(body, *, context=None):
            c = context or {}
            return {"status": "ok",
                    "saw_known": c.get("known_entities"),
                    "saw_prior": c.get("prior_text")}

        register_scene_pipeline(key="ctxp", label="Ctx", analyze=echo_analyzer,
                                default_enabled=True, gather_context=ctx_hook)
        sess = self._session()
        dispatch("analyze_scene__ctxp", {"scene_id": self.SCENE_ID},
                 Actor.USER_BUTTON, sess)
        data = self._scene(sess)["analysis"]["ctxp"]
        self.assertEqual(data["saw_known"], ["Zed"])
        self.assertEqual(data["saw_prior"], "earlier prose.")

    def test_pipeline_only_touches_its_own_key(self):
        save_outline(SimpleNamespace(project_id=self.project.pk), self._outline(analysis={"t2": {"status": "ok", "pre": 1}}))
        sess = ProjectScope(self.project.id)
        dispatch("analyze_scene__t1", {"scene_id": self.SCENE_ID}, Actor.USER_BUTTON, sess)
        analysis = self._scene(sess)["analysis"]
        self.assertEqual(analysis["t2"], {"status": "ok", "pre": 1})
        self.assertEqual(analysis["t1"]["status"], "ok")

    def test_analyzer_failure_is_stored_not_raised(self):
        register_scene_pipeline(key="boom", label="Boom",
                                analyze=_boom_analyzer, default_enabled=True)
        sess = self._session()
        res = dispatch("analyze_scene__boom", {"scene_id": self.SCENE_ID},
                       Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "ran")
        self.assertEqual(self._scene(sess)["analysis"]["boom"]["status"], "failed")

    def test_failed_rerun_keeps_previous_good_analysis(self):
        good = {"status": "ok", "summary": "last good"}
        register_scene_pipeline(key="boom", label="Boom",
                                analyze=_boom_analyzer, default_enabled=True)
        sess = self._session(analysis={"boom": good})
        with self.assertLogs("writerverse.consistency", level="WARNING") as logs:
            dispatch("analyze_scene__boom", {"scene_id": self.SCENE_ID},
                     Actor.USER_BUTTON, sess)
        self.assertEqual(self._scene(sess)["analysis"]["boom"], good)
        self.assertTrue(any("keeping previous analysis" in m for m in logs.output))

    def test_missing_scene_id_is_an_error(self):
        sess = self._session()
        res = dispatch("analyze_scene__t1", {}, Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "error")

    # ---- fan-out (switch-gated) ------------------------------------------- #

    def test_analyze_scene_fans_out_only_enabled_pipelines(self):
        sess = self._session()
        res = dispatch("analyze_scene", {"scene_id": self.SCENE_ID},
                       Actor.USER_BUTTON, sess)
        caps = {f.get("capability") for f in (res.followups or [])}
        self.assertIn("analyze_scene__t1", caps)
        self.assertNotIn("analyze_scene__t2", caps)

    def test_toggling_switch_changes_fan_out(self):
        sess = self._session()
        dispatch("set_scene_pipeline", {"key": "t2", "enabled": True},
                 Actor.USER_BUTTON, sess)
        self.assertEqual(
            load_scene_pipelines(SimpleNamespace(project_id=self.project.pk))["t2"], True
        )

        res = dispatch("analyze_scene", {"scene_id": self.SCENE_ID},
                       Actor.USER_BUTTON, sess)
        caps = {f.get("capability") for f in (res.followups or [])}
        self.assertIn("analyze_scene__t2", caps)

    def test_disabling_default_on_pipeline_drops_it(self):
        sess = self._session()
        dispatch("set_scene_pipeline", {"key": "t1", "enabled": False},
                 Actor.USER_BUTTON, sess)
        res = dispatch("analyze_scene", {"scene_id": self.SCENE_ID},
                       Actor.USER_BUTTON, sess)
        caps = {f.get("capability") for f in (res.followups or [])}
        self.assertNotIn("analyze_scene__t1", caps)

    def test_fan_out_then_run_followups_writes_analysis(self):
        sess = self._session()
        res = dispatch("analyze_scene", {"scene_id": self.SCENE_ID},
                       Actor.USER_BUTTON, sess)
        run_followups(res, sess)
        self.assertEqual(self._scene(sess)["analysis"]["t1"]["status"], "ok")

    # ---- switch read API -------------------------------------------------- #

    def test_get_scene_pipelines_reports_effective_enabled(self):
        sess = self._session()
        dispatch("set_scene_pipeline", {"key": "t2", "enabled": True},
                 Actor.USER_BUTTON, sess)
        res = dispatch("get_scene_pipelines", {}, Actor.USER_BUTTON, sess)
        by_key = {p["key"]: p for p in res.result["pipelines"]}
        self.assertTrue(by_key["t1"]["enabled"])
        self.assertTrue(by_key["t2"]["enabled"])
        self.assertEqual(by_key["t1"]["label"], "Test One")

    # ---- save_scene_content wiring --------------------------------------- #

    def test_save_scene_content_queues_pipelines_by_default(self):
        sess = self._session()
        res = dispatch(
            "save_scene_content",
            {"scene_id": self.SCENE_ID, "content": _scene_doc("New prose here.")},
            Actor.USER_BUTTON, sess,
        )
        caps = {f.get("capability") for f in (res.followups or [])}
        self.assertIn("analyze_scene__t1", caps)

    def test_save_scene_content_denies_chat_actor(self):
        sess = self._session()
        res = dispatch(
            "save_scene_content",
            {"scene_id": self.SCENE_ID, "content": _scene_doc("New prose here.")},
            Actor.CHAT, sess,
        )
        self.assertEqual(res.status, "denied")

    def test_save_scene_content_auto_analyze_false_skips_pipelines(self):
        sess = self._session()
        res = dispatch(
            "save_scene_content",
            {"scene_id": self.SCENE_ID, "content": _scene_doc("New prose."),
             "auto_analyze": False},
            Actor.USER_BUTTON, sess,
        )
        caps = {f.get("capability") for f in (res.followups or [])}
        self.assertNotIn("analyze_scene__t1", caps)

    # ---- SA-31: never zero stored prose with an empty doc ----------------- #

    def _save(self, **args):
        return dispatch(
            "save_scene_content",
            {"scene_id": self.SCENE_ID, "auto_analyze": False, **args},
            Actor.USER_BUTTON, self._session(),
        )

    def _stored_scene(self):
        return self._scene(ProjectScope(self.project.id))

    def test_save_without_content_keeps_prose_and_words(self):
        res = self._save(text="Renamed")
        self.assertEqual(res.status, "ran")
        scene = self._stored_scene()
        self.assertEqual(scene["text"], "Renamed")
        self.assertEqual(scene["words"], 6)
        self.assertEqual(scene["content"], _scene_doc("The hero walked into the storm."))

    # ---- SA-284: privacy-safe audit record on every save ------------------ #

    @override_settings(DEBUG=True)
    def test_save_writes_one_audit_record_without_prose(self):
        secret = "The drowned village rises every century."
        with self.assertLogs("writerverse.persistence", level="INFO") as cm:
            self._save(content=_scene_doc(secret))
        self.assertEqual(len(cm.output), 1)
        line = cm.output[0]
        self.assertIn(f"scene={self.SCENE_ID}", line)
        self.assertIn("len=", line)
        self.assertIn("hash=", line)
        self.assertNotIn("drowned", line)
        self.assertNotIn("preview", line)

    @override_settings(DEBUG=True)
    def test_refused_save_writes_no_audit_record(self):
        with self.assertNoLogs("writerverse.persistence", level="INFO"):
            self._save(content={"type": "doc", "content": []})

    def test_empty_doc_over_prose_is_refused(self):
        res = self._save(content={"type": "doc", "content": []})
        self.assertEqual(res.status, "error")
        self.assertEqual(res.http_status, 409)
        self.assertEqual(self._stored_scene()["words"], 6)

    def test_empty_doc_allowed_with_allow_empty(self):
        res = self._save(content={"type": "doc", "content": []}, allow_empty=True)
        self.assertEqual(res.status, "ran")
        self.assertEqual(self._stored_scene()["words"], 0)

    # ---- SA-285: capped history of each scene's prose --------------------- #

    def _revisions(self):
        return list(SceneRevision.objects.filter(
            project=self.project, scene__uid=self.SCENE_ID).order_by("id"))

    def test_save_with_new_text_keeps_old_text_as_one_revision(self):
        self._save(content=_scene_doc("A second draft."))
        revs = self._revisions()
        self.assertEqual(len(revs), 1)
        self.assertEqual(revs[0].content, _scene_doc("The hero walked into the storm."))

    def test_saving_identical_text_adds_no_revision(self):
        self._save(content=_scene_doc("The hero walked into the storm."))
        self.assertEqual(self._revisions(), [])

    def test_save_without_content_adds_no_revision(self):
        self._save(text="Renamed")
        self.assertEqual(self._revisions(), [])

    def test_quick_autosaves_keep_one_revision_per_ten_minutes(self):
        self._save(content=_scene_doc("Draft 1."))
        self._save(content=_scene_doc("Draft 2."))
        self._save(content=_scene_doc("Draft 3."))
        # Typing within one 10-minute stretch: only the text from its start is kept.
        self.assertEqual([r.content for r in self._revisions()],
                         [_scene_doc("The hero walked into the storm.")])
        SceneRevision.objects.update(created_at=timezone.now() - timedelta(minutes=11))
        self._save(content=_scene_doc("Draft 4."))
        self.assertEqual(self._revisions()[-1].content, _scene_doc("Draft 3."))

    @override_settings(SCENE_REVISION_CAP=3, SCENE_REVISION_MIN_GAP_SECONDS=0)
    def test_revisions_beyond_the_cap_are_pruned_oldest_first(self):
        for n in range(1, 6):
            self._save(content=_scene_doc(f"Draft {n}."))
        revs = self._revisions()
        self.assertEqual(len(revs), 3)
        # Five saves keep the previous text each time; the oldest two are gone.
        self.assertEqual(
            [r.content for r in revs],
            [_scene_doc("Draft 2."), _scene_doc("Draft 3."), _scene_doc("Draft 4.")],
        )

    def test_ai_insert_keeps_prose_from_before_the_insert(self):
        self._save(content=_scene_doc("Typed just now."))  # an autosave revision inside the gap
        dispatch("insert_scene_paragraphs", {
            "scene_id": self.SCENE_ID, "paragraphs": ["A knock at the door."],
            "position": 1,
        }, Actor.USER_BUTTON, self._session())
        # The AI edit keeps a version even though an autosave just kept one.
        self.assertEqual([r.content for r in self._revisions()],
                         [_scene_doc("The hero walked into the storm."), _scene_doc("Typed just now.")])

    # ---- SA-286: list and restore a scene's prose history ----------------- #

    def _list_revisions(self, scene_id=None):
        return dispatch(
            "list_scene_revisions", {"scene_id": scene_id or self.SCENE_ID},
            Actor.USER_BUTTON, self._session(),
        )

    def _restore(self, revision_id, scene_id=None):
        return dispatch(
            "restore_scene_revision",
            {"scene_id": scene_id or self.SCENE_ID, "revision_id": revision_id},
            Actor.USER_BUTTON, self._session(),
        )

    @override_settings(SCENE_REVISION_MIN_GAP_SECONDS=0)
    def test_list_returns_revisions_newest_first_without_prose(self):
        self._save(content=_scene_doc("Draft 1."))
        self._save(content=_scene_doc("Draft 2 has more words."))
        res = self._list_revisions()
        self.assertEqual(res.status, "ran")
        revs = res.result["revisions"]
        self.assertEqual([r["words"] for r in revs], [1 + 1, 6])  # "Draft 1." then the original
        self.assertEqual([r["id"] for r in revs], sorted((r["id"] for r in revs), reverse=True))
        self.assertTrue(all(set(r) == {"id", "created_at", "words"} for r in revs))

    def test_list_is_empty_when_scene_has_no_history(self):
        self.assertEqual(self._list_revisions().result["revisions"], [])

    @override_settings(SCENE_REVISION_MIN_GAP_SECONDS=0)
    def test_restore_puts_old_text_back_and_keeps_replaced_text_as_revision(self):
        self._save(content=_scene_doc("A second draft."))
        original_rev = self._revisions()[0]
        res = self._restore(original_rev.id)
        self.assertEqual(res.status, "ran")
        scene = self._stored_scene()
        self.assertEqual(scene["content"], _scene_doc("The hero walked into the storm."))
        self.assertEqual(scene["words"], 6)
        # The replaced text is now the newest revision, so the restore is undoable.
        newest = self._list_revisions().result["revisions"][0]
        self.assertEqual(
            SceneRevision.objects.get(id=newest["id"]).content, _scene_doc("A second draft."),
        )
        self._restore(newest["id"])
        self.assertEqual(self._stored_scene()["content"], _scene_doc("A second draft."))

    def test_restore_unknown_revision_is_404_and_changes_nothing(self):
        res = self._restore(999999)
        self.assertEqual(res.status, "error")
        self.assertEqual(res.http_status, 404)
        self.assertEqual(self._stored_scene()["content"], _scene_doc("The hero walked into the storm."))

    def test_restore_refuses_a_revision_of_another_scene(self):
        self._save(content=_scene_doc("A second draft."))
        rev = self._revisions()[0]
        res = self._restore(rev.id, scene_id="some-other-scene")
        self.assertEqual(res.http_status, 404)

    # ---- SA-287: preview one version before restoring --------------------- #

    def test_get_revision_returns_its_prose_and_changes_nothing(self):
        self._save(content=_scene_doc("A second draft."))
        rev = self._revisions()[0]
        res = dispatch(
            "get_scene_revision", {"scene_id": self.SCENE_ID, "revision_id": rev.id},
            Actor.USER_BUTTON, self._session(),
        )
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["content"], _scene_doc("The hero walked into the storm."))
        self.assertEqual(self._stored_scene()["content"], _scene_doc("A second draft."))
        self.assertEqual(len(self._revisions()), 1)

    # ---- persistence (exercises the locked write path) -------------------- #

    def test_pipeline_result_persists_through_locked_write(self):
        """The pipeline commit saves the outline; result must be readable
        after re-fetching from the DB."""

        sess = ProjectScope(self.project.id)
        dispatch("analyze_scene__t1", {"scene_id": self.SCENE_ID},
                 Actor.USER_BUTTON, sess)

        scene = load_outline(SimpleNamespace(project_id=self.project.pk))["acts"][0]["chapters"][0]["scenes"][0]
        self.assertEqual(scene["analysis"]["t1"]["status"], "ok")
