"""
Output Parsers
Pydantic schemas for structured LLM outputs.
Used with LLM `.with_structured_output()` feature.
"""

from typing import Literal

from pydantic import BaseModel, Field

# --- SCENE ANALYSIS SCHEMAS ---


class SceneAnalysisPoint(BaseModel):
    """Classification of a single scene across pacing, mood, intensity, and character presence."""

    scene_id: int = Field(description="ID of the scene")
    pacing_type: Literal["action", "dialogue", "introspection", "exposition"] = Field(
        description="Dominant pacing type of this scene"
    )
    mood: Literal["dark", "somber", "neutral", "hopeful", "light"] = Field(
        description="Overall atmosphere/mood of this scene"
    )
    intensity: int = Field(
        description="Dramatic intensity from 1 (quiet) to 5 (explosive)", ge=1, le=5
    )
    characters_present: list[str] = Field(
        default_factory=list,
        description="Names of characters who physically appear, speak, or act in this scene",
    )
    rationale: str = Field(
        description="One sentence explaining the classification choices"
    )


class SceneAnalysisResult(BaseModel):
    """Scene-level analysis for all scenes in a project."""

    data_points: list[SceneAnalysisPoint] = Field(
        description="One analysis point per scene"
    )


# --- SCENE CHECK SCHEMAS (pov_purity / detect_subtext / voice_consistency /
# hook_grade). Structured output, so a format drift is a parse error the
# analyzer reports as "failed", never an empty list that reads as all-clear.


class QuotedFlag(BaseModel):
    """One flagged sentence or line, quoted from the scene."""

    quote: str = Field(description="The exact sentence or line, quoted from the scene")
    reason: str = Field(description="Brief reason it is flagged")


class PovPurityResult(BaseModel):
    violations: list[QuotedFlag] = Field(
        description="Each head-hopping sentence. Empty list if there are none."
    )


class SubtextResult(BaseModel):
    flags: list[QuotedFlag] = Field(
        description="Each on-the-nose dialogue line. Empty list if there are none."
    )


class VoiceFlag(BaseModel):
    character: str = Field(description="The character's name")
    reason: str = Field(description="Brief reason their voice or action feels off-arc")


class VoiceConsistencyResult(BaseModel):
    flags: list[VoiceFlag] = Field(
        description="Each off-arc character moment. Empty list if all are consistent."
    )


class HookVerdict(BaseModel):
    grade: Literal["Strong", "Moderate", "Weak"]
    note: str = Field(description="One-line actionable note")


class HookGradeResult(BaseModel):
    opening: HookVerdict
    closing: HookVerdict
