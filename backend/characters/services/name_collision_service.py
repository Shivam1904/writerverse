"""
Name Collision Detector — pure algorithmic, no LLM, no Django imports.

Detects character names that are too similar using:
- Edit distance (via difflib.SequenceMatcher)
- Soundex phonetic similarity
- First-letter clustering (Doran / Devlin / Dasha)
- Location/object name collisions (when worldbuilding titles are passed in)
"""

import re
from difflib import SequenceMatcher
from typing import Literal

# --- Soundex ---

_SOUNDEX_MAP = {
    'b': '1', 'f': '1', 'p': '1', 'v': '1',
    'c': '2', 'g': '2', 'j': '2', 'k': '2', 'q': '2', 's': '2', 'x': '2', 'z': '2',
    'd': '3', 't': '3',
    'l': '4',
    'm': '5', 'n': '5',
    'r': '6',
}
_SOUNDEX_VOWELS = set('aeiouhwy')


def _soundex(name: str) -> str:
    """Return the 4-char Soundex code for a name token."""
    s = re.sub(r'[^a-zA-Z]', '', name).lower()
    if not s:
        return '0000'
    code = s[0].upper()
    prev = _SOUNDEX_MAP.get(s[0], '0')
    for ch in s[1:]:
        if ch in _SOUNDEX_VOWELS:
            prev = '0'
            continue
        c = _SOUNDEX_MAP.get(ch, '0')
        if c != prev and c != '0':
            code += c
            prev = c
        if len(code) == 4:
            break
    return (code + '000')[:4]


# --- Similarity helpers ---

def _similarity_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _first_name(name: str) -> str:
    """Return the first token of a name (handles 'Lord Karek', 'Lady Mira', etc.)."""
    tokens = name.split()
    skip = {'lord', 'lady', 'sir', 'dr', 'mr', 'mrs', 'ms', 'king', 'queen', 'prince', 'princess'}
    for t in tokens:
        if t.lower() not in skip:
            return t
    return tokens[-1] if tokens else name


# --- Collision types ---

CollisionSeverity = Literal['warning', 'info']


def _describe_collision(a: str, b: str) -> tuple[str, CollisionSeverity] | None:
    """
    Return (reason, severity) if a and b are too similar, else None.
    Thresholds are tuned to be author-friendly — they flag but don't block.
    """
    fa, fb = _first_name(a), _first_name(b)

    # Same-letter cluster: two names sharing the same first initial in fiction
    # is a known reader-confusion trigger regardless of further similarity.
    if fa[0].lower() == fb[0].lower():
        return (f"Same-initial cluster: '{a}' and '{b}' both start with "
                f"'{fa[0].upper()}' — readers may confuse them", 'info')

    # Phonetic near-match (Soundex codes match)
    if _soundex(fa) == _soundex(fb) and _soundex(fa) != '0000':
        return (f"Sound-alike: '{a}' and '{b}' have the same phonetic pattern "
                f"(both map to {_soundex(fa)})", 'warning')

    # High edit-distance similarity regardless of first letter
    ratio = _similarity_ratio(fa, fb)
    if ratio >= 0.80:
        return (f"Very similar spelling: '{a}' and '{b}' differ by only a few letters "
                f"({ratio:.0%} match)", 'warning')

    return None


# --- Public API ---

def detect_name_collisions(
    character_names: list[str],
    worldbuilding_titles: list[str] | None = None,
) -> list[dict]:
    """
    Detect name collisions among a list of character names.

    Args:
        character_names: list of character name strings
        worldbuilding_titles: optional list of worldbuilding entry titles to check
                              against (character name matches a place/object)

    Returns:
        List of dicts with keys:
          name_a, name_b, reason, severity, collision_type
        collision_type is one of: 'character_character', 'character_worldbuilding'
    """
    collisions: list[dict] = []
    seen: set[frozenset[str]] = set()

    # Character ↔ character
    for i, a in enumerate(character_names):
        for b in character_names[i + 1:]:
            pair = frozenset({a, b})
            if pair in seen:
                continue
            result = _describe_collision(a, b)
            if result:
                seen.add(pair)
                reason, severity = result
                collisions.append({
                    'name_a': a,
                    'name_b': b,
                    'reason': reason,
                    'severity': severity,
                    'collision_type': 'character_character',
                })

    # Character ↔ worldbuilding (character named "Haven" when city is "Haven")
    for char_name in character_names:
        for wb_title in (worldbuilding_titles or []):
            fa, fw = _first_name(char_name), _first_name(wb_title)
            if _similarity_ratio(fa, fw) >= 0.85:
                collisions.append({
                    'name_a': char_name,
                    'name_b': wb_title,
                    'reason': (f"Character '{char_name}' shares a name with worldbuilding entry "
                               f"'{wb_title}' — this may confuse readers"),
                    'severity': 'warning',
                    'collision_type': 'character_worldbuilding',
                })

    return collisions
