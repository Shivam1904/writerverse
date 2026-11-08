"""The assembled Night Eyes system prompt has no stray template variables."""
from django.test import SimpleTestCase


class SystemPromptTemplateSafetyTests(SimpleTestCase):
    """The assembled system prompt is fed to ChatPromptTemplate as an f-string
    template (graph.py). After load_frame_prompt fills the context_params, NOTHING
    left is a template variable — so a literal `{ }` in frame text (a tool's
    "{mode, index, text}" arg shape) or in injected context data (a scene title
    with braces) must NOT be read as a missing variable. Regression for the
    2026-06-06 INVALID_PROMPT_INPUT crash on the chapters page."""

    def _input_vars(self, page, context=None):
        from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

        from night_eyes.prompts import build_system_prompt
        sp = build_system_prompt(page, context or {}, [])
        tmpl = ChatPromptTemplate.from_messages([
            ("system", sp),
            MessagesPlaceholder(variable_name="messages"),
        ])
        # Must format with ONLY `messages` — invoking proves no var is missing.
        tmpl.invoke({"messages": []})
        return tmpl.input_variables

    def test_chapters_frame_prompt_has_no_stray_template_vars(self):
        self.assertEqual(self._input_vars("chapters"), ["messages"])

    def test_stray_braces_in_injected_context_do_not_break(self):
        # A scene title / live hint carrying { } must not crash chat.
        self.assertEqual(
            self._input_vars("chapters", {"scene_id": "Act {1}: {a, b}"}),
            ["messages"],
        )

