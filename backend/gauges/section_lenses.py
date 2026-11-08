"""Section lenses — the curated, per-section consistency questions, served as a
LIGHTER lens bank (design choice B).

These used to live as static frontend config (sectionMarker/lensQuestions.ts). They
now ship from here so the section lens shelves and the main gauge bank share one
serving shape. Each entry is expanded into a lens-bank-shaped dict with a lot of
defaults filled in (type=arc, "a consistency check", y_items derived from
good/problem) and additionally carries:

  · section / sub  — the ARN node it belongs to (so the frontend shows it only on
                     the matching section).
  · scope_type     — the entity scope it watches (character / story / …).
  · tier="section" — marks it as a SECTION-PURE lens. `get_gauge_catalogue` never serves
                     these, so they stay out of the page-level lens lists; only the
                     section shelves (via `get_section_lenses`) show them.
"""
from __future__ import annotations

# slug → question content + where it lives (section / sub) + the scope it watches.
# Ported verbatim from the old frontend lensQuestions.ts; the section/sub map comes
# from the marker registry (registry.ts `lensQuestions` per node).
SECTION_LENSES: list[dict] = [
    # ── Identity ──
    {
        "id": "identity-consistent", "section": "identity", "sub": None, "scope_type": "character",
        "name": "Does the character stay the same person across the story?",
        "description": "The stable core held against how they read scene to scene.",
        "intent": "Across scenes and beats, observe whether the character reads as one consistent person rather than several, and whether the essence on record matches how they come across.",
        "good": "The same recognisable person shows up scene to scene; the essence on record matches how they read.",
        "problem": "The character feels like different people in different scenes, or the essence on record doesn't match how they come across.",
    },
    {
        "id": "true-to-the-page", "section": "identity", "sub": "appearance", "scope_type": "character",
        "name": "Does the prose match the recorded appearance?",
        "description": "Scene descriptions checked against the appearance fields.",
        "intent": "Where a scene describes the character's looks, surface where it lines up with — or drifts from — the recorded fields (hair, eyes, build, age, clothing).",
        "good": "Physical details in the prose echo the fields; no scene contradicts them.",
        "problem": "A scene gives brown eyes where the field says green, or clean-shaven after a beard.",
    },
    {
        "id": "first-impression-voice", "section": "identity", "sub": "appearance", "scope_type": "character",
        "name": "Does the character's first appearance set their voice?",
        "description": "The introduction checked against how they sound later.",
        "intent": "Look at the scene that first introduces the character and observe whether the voice and presence there match how they sound for the rest of the story.",
        "good": "The first scene establishes a voice the character keeps; later scenes feel continuous with it.",
        "problem": "The introduction reads flat or generic, or the character sounds nothing like their first appearance later on.",
    },
    {
        "id": "home-consistent", "section": "identity", "sub": "world", "scope_type": "character",
        "name": "Is the character's home described the same way each time?",
        "description": "Recorded home checked against how scenes render it.",
        "intent": "Where scenes show or mention where the character lives, observe whether the details stay consistent with the recorded home and with each other.",
        "good": "The home reads the same across scenes and matches what is on record.",
        "problem": "The home changes details between scenes, or scenes contradict the recorded home.",
    },
    {
        "id": "object-recurs", "section": "identity", "sub": "world", "scope_type": "character",
        "name": "Does the character's story object come back?",
        "description": "The recorded object tracked across scenes.",
        "intent": "Observe whether the object tied to this character (the recorded story object) actually reappears across scenes rather than being mentioned once.",
        "good": "The object shows up in more than one scene and stays tied to the character.",
        "problem": "The object is recorded but appears once or never, or drifts away from the character.",
    },
    {
        "id": "wound-surface", "section": "identity", "sub": "backstory", "scope_type": "character",
        "name": "Does the backstory wound show up in their actions?",
        "description": "The formative hurt traced into on-page choices.",
        "intent": "Look for moments in scenes or beats where the recorded formative hurt visibly shapes a choice, reaction, or fear.",
        "good": "Scenes and beats carry traces of the wound — an avoidance or reaction that traces back.",
        "problem": "Backstory is rich on record but never touches what the character does.",
    },
    {
        "id": "backstory-leaks-naturally", "section": "identity", "sub": "backstory", "scope_type": "character",
        "name": "Is the backstory revealed through scenes rather than dumped?",
        "description": "How the past reaches the reader — in pieces or in blocks.",
        "intent": "Observe how the recorded backstory reaches the reader: woven into scenes and dialogue over time, or delivered in explanatory blocks.",
        "good": "Backstory arrives in pieces, through action and dialogue, as the story needs it.",
        "problem": "Backstory arrives in large expository blocks, or all at once, stopping the scene.",
    },
    {
        "id": "relationships-evolve", "section": "identity", "sub": "relationships", "scope_type": "character",
        "name": "Do the character's key relationships change over the story?",
        "description": "Recorded relationships tracked for movement across scenes.",
        "intent": "Across scenes and beats, observe whether the recorded relationships shift — warm, cool, break, deepen — rather than staying static.",
        "good": "Key relationships move across the story; scenes show the shifts.",
        "problem": "A recorded relationship stays flat from start to end, or never appears on the page.",
    },
    {
        "id": "aliases-tracked", "section": "identity", "sub": "aliases", "scope_type": "character",
        "name": "Are the character's other names used consistently?",
        "description": "Recorded aliases matched to how scenes name them.",
        "intent": "Where the character is referred to by a different name or title, observe whether it matches the recorded aliases and is used consistently (right name, right context).",
        "good": "Each alias on record is used where it fits, and the prose doesn't invent untracked names.",
        "problem": "A scene uses a name not on record, or switches names in a way that could confuse who's who.",
    },
    # ── Arc ──
    {
        "id": "arc-completes", "section": "arc", "sub": None, "scope_type": "character",
        "name": "Does the character's arc reach an end state?",
        "description": "The change from start to finish, traced whole.",
        "intent": "Across the story, observe whether the arc moves from a starting state to a changed (or pointedly unchanged) end state, rather than trailing off.",
        "good": "The arc has a visible beginning, middle, and landing; the end state differs from the start.",
        "problem": "The arc starts but never resolves, or the character ends where they began with no reason given.",
    },
    {
        "id": "want-vs-need", "section": "arc", "sub": "internal", "scope_type": "character",
        "name": "Are the want and need pulling in different directions?",
        "description": "Surface goal versus the deeper change.",
        "intent": "Observe whether the surface goal and the deeper change are distinct and in tension, as recorded and as played out.",
        "good": "Want and need are different; scenes chase the want while the need waits underneath.",
        "problem": "Want and need read as the same, or nothing presses on the need.",
    },
    {
        "id": "misbelief-challenged", "section": "arc", "sub": "internal", "scope_type": "character",
        "name": "Does the story test the character's misbelief?",
        "description": "The recorded lie pressed against by events.",
        "intent": "Observe whether scenes and beats put pressure on the character's recorded misbelief (the lie they hold) rather than leaving it untouched.",
        "good": "Events repeatedly challenge the misbelief; the character is forced to confront it.",
        "problem": "The misbelief is recorded but nothing in the story tests it, or it is dropped without resolution.",
    },
    {
        "id": "stakes-escalate", "section": "arc", "sub": "external", "scope_type": "character",
        "name": "Do the stakes rise as the plot advances?",
        "description": "What's at risk, tracked across the plot points.",
        "intent": "Across the recorded plot points and the scenes that carry them, observe whether what the character stands to lose grows rather than staying level.",
        "good": "Each major turn raises what is at risk; later scenes carry more weight than earlier ones.",
        "problem": "The stakes stay flat across the story, or a later beat risks less than an earlier one.",
    },
    {
        "id": "plot-pressures-arc", "section": "arc", "sub": "external", "scope_type": "character",
        "name": "Do the external plot points force the internal change?",
        "description": "Outside events checked against the inner arc.",
        "intent": "Observe whether the recorded plot points actually push on the character's internal arc — want, need, and misbelief — rather than running on a parallel track.",
        "good": "Plot turns land on the character's inner conflict and move the arc forward.",
        "problem": "External events happen without touching the character's inner change, or the arc shifts with no plot cause.",
    },
    # ── Outline ──
    {
        "id": "outline-coheres", "section": "outline", "sub": None, "scope_type": "character",
        "name": "Do the character's threads fit into one coherent outline?",
        "description": "All threads read together for gaps and clashes.",
        "intent": "Looking at the character's plot threads as one outline, observe whether they fit together in order without gaps or contradictions between them.",
        "good": "The threads interleave into a single readable through-line; nothing contradicts across them.",
        "problem": "Threads contradict each other, leave gaps, or can't be placed in a coherent order.",
    },
    {
        "id": "thread-pays-off", "section": "outline", "sub": "thread", "scope_type": "character",
        "name": "Does each thread the story sets up get paid off?",
        "description": "Setups in a thread matched to their payoffs.",
        "intent": "For this plot thread, observe whether what it sets up (questions, promises, planted details) is later resolved rather than left hanging.",
        "good": "Setups in the thread find payoffs; the thread closes what it opened.",
        "problem": "The thread sets up a question or promise that the story never returns to.",
    },
    {
        "id": "beats-ordered", "section": "outline", "sub": "thread", "scope_type": "character",
        "name": "Are the thread's beats in a sensible order?",
        "description": "Beat sequence read for cause-and-effect.",
        "intent": "Within this thread, observe whether the beats follow a coherent cause-and-effect sequence rather than jumping around in time or logic.",
        "good": "Each beat follows from the last; the order reads as cause and effect.",
        "problem": "Beats are out of order, repeat, or a beat depends on something that hasn't happened yet.",
    },
    # ── Presence / Voice ──
    {
        "id": "voice-distinct", "section": "voice", "sub": None, "scope_type": "character",
        "name": "Does this character sound different from the others?",
        "description": "Their dialogue compared with the rest of the cast.",
        "intent": "Compare this character's dialogue and narration against the other characters' and observe whether their voice is distinguishable rather than interchangeable.",
        "good": "You could tell who's speaking without tags; the voice stands apart from the cast.",
        "problem": "The character's lines could belong to anyone; they blur into the other voices.",
    },
    {
        "id": "voice-consistent", "section": "voice", "sub": None, "scope_type": "character",
        "name": "Does the character's voice stay consistent across scenes?",
        "description": "Their way of speaking tracked scene to scene.",
        "intent": "Across scenes, observe whether the manner of speaking holds steady (allowing for deliberate, situation-driven shifts) rather than drifting at random.",
        "good": "The character sounds like themselves throughout; shifts in voice have an in-story reason.",
        "problem": "The voice changes between scenes for no reason, or breaks the established manner of speaking.",
    },
    # ── Lenses (story themes) ──
    {
        "id": "lens-coverage", "section": "lenses", "sub": None, "scope_type": "story",
        "name": "Is the character watched by the lenses that apply?",
        "description": "Which lenses are attached versus which aspects exist.",
        "intent": "Observe which analysis lenses are attached to this character and whether the parts of their story that could be watched (arc, threads, presence) actually are.",
        "good": "The character's key aspects each have a relevant lens watching them.",
        "problem": "Significant parts of the character's story have no lens attached, leaving blind spots.",
    },
]


# the data each question reads — shown by the dev §-marker popover (was the old
# frontend `scope: [...]` on each lensQuestion).
_READS: dict[str, list[str]] = {
    "identity-consistent": ["essence field", "scene prose", "beats"],
    "true-to-the-page": ["appearance fields", "scene prose"],
    "first-impression-voice": ["scene prose", "voice field"],
    "home-consistent": ["home field", "scene prose"],
    "object-recurs": ["story object field", "scene prose"],
    "wound-surface": ["backstory", "scene prose", "beats"],
    "backstory-leaks-naturally": ["backstory", "scene prose"],
    "relationships-evolve": ["relationships field", "relationship notes", "scene prose", "beats"],
    "aliases-tracked": ["aliases field", "scene prose"],
    "arc-completes": ["want field", "need field", "misbelief field", "beats", "scene prose"],
    "want-vs-need": ["want field", "need field", "misbelief field", "beats", "scene prose"],
    "misbelief-challenged": ["misbelief field", "beats", "scene prose"],
    "stakes-escalate": ["plot points field", "beats", "scene prose"],
    "plot-pressures-arc": ["plot points field", "want field", "need field", "misbelief field", "beats"],
    "outline-coheres": ["threads", "beats", "scene prose"],
    "thread-pays-off": ["thread beats", "scene prose"],
    "beats-ordered": ["thread beats"],
    "voice-distinct": ["voice field", "signature line", "scene prose"],
    "voice-consistent": ["voice field", "signature line", "scene prose"],
    "lens-coverage": ["attached lenses", "character aspects"],
}


def _to_template(e: dict) -> dict:
    """One section question → a lighter lens-bank template (lots of defaults)."""
    good = e.get("good", "")
    problem = e.get("problem", "")
    return {
        "id": e["id"],
        "name": e["name"],
        "watches": e.get("description", ""),
        "ask": e["name"],
        "look_for": e.get("intent", ""),
        "good": good,
        "off": problem,
        "scope_type": e.get("scope_type", "character"),
        # where it belongs (the ARN node) — the frontend filters the section shelf by these.
        "section": e.get("section"),
        "sub": e.get("sub"),
        # the data this question reads (dev §-marker popover).
        "reads": _READS.get(e["id"], []),
        # lighter-lens defaults — every section lens is the `arc` consistency check.
        "type": "arc",
        "kind_word": "a consistency check",
        "tier": "section",
        "source": "section",
        "math_rule": "flat",
        "display": "ladder_line",
        # ordered LOW→HIGH (problem, good) — the arc ladder expects rungs lowest→highest.
        "y_items": [
            {"value": "problem", "description": problem},
            {"value": "good", "description": good},
        ],
    }


def get_section_lenses(ctx, **_ignore) -> dict:
    """The lighter SECTION lens bank — every curated per-section question, shaped like
    a bank template + tagged with its section/sub/scope. No args."""
    return {"templates": [_to_template(e) for e in SECTION_LENSES]}
