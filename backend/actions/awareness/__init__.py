"""Awareness layer — signals → rules → dispatch.

Intentionally an empty package init (no eager imports) to avoid an import cycle with
`actions.capabilities`. Import the submodules directly, e.g.
`from actions.awareness.evaluate import evaluate`.
"""
