from ai_engine.llm_utils import create_llm
from ai_engine.parsers import PovPurityResult
from langchain_core.prompts import ChatPromptTemplate

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a copy editor specialising in point-of-view craft. "
        "Your task: find head-hopping — sentences that access the inner thoughts, feelings, or perceptions of "
        "a character who is NOT the scene's POV character. "
        "Return every violation with the quoted sentence and a brief reason. "
        "If there are none, return an empty list.",
    ),
    (
        "human",
        "Scene: {scene_title}\nPOV character: {pov_character}\n\n{scene_content}",
    ),
])


def build_pov_purity_chain():
    llm = create_llm('small', temperature=0.0)
    return (_PROMPT | llm.with_structured_output(PovPurityResult)).with_config({"run_name": "check_pov_purity"})
