from ai_engine.llm_utils import create_llm
from ai_engine.parsers import SceneAnalysisResult
from langchain_core.prompts import ChatPromptTemplate

_PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a narrative structure analyst for fiction authors. "
        "You will be given a sequence of scenes from a story. "
        "For each scene, classify it along three dimensions:\n\n"
        "1. PACING TYPE — what kind of scene is this?\n"
        "   - action: Physical activity, chases, fights, escapes, urgent movement\n"
        "   - dialogue: Primarily conversation-driven, characters talking\n"
        "   - introspection: Internal thought, reflection, emotional processing\n"
        "   - exposition: World-building, backstory, setup, explanation\n\n"
        "2. MOOD / ATMOSPHERE — what does it feel like to be in this scene?\n"
        "   - dark: Menacing, threatening, oppressive, dread\n"
        "   - somber: Sad, melancholy, heavy but not threatening\n"
        "   - neutral: Balanced, matter-of-fact, neither dark nor light\n"
        "   - hopeful: Optimistic undertone, things looking up, warmth\n"
        "   - light: Playful, humorous, joyful, carefree\n\n"
        "3. INTENSITY — how much dramatic energy does this scene carry?\n"
        "   - 1: Very quiet, slice-of-life, low stakes\n"
        "   - 2: Mild tension or engagement, something simmering\n"
        "   - 3: Moderate — clear conflict or emotional weight\n"
        "   - 4: High — significant stakes, turning point energy\n"
        "   - 5: Explosive — climax-level intensity, maximum stakes\n\n"
        "4. CHARACTERS PRESENT — which characters physically appear in this scene?\n"
        "   - List only characters who speak, act, or are physically described\n"
        "   - Use their full name as it appears in the prose\n"
        "   - Do NOT include characters merely mentioned or thought about\n"
        "   - If no named characters appear, return an empty list\n\n"
        "Critical rules:\n"
        "- Classify EVERY scene. Unlike character analysis, no scene is skipped.\n"
        "- Pacing type is about the dominant mode. A scene with some dialogue "
        "during a chase is still 'action'. Pick the primary driver.\n"
        "- Mood is about atmosphere, not content. A character laughing at a "
        "funeral is still 'somber' (the scene mood), not 'light'.\n"
        "- Intensity is independent of mood. A quiet introspective scene where "
        "a character decides to betray someone can be intensity 4.\n"
        "- The rationale should mention what drove your classification — "
        "help the author understand why you see their scene this way."
    )),
    ("human", "Scenes:\n{scenes_context}"),
])


def build_scene_analysis_chain():
    llm = create_llm('small', temperature=0.3)
    return (_PROMPT | llm.with_structured_output(SceneAnalysisResult)).with_config(
        {"run_name": "scene_analysis"}
    )
