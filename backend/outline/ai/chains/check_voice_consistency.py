from ai_engine.llm_utils import create_llm
from ai_engine.parsers import VoiceConsistencyResult
from langchain_core.prompts import ChatPromptTemplate

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a developmental editor. Check whether each character in the scene sounds consistent with "
        "their established arc, misbelief, want, and need. "
        "Flag when a character's dialogue or actions feel tonally 'off' for where they are in their arc. "
        "Return each flag with the character name and a brief reason. "
        "If all characters sound consistent, return an empty list.",
    ),
    (
        "human",
        "Scene: {scene_title}\n\nCharacter profiles:\n{character_profiles}\n\nScene content:\n{scene_content}",
    ),
])


def build_voice_consistency_chain():
    llm = create_llm('small', temperature=0.1)
    return (_PROMPT | llm.with_structured_output(VoiceConsistencyResult)).with_config({"run_name": "check_voice_consistency"})
