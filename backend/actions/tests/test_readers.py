from types import SimpleNamespace

from outline.store import save_threads

"""Phase 3 — read-tool sanity checks (lean)."""
from django.test import SimpleTestCase, TestCase

from actions.capabilities import Actor, dispatch, registry
from actions.capabilities.spec import ProjectScope


class ReaderRegistrationTests(SimpleTestCase):
    def test_all_readers_registered(self):
        for name in (
            "get_grand_outline", "get_braindumps",
            "get_characters", "get_plot_threads",
        ):
            self.assertIsNotNone(registry.get(name), name)


class PlotThreadsFilterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="reader-threads@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)
        save_threads(SimpleNamespace(project_id=cls.project.id), [
            {"scope": {"type": "act", "name": "Act 1"}, "items": [{"text": "b1"}]},
            {"scope": {"type": "act", "name": "Act 2"}, "items": [{"text": "b2"}]},
        ])

    def test_plot_threads_scope_filter(self):
        sess = ProjectScope(self.project.id)
        res = dispatch(
            "get_plot_threads",
            {"scope_type": "act", "scope_name": "Act 2"},
            Actor.CHAT, sess,
        )
        self.assertEqual(len(res.result["plot_threads"]), 1)
        self.assertEqual(res.result["plot_threads"][0]["beat_count"], 1)
        self.assertNotIn("items", res.result["plot_threads"][0])


class CharactersLeanTests(TestCase):
    """Caps refactor Phase 1: chat sees a lean {id, name, role} character list
    (role derived from the tier booleans); the facade/page path keeps the full
    shape. Actor-gated in the gather — the shared data reader is untouched."""

    @classmethod
    def setUpTestData(cls):
        from characters.models import Character
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="chars-lean@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)
        Character.objects.create(
            project=cls.project, name="Alice",
            is_protagonist=True, is_main_character=True,
        )
        Character.objects.create(
            project=cls.project, name="Villain", is_antagonist=True,
        )

    def test_get_characters_chat_is_lean(self):
        sess = ProjectScope(self.project.id)
        res = dispatch("get_characters", {}, Actor.CHAT, sess)
        rows = res.result["characters"]
        self.assertEqual({r["name"]: set(r.keys()) for r in rows},
                         {"Alice": {"id", "name", "role"},
                          "Villain": {"id", "name", "role"}})
        roles = {r["name"]: r["role"] for r in rows}
        self.assertEqual(roles, {"Alice": "protagonist", "Villain": "antagonist"})

    def test_get_characters_facade_stays_full(self):
        # USER_BUTTON (the facade actor) must still get the full character shape.
        sess = ProjectScope(self.project.id)
        res = dispatch("get_characters", {}, Actor.USER_BUTTON, sess)
        self.assertIn("want", res.result["characters"][0])


class AddCharacterArgsTests(TestCase):
    """Caps refactor Phase 1: add_character takes role (→ tier booleans) + arc
    fields in one call; an explicit role overrides the first-char protagonist
    default."""

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="add-char@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)

    def test_add_character_sets_role_and_arc(self):
        from characters.models import Character
        sess = ProjectScope(self.project.id)
        res = dispatch("add_character", {
            "name": "Mara", "role": "antagonist",
            "want": "the throne", "misbelief": "power is safety",
        }, Actor.CHAT, sess)
        self.assertEqual(res.status, "ran")
        ch = Character.objects.get(project=self.project, name="Mara")
        # Explicit role wins over the first-character protagonist default.
        self.assertTrue(ch.is_antagonist)
        self.assertFalse(ch.is_protagonist)
        self.assertEqual(ch.want, "the throne")
        self.assertEqual(ch.misbelief, "power is safety")

    def test_add_character_name_only_still_protagonist(self):
        from characters.models import Character
        sess = ProjectScope(self.project.id)
        dispatch("add_character", {"name": "Solo"}, Actor.CHAT, sess)
        ch = Character.objects.get(project=self.project, name="Solo")
        self.assertTrue(ch.is_protagonist)  # first char, no role → default


class WorldEntitiesTests(TestCase):
    """Caps refactor Phase 2: get_world → get_world_entities returns a FLAT entity
    list keyed by entity_id; add/update_world_entity address one entity by
    entity_id (was block + index). entity_id is the Worldbuilding DB id."""

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        from worldbuilding.models import Worldbuilding
        user = get_user_model().objects.create_user(
            email="world-ent@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)
        Worldbuilding.objects.create(
            project=cls.project, title="Kingdom", content="A realm",
            tags=["location"],
        )

    def test_get_world_entities_flat_shape(self):
        sess = ProjectScope(self.project.id)
        res = dispatch("get_world", {}, Actor.CHAT, sess)  # ai_name: get_world_entities
        ents = res.result["entities"]
        self.assertEqual(len(ents), 1)
        self.assertEqual(set(ents[0].keys()),
                         {"entity_id", "entity_type", "name", "description"})
        self.assertEqual(ents[0]["name"], "Kingdom")
        self.assertEqual(ents[0]["entity_type"], "location")
        self.assertEqual(ents[0]["description"], "A realm")

    def test_add_then_update_entity_by_id(self):
        from worldbuilding.models import Worldbuilding
        sess = ProjectScope(self.project.id)
        add = dispatch("add_world_entity", {
            "entity_type": "faction", "title": "Guild", "description": "Traders",
        }, Actor.CHAT, sess)
        self.assertEqual(add.status, "ran")
        eid = add.result["entity"]["id"]

        upd = dispatch("update_world_entity", {
            "entity_id": eid, "description": "Rich traders",
        }, Actor.CHAT, sess)
        self.assertEqual(upd.status, "ran")
        w = Worldbuilding.objects.get(id=eid)
        self.assertEqual(w.title, "Guild")          # untouched
        self.assertEqual(w.content, "Rich traders")  # updated
        self.assertEqual(w.tags, ["faction"])


class ThreadSurfaceRenameTests(SimpleTestCase):
    """Caps refactor Phase 3: thread caps get consistent AI names + args. Renames
    are tool_name-only (internal names — dispatch/staleness keys — unchanged)."""

    def _caps(self):
        from actions.capabilities.registry import all_capabilities
        return {c.name: c for c in all_capabilities()}

    def test_thread_ai_names(self):
        caps = self._caps()
        self.assertEqual(caps["propose_insert_beat"].ai_name, "insert_thread_beat")
        self.assertEqual(caps["propose_update_beat"].ai_name, "update_thread_beat")
        self.assertEqual(caps["place_thread_beat"].ai_name,
                         "place_thread_beat_in_outline")
        self.assertEqual(caps["generate_thread_from_description"].ai_name,
                         "quick_add_thread")
        self.assertEqual(caps["run_merge_rough_into_grand"].ai_name,
                         "quick_place_beats_in_outline")

    def test_thread_arg_schemas(self):
        caps = self._caps()
        # single-beat, id-addressed args (was index-list)
        self.assertEqual(set(caps["propose_insert_beat"].args),
                         {"thread_id", "text", "after_beat_id", "kind"})
        self.assertEqual(set(caps["propose_update_beat"].args),
                         {"thread_id", "beat_id", "text", "kind"})
        # item_id → beat_id
        self.assertIn("beat_id", caps["place_thread_beat"].args)
        self.assertNotIn("item_id", caps["place_thread_beat"].args)
        # rough_id → thread_id (the rough source IS a plot thread)
        self.assertIn("thread_id", caps["run_merge_rough_into_grand"].args)
        self.assertNotIn("rough_id", caps["run_merge_rough_into_grand"].args)
        # add_plot_thread name → title
        self.assertIn("title", caps["add_plot_thread"].args)
        self.assertNotIn("name", caps["add_plot_thread"].args)


class ThreadBeatReshapeTests(TestCase):
    """Caps refactor Phase 3: beat add/edit take ONE beat addressed by id
    (update: beat_id; insert: after_beat_id) instead of an index list. They still
    land as reviewable beat proposals (route unchanged)."""

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        user = get_user_model().objects.create_user(
            email="thread-beat@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)
        cls.session = ProjectScope(cls.project.id)

    def _thread_and_beat(self):
        from actions.capabilities import Actor, dispatch
        dispatch("add_plot_thread",
                 {"title": "Redemption", "beats": ["He falls."]},
                 Actor.CHAT, self.session)
        threads = dispatch("get_plot_threads", {}, Actor.CHAT,
                           self.session).result["plot_threads"]
        tid = threads[0]["id"]
        beats = dispatch("get_thread", {"thread_id": tid}, Actor.CHAT,
                        self.session).result["beats"]
        return tid, beats[0]["id"]

    def test_add_plot_thread_uses_title(self):
        from actions.capabilities import Actor, dispatch
        res = dispatch("add_plot_thread", {"title": "Betrayal"},
                       Actor.CHAT, self.session)
        self.assertEqual(res.status, "ran")
        # Phase 4: chat reads the thread back under the same key it wrote — `title`.
        chat_threads = dispatch("get_plot_threads", {}, Actor.CHAT,
                               self.session).result["plot_threads"]
        self.assertIn("Betrayal", {t["title"] for t in chat_threads})
        self.assertNotIn("name", chat_threads[0])
        # The frontend/page actor still gets the legacy `name` key.
        page_threads = dispatch("get_plot_threads", {}, Actor.USER_BUTTON,
                               self.session).result["plot_threads"]
        self.assertIn("name", page_threads[0])
        self.assertNotIn("title", page_threads[0])

    def test_update_thread_beat_by_beat_id_proposes(self):
        from actions.capabilities import Actor, dispatch
        from actions.models import Proposal
        tid, bid = self._thread_and_beat()
        res = dispatch("propose_update_beat",
                       {"thread_id": tid, "beat_id": bid, "text": "He rises."},
                       Actor.CHAT, self.session)
        self.assertEqual(res.status, "proposed")
        p = Proposal.objects.filter(project=self.project).order_by("-id").first()
        self.assertEqual(p.proposal["preview"]["type"], "beat_edit")
        self.assertEqual(p.proposal["preview"]["beat_id"], bid)
        # The rail card titles itself from this: "Editing a beat in Redemption."
        self.assertEqual(p.proposal["preview"]["thread_title"], "Redemption")

    def test_insert_thread_beat_after_beat_id_proposes(self):
        from actions.capabilities import Actor, dispatch
        from actions.models import Proposal
        tid, bid = self._thread_and_beat()
        res = dispatch("propose_insert_beat",
                       {"thread_id": tid, "text": "A knock.", "after_beat_id": bid},
                       Actor.CHAT, self.session)
        self.assertEqual(res.status, "proposed")
        p = Proposal.objects.filter(project=self.project).order_by("-id").first()
        self.assertEqual(p.proposal["preview"]["type"], "beat_insert")
        self.assertEqual(p.proposal["preview"]["index"], 1)  # after beat 0
        self.assertEqual(p.proposal["preview"]["thread_title"], "Redemption")


class OutlineReaderTests(TestCase):
    """Caps refactor Phase 4: get_grand_outline gains chat as get_outline (a lean
    acts→chapters→scenes skeleton, no beats); new get_chapter drills into one
    chapter's scenes + their outline beats. Facade keeps the full grand outline."""

    @classmethod
    def setUpTestData(cls):
        from types import SimpleNamespace

        from django.contrib.auth import get_user_model
        from outline.store import save_outline
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="outline-reader@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)
        save_outline(SimpleNamespace(project_id=cls.project.pk), {
            "acts": [{
                "id": "ac_1", "text": "Act One",
                "chapters": [{
                    "id": "ch_1", "text": "Chapter One",
                    "scenes": [{
                        "id": "sc_1", "text": "Opening",
                        "beats": [{"id": "b_1", "text": "He arrives.",
                                   "kind": "text"}],
                    }],
                }],
            }],
        })

    def test_get_outline_is_lean_skeleton(self):
        # ai_name get_outline; nested ids+titles, NO beats/prose.
        res = dispatch("get_grand_outline", {}, Actor.CHAT,
                       ProjectScope(self.project.id))
        acts = res.result["acts"]
        self.assertEqual(acts[0]["title"], "Act One")
        ch = acts[0]["chapters"][0]
        self.assertEqual(ch["chapter_id"], "ch_1")
        self.assertEqual(ch["title"], "Chapter One")
        sc = ch["scenes"][0]
        self.assertEqual(set(sc.keys()), {"scene_id", "title"})  # no beats
        self.assertEqual(sc["scene_id"], "sc_1")

    def test_get_grand_outline_facade_stays_full(self):
        # USER_BUTTON keeps the full merged grand_outline (frontend contract).
        res = dispatch("get_grand_outline", {}, Actor.USER_BUTTON,
                       ProjectScope(self.project.id))
        self.assertIn("grand_outline", res.result)

    def test_get_chapter_returns_scenes_with_beats(self):
        res = dispatch("get_chapter", {"chapter_id": "ch_1"}, Actor.CHAT,
                       ProjectScope(self.project.id))
        self.assertEqual(res.result["chapter_id"], "ch_1")
        sc = res.result["scenes"][0]
        self.assertEqual(sc["scene_id"], "sc_1")
        self.assertEqual(sc["beats"][0]["id"], "b_1")
        self.assertEqual(sc["beats"][0]["text"], "He arrives.")


class ChapterProseTests(TestCase):
    """Caps refactor Phase 5: get_chapter_prose (chapter_id) returns every scene's
    paragraphs in the chapter."""

    @classmethod
    def setUpTestData(cls):
        from types import SimpleNamespace

        from django.contrib.auth import get_user_model
        from outline.store import save_outline
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="chapter-prose@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)

        def _para(text):
            return {"type": "paragraph",
                    "content": [{"type": "text", "text": text}]}
        save_outline(SimpleNamespace(project_id=cls.project.pk), {
            "acts": [{"id": "ac_1", "text": "Act One", "chapters": [{
                "id": "ch_1", "text": "Chapter One", "scenes": [
                    {"id": "sc_1", "text": "Opening",
                     "content": {"type": "doc", "content": [_para("Tony woke.")]}},
                    {"id": "sc_2", "text": "Later",
                     "content": {"type": "doc", "content": [_para("Night fell.")]}},
                ]}]}],
        })

    def test_get_chapter_prose_returns_all_scene_paragraphs(self):
        res = dispatch("get_chapter_prose", {"chapter_id": "ch_1"}, Actor.CHAT,
                       ProjectScope(self.project.id))
        scenes = res.result["scenes"]
        self.assertEqual([s["scene_id"] for s in scenes], ["sc_1", "sc_2"])
        self.assertEqual(scenes[0]["paragraphs"][0]["text"], "Tony woke.")
        self.assertEqual(scenes[1]["paragraphs"][0]["text"], "Night fell.")

    def test_get_chapter_docs_returns_one_chapters_docs_and_rev(self):
        res = dispatch("get_chapter_docs", {"chapter_id": "ch_1"}, Actor.USER_BUTTON,
                       ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran", res)
        self.assertTrue(res.result["found"])
        scenes = res.result["scenes"]
        self.assertEqual([s["id"] for s in scenes], ["sc_1", "sc_2"])
        self.assertEqual(scenes[0]["content"]["content"][0]["content"][0]["text"],
                         "Tony woke.")
        self.assertEqual(scenes[0]["rev"], 1)

    def test_get_chapter_docs_unknown_chapter(self):
        res = dispatch("get_chapter_docs", {"chapter_id": "nope"}, Actor.USER_BUTTON,
                       ProjectScope(self.project.id))
        self.assertFalse(res.result["found"])
        self.assertEqual(res.result["scenes"], [])

    def test_get_chapter_docs_denied_to_chat(self):
        res = dispatch("get_chapter_docs", {"chapter_id": "ch_1"}, Actor.CHAT,
                       ProjectScope(self.project.id))
        self.assertEqual(res.status, "denied")

    def test_lean_grand_outline_has_no_prose(self):
        res = dispatch("get_grand_outline", {"include_prose": False}, Actor.USER_BUTTON,
                       ProjectScope(self.project.id))
        sc = res.result["grand_outline"]["acts"][0]["chapters"][0]["scenes"][0]
        self.assertEqual(sc["id"], "sc_1")
        self.assertNotIn("content", sc)



class ProjectOverviewCensusTests(TestCase):
    """Caps refactor Phase 6: get_project_meta → get_project_overview adds a census
    `counts` block (characters, world entities, threads, chapters, braindumps) on
    top of the project metadata — pointers, not detail."""

    @classmethod
    def setUpTestData(cls):
        from braindumps.models import Braindump
        from characters.models import Character
        from django.contrib.auth import get_user_model
        from projects.models import Project
        from worldbuilding.models import Worldbuilding
        user = get_user_model().objects.create_user(
            email="overview@test.com", password="test",
        )
        cls.project = Project.objects.create(
            title="My Book", synopsis="A tale", total_chapters=3, user=user,
        )
        Character.objects.create(project=cls.project, name="A")
        Character.objects.create(project=cls.project, name="B")
        Worldbuilding.objects.create(project=cls.project, title="Kingdom",
                                     tags=["location"])
        Braindump.objects.create(project=cls.project, title="idea", content="x")
        save_threads(SimpleNamespace(project_id=cls.project.id), [{"id": "ro_1", "title": "Main"}])

    def test_get_project_overview_has_census(self):
        res = dispatch("get_project_meta", {}, Actor.CHAT,  # ai: get_project_overview
                       ProjectScope(self.project.id))
        self.assertEqual(res.result["title"], "My Book")  # meta still present
        counts = res.result["counts"]
        self.assertEqual(counts["characters"], 2)
        self.assertEqual(counts["world_entities"], 1)
        self.assertEqual(counts["braindumps"], 1)
        self.assertEqual(counts["threads"], 1)
        self.assertEqual(counts["chapters"], 3)


class GetCharacterByNameFallbackTests(TestCase):
    """A2: the chat by-id character reader resolves a NAME argument (a common
    tool-call slip — character_id="Mira") instead of hard-erroring mid-check, and
    an unknown reference errors with guidance toward get_characters."""

    @classmethod
    def setUpTestData(cls):
        from characters.models import Character
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="char-byname@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)
        cls.char = Character.objects.create(
            project=cls.project, name="Mira", is_protagonist=True,
            misbelief="she must never go into deep water",
        )

    def test_get_character_by_numeric_id(self):
        res = dispatch("get_character", {"character_id": self.char.id},
                       Actor.CHAT, ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["character"]["name"], "Mira")

    # get_character declares character_id as "int", so dispatch() now refuses a
    # name with a 400 before gather runs. The gather still resolves names; test
    # it directly.
    def _gather(self, character_id):
        from actions.capabilities.spec import DispatchContext
        ctx = DispatchContext(project_id=self.project.id, actor=Actor.CHAT)
        return registry.get("get_character").gather(ctx, {"character_id": character_id})

    def test_get_character_name_is_refused_by_dispatch(self):
        res = dispatch("get_character", {"character_id": "mira"},
                       Actor.CHAT, ProjectScope(self.project.id))
        self.assertEqual((res.status, res.http_status), ("error", 400))

    def test_get_character_by_name_string_resolves(self):
        # character_id="mira" (a name, not an int) used to raise → "[ERROR]".
        res = self._gather("mira")
        self.assertEqual(res["character"]["id"], self.char.id)
        self.assertEqual(res["character"]["misbelief"],
                         "she must never go into deep water")

    def test_get_character_unknown_errors_with_guidance(self):
        from actions.capabilities.spec import CapabilityError
        with self.assertRaises(CapabilityError) as cm:
            self._gather("Nobody")
        self.assertIn("get_characters", cm.exception.message)


class SearchProseTests(TestCase):
    """A3: search_prose scans every scene's written prose so a consistency check
    can recall what an EARLIER scene established, not only the current chapter."""

    @classmethod
    def setUpTestData(cls):
        from types import SimpleNamespace

        from django.contrib.auth import get_user_model
        from outline.store import save_outline
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="search-prose@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)

        def _para(text):
            return {"type": "paragraph",
                    "content": [{"type": "text", "text": text}]}
        save_outline(SimpleNamespace(project_id=cls.project.pk), {
            "acts": [{"id": "ac_1", "text": "Act One", "chapters": [{
                "id": "ch_1", "text": "Chapter One", "scenes": [
                    {"id": "sc_1", "text": "The Cliff", "content": {
                        "type": "doc", "content": [_para(
                            "Mira was terrified of the deep water and never "
                            "went near it.")]}},
                    {"id": "sc_2", "text": "The Dive", "content": {
                        "type": "doc", "content": [_para(
                            "She dove into the churning sea without a second "
                            "thought.")]}},
                ]}]}],
        })

    def test_recalls_the_established_passage_across_scenes(self):
        res = dispatch("search_prose",
                       {"query": "Mira deep water terrified"},
                       Actor.CHAT, ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        passages = res.result["passages"]
        self.assertTrue(passages)
        top = passages[0]
        self.assertEqual(top["scene_id"], "sc_1")
        self.assertEqual(top["scene_title"], "The Cliff")
        self.assertEqual(top["chapter_title"], "Chapter One")
        self.assertIn("terrified", top["text"])

    def test_empty_query_returns_no_passages(self):
        res = dispatch("search_prose", {"query": "   "}, Actor.CHAT,
                       ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["passages"], [])

    def test_search_prose_is_chat_bound_on_write_pages(self):
        cap = registry.get("search_prose")
        self.assertIsNotNone(cap)
        self.assertIn(Actor.CHAT, cap.actors)
        self.assertEqual(cap.chat_exposure, "bound")


class LensLibraryMatchesGaugeBankTests(TestCase):
    """SA-244: chat's lens library (`get_lens_templates`) must be the SAME bank
    the Lenses page reads (`get_gauge_catalogue`), not the old actions.yml
    templates — otherwise Night Eyes describes lenses the author can't find."""

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="lens-library@test.com", password="test",
        )
        cls.project = Project.objects.create(title="L", user=user)

    def test_chat_library_lists_exactly_the_page_bank_lenses(self):
        sess = ProjectScope(self.project.id)
        chat = dispatch("get_lens_templates", {}, Actor.CHAT, sess)
        page = dispatch("get_gauge_catalogue", {}, Actor.USER_BUTTON, sess)
        self.assertEqual(chat.status, "ran", chat.error)
        page_ids = {lens["id"] for t in page.result["types"] for lens in t["lenses"]}
        chat_ids = {row["lens_id"] for row in chat.result["templates"]}
        self.assertTrue(page_ids)
        self.assertEqual(chat_ids, page_ids)
        self.assertEqual(chat.result["presets"], [])
