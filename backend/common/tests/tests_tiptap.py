"""common.tiptap: plain text, word counts and mentions from TipTap docs."""
from django.test import SimpleTestCase

from common.tiptap import iter_mentions, node_refs, node_text, word_count


def _t(text, *marks):
    n = {"type": "text", "text": text}
    if marks:
        n["marks"] = [{"type": m} for m in marks]
    return n


def _p(*inline):
    return {"type": "paragraph", "content": list(inline)}


def _doc(*blocks):
    return {"type": "doc", "content": list(blocks)}


def _mention(label, eid=7, kind="character"):
    return {"type": "mention", "attrs": {"id": eid, "entityType": kind, "label": label}}


class NodeTextTests(SimpleTestCase):
    def test_marks_do_not_split_a_word(self):
        # "un**believ**able" is three text nodes but one word.
        doc = _doc(_p(_t("un"), _t("believ", "bold"), _t("able")))
        self.assertEqual(node_text(doc), "unbelievable")
        self.assertEqual(word_count(doc), 1)

    def test_paragraphs_do_not_fuse(self):
        doc = _doc(_p(_t("The end.")), _p(_t("Start again.")))
        self.assertEqual(node_text(doc), "The end.\nStart again.")
        self.assertEqual(word_count(doc), 4)

    def test_nested_blocks_do_not_fuse(self):
        doc = _doc(
            {"type": "heading", "content": [_t("Title")]},
            {"type": "bulletList", "content": [
                {"type": "listItem", "content": [_p(_t("one"))]},
                {"type": "listItem", "content": [_p(_t("two"))]},
            ]},
            {"type": "blockquote", "content": [_p(_t("quoted"))]},
        )
        self.assertEqual(word_count(doc), 4)
        self.assertNotIn("onetwo", node_text(doc))

    def test_hard_break_separates_words(self):
        doc = _doc(_p(_t("line"), {"type": "hardBreak"}, _t("next")))
        self.assertEqual(word_count(doc), 2)

    def test_mention_reads_as_its_label(self):
        doc = _doc(_p(_t("Hello "), _mention("Aelden"), _t("!")))
        self.assertEqual(node_text(doc), "Hello Aelden!")
        self.assertEqual(word_count(doc), 2)

    def test_empty_inputs(self):
        for v in (None, {}, [], _doc(), _doc(_p())):
            self.assertEqual(node_text(v), "")
            self.assertEqual(word_count(v), 0)

    def test_a_paragraph_alone_has_no_extra_newlines(self):
        self.assertEqual(node_text(_p(_t("a "), _t("b", "italic"))), "a b")


class MentionTests(SimpleTestCase):
    def test_iter_mentions_in_order(self):
        doc = _doc(_p(_mention("A", 1)), _p(_t("x"), _mention("W", 2, "world")))
        self.assertEqual(list(iter_mentions(doc)),
                         [("character", 1, "A"), ("world", 2, "W")])

    def test_iter_mentions_falls_back_to_entity_id(self):
        node = {"type": "mention", "attrs": {"entityId": 5, "entity_type": "character"}}
        self.assertEqual(list(iter_mentions(node)), [("character", 5, None)])

    def test_node_refs_dedupes_mentions(self):
        para = _p(_mention("A", 1), _t(" and "), _mention("A", 1))
        self.assertEqual(node_refs(para), [{"entityType": "character", "id": 1, "label": "A"}])
