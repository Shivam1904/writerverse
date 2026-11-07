from ai_engine.llm_utils import create_llm
from ai_engine.parsers import SubtextResult
from langchain_core.prompts import ChatPromptTemplate

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a dialogue editor. Identify dialogue exchanges where characters say exactly what they mean "
        "with no subtext — on-the-nose dialogue. Good dialogue hides true desires behind surface conversation. "
        "Return each flagged line, quoted, with a brief reason why it is on-the-nose. "
        "If there are none, return an empty list.",
    ),
    (
        "human",
        "Scene: {scene_title}\n\n{scene_content}",
    ),
])


def build_subtext_detector_chain():
    llm = create_llm('small', temperature=0.1)
    return (_PROMPT | llm.with_structured_output(SubtextResult)).with_config({"run_name": "detect_subtext"})
