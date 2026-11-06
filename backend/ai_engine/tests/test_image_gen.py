"""image_gen: the raw OpenAI image call is traced, and the trace never carries the PNG.

No real API calls: the OpenAI client is faked.
"""
import base64
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from ai_engine import image_gen


def _resp(b64="aGVsbG8=", total=42):
    return SimpleNamespace(
        data=[SimpleNamespace(b64_json=b64)],
        usage=SimpleNamespace(input_tokens=10, output_tokens=32, total_tokens=total),
    )


class TraceOutputsTests(TestCase):
    def test_trace_keeps_usage_and_drops_image_bytes(self):
        out = image_gen._trace_outputs(_resp())
        self.assertEqual(
            out,
            {
                "has_image": True,
                "usage_metadata": {"input_tokens": 10, "output_tokens": 32, "total_tokens": 42},
            },
        )
        self.assertNotIn("aGVsbG8=", repr(out))

    def test_trace_handles_missing_usage(self):
        out = image_gen._trace_outputs(SimpleNamespace(data=[], usage=None))
        self.assertEqual(out["has_image"], False)
        self.assertEqual(out["usage_metadata"]["total_tokens"], 0)


class GeneratePortraitTests(TestCase):
    @patch("ai_engine.config.get_ai_config")
    def test_returns_png_and_tokens_through_traced_wrapper(self, get_cfg):
        get_cfg.return_value.get_image_config.return_value = {
            "api_key": "sk-test", "model": "gpt-image-1",
        }
        client = MagicMock()
        client.images.generate.return_value = _resp(base64.b64encode(b"png").decode(), 7)
        with patch("openai.OpenAI", return_value=client):
            png, tokens = image_gen.generate_portrait_png("a tall knight")
        self.assertEqual((png, tokens), (b"png", 7))
        kwargs = client.images.generate.call_args.kwargs
        self.assertEqual(kwargs["model"], "gpt-image-1")
        self.assertNotIn("langsmith_extra", kwargs)  # consumed by @traceable
        self.assertIn("a tall knight", kwargs["prompt"])
