from ai_engine.llm_utils import create_llm
from ai_engine.parsers import HookGradeResult
from langchain_core.prompts import ChatPromptTemplate

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a professional editor. Rate scene hooks on craft: engagement, tension, and intrigue. "
        "For each of the opening and closing paragraphs, give a one-line verdict and brief actionable note. "
        "Grade each as Strong, Moderate or Weak with a one-line note.",
    ),
    (
        "human",
        "Scene: {scene_title}\n\nOpening paragraph:\n{opening}\n\nClosing paragraph:\n{closing}",
    ),
])


def build_hook_grader_chain():
    llm = create_llm('small', temperature=0.2)
    return (_PROMPT | llm.with_structured_output(HookGradeResult)).with_config({"run_name": "grade_scene_hooks"})
