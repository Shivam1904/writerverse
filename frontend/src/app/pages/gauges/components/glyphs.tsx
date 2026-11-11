/**
 * Per-lens glyphs — the line-icon each lens card carries.
 *
 * Design rule: each mark depicts WHAT the lens watches (the story phenomenon),
 * never HOW the chart measures it. No rising lines, no bars, no setup→payoff
 * dumbbells. One metaphor per lens, on a 24×24 grid, monoline + a single
 * duotone accent fill behind the stroke. Stroke colour comes from the kind
 * tint (`.lens-g-*` sets `color`; we draw in `currentColor`).
 *
 * Keyed by the backend's chart id (what the catalogue passes, e.g.
 * `power_corrupts`, `three_act.coverage`). `glyphFor` normalises the prefixed
 * ids that suggestions pass (`template:<tid>:<scope>`) and the dotted multi-
 * chart ids (`hero_journey.tension`) down to the right mark.
 */

// Shared inline styles — keep the duotone treatment DRY.
const A = { fill: 'currentColor', stroke: 'none', opacity: 0.18 } as const; // accent fill
const D = { fill: 'currentColor', stroke: 'none' } as const; // solid dot

// The voice family shares one speech-bubble shell; only the interior differs.
const bubble = (
  <path d="M5 5.5h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7l-3.5 3v-3H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" />
);

// The drawn bow — tension under load. Shared by every tension lens
// (hero's-journey tension shape, story pacing envelope, per-character tension).
const bow = (
  <>
    <path d="M7 4a10 10 0 0 1 0 16" />
    <path d="M7 4 14.5 12 7 20" />
    <circle {...D} cx="14.5" cy="12" r="1.4" />
  </>
);

export const LENS_GLYPHS: Record<string, JSX.Element> = {
  // ───────────────────────── story structure ─────────────────────────
  // Three connected arches — three movements of one structure, not a bar chart.
  three_act: (
    <>
      <path {...A} d="M9 20v-6a3 3 0 0 1 6 0v6z" />
      <path d="M2.6 20h18.8" />
      <path d="M3.4 20v-3a2.6 2.6 0 0 1 5.2 0V20" />
      <path d="M9 20v-6a3 3 0 0 1 6 0V20" />
      <path d="M15.4 20v-3a2.6 2.6 0 0 1 5.2 0V20" />
    </>
  ),
  // A loop that leaves home and returns changed.
  hero_journey: (
    <>
      <path d="M12 4a8 8 0 1 1-5.6 2.3" />
      <path d="M6.4 6.4 4 6.8M6.4 6.4 6.9 9.1" />
      <circle {...D} cx="12" cy="4" r="1.4" />
    </>
  ),
  // The drawn bow — tension under load.
  'hero_journey.tension': bow,
  pacing: bow,
  // The likability beat the sheet is named for — a cat.
  save_the_cat: (
    <>
      <circle {...A} cx="12" cy="13" r="6" />
      <path d="M8 8.5 7.5 4 11.5 7.2" />
      <path d="M16 8.5 16.5 4 12.5 7.2" />
      <circle cx="12" cy="13" r="6" />
      <circle {...D} cx="9.8" cy="12.5" r="0.9" />
      <circle {...D} cx="14.2" cy="12.5" r="0.9" />
    </>
  ),
  // The downturned theatre mask.
  tragedy: (
    <>
      <path {...A} d="M7 6c0-1 10-1 10 0 .5 6-2 11-5 11S6.5 12 7 6z" />
      <path d="M7 6c0-1 10-1 10 0 .5 6-2 11-5 11S6.5 12 7 6z" />
      <path d="M9.4 10.4q1-.9 2 0M12.6 10.4q1-.9 2 0" />
      <path d="M10 16q2-1.6 4 0" />
    </>
  ),

  // ───────────────────────── promises / loose-ends ─────────────────────────
  // What's planted comes due — seed becomes sprout.
  chekhov: (
    <>
      <path d="M4 16h16" />
      <path d="M12 16V9" />
      <path {...A} d="M12 12c-2 0-3.5-1.2-3.9-3.1 1.9-.2 3.5 1 3.9 3.1z" />
      <path d="M12 12c-2 0-3.5-1.2-3.9-3.1 1.9-.2 3.5 1 3.9 3.1z" />
      <path {...A} d="M12 10.4c1.6-.3 3-1.5 3.2-3.3-1.7.1-3 1.4-3.2 3.3z" />
      <path d="M12 10.4c1.6-.3 3-1.5 3.2-3.3-1.7.1-3 1.4-3.2 3.3z" />
      <circle {...D} cx="7" cy="17.6" r="1.1" />
    </>
  ),
  // The famous false-clue fish.
  red_herring: (
    <>
      <path {...A} d="M4 12c3-4 9-4 12 0-3 4-9 4-12 0z" />
      <path d="M4 12c3-4 9-4 12 0-3 4-9 4-12 0z" />
      <path d="M16 12 20.5 8.5v7z" />
      <circle {...D} cx="7.6" cy="11" r="0.9" />
    </>
  ),
  // Nested threads opening and closing in order — concentric brackets.
  mice_threads: (
    <>
      <path d="M8 4C4 8 4 16 8 20" />
      <path d="M16 4C20 8 20 16 16 20" />
      <path d="M11 8C9.6 10 9.6 14 11 16" />
      <path d="M13 8C14.4 10 14.4 14 13 16" />
    </>
  ),
  // A promise descending its phases under one dome.
  promise_progress_payoff: (
    <>
      <path {...A} d="M5 13a7 7 0 0 1 14 0z" />
      <path d="M5 13a7 7 0 0 1 14 0" />
      <path d="M5 13h14" />
      <path d="M6.6 16.4h10.8" />
      <path d="M8.2 19.8h7.6" />
    </>
  ),
  // The rulebook with a sigil — declared magic rules, honoured.
  hard_magic_rules: (
    <>
      <path {...A} d="M6.5 4.5h11v15l-5.5-2.5L6.5 19.5z" />
      <path d="M6.5 4.5h11v15l-5.5-2.5L6.5 19.5z" />
      <path d="M12 8 13 11l3 .2-2.3 1.9.8 2.9L12 14.4 9.5 16l.8-2.9L8 11.2l3-.2z" />
    </>
  ),

  // ───────────────────────── story · scene-level ─────────────────────────
  // The clapperboard — a scene and its mode.
  scene_pacing: (
    <>
      <path {...A} d="M3.5 9.5h17v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 9.5h17v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.7 9.3 20 7.3l.4 2.2-16.3 2z" />
      <path d="M7.5 8.1 6.7 9.4M11.5 7.6 10.7 9.4M15.5 7.1 14.7 9.4" />
    </>
  ),
  // One orb, dark to radiant — the emotional colour of a scene.
  scene_mood: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path {...A} d="M12 5a7 7 0 0 0 0 14z" />
      <path d="M12 5v14" />
      <path d="M16.6 8.6 18 7.2M18 12h2.2M16.6 15.4 18 16.8" />
    </>
  ),
  // A spark held in a frame — how much is happening.
  scene_intensity: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
      <path {...A} d="M12 6.8 13.4 10.6 17.2 12 13.4 13.4 12 17.2 10.6 13.4 6.8 12 10.6 10.6z" />
      <path d="M12 6.8 13.4 10.6 17.2 12 13.4 13.4 12 17.2 10.6 13.4 6.8 12 10.6 10.6z" />
    </>
  ),
  // The cast in a scene — overlapping figures.
  characters_present: (
    <>
      <circle cx="9" cy="9" r="2.6" />
      <path d="M4.4 18c0-2.6 2-4.2 4.6-4.2s4.6 1.6 4.6 4.2" />
      <circle cx="16.2" cy="10" r="2.2" />
      <path d="M12.6 18c0-2.3 1.6-3.7 3.6-3.7s3.6 1.4 3.6 3.7" />
    </>
  ),
  // The baited hook — how strongly a scene grabs.
  hook_opening: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <path d="M12 6.4v6a3.6 3.6 0 1 1-3.6-3.6" />
      <path d="M8.4 8.8 9.6 10.4 11.2 9.4" />
    </>
  ),
  hook_closing: (
    <g transform="rotate(180 12 12)">
      <circle cx="12" cy="5" r="1.4" />
      <path d="M12 6.4v6a3.6 3.6 0 1 1-3.6-3.6" />
      <path d="M8.4 8.8 9.6 10.4 11.2 9.4" />
    </g>
  ),

  // ───────────────────────── genre conventions ─────────────────────────
  genre_romance: (
    <>
      <path {...A} d="M12 20S4 14.5 4 9.4A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 .2c0 5.3-8 12.8-8 12.8z" />
      <path d="M12 20S4 14.5 4 9.4A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 .2c0 5.3-8 12.8-8 12.8z" />
    </>
  ),
  genre_thriller: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path {...A} d="M12 6a7.5 7.5 0 0 1 0 15z" />
      <path d="M12 13.5V9M12 13.5l3.2 2" />
      <path d="M9.5 3.5h5M12 3.5v2" />
    </>
  ),
  genre_mystery: (
    <>
      <circle cx="10" cy="10" r="5.2" />
      <path d="M13.8 13.8 19 19" />
      <circle {...D} cx="10" cy="10" r="1.1" />
    </>
  ),
  genre_fantasy: (
    <>
      <path {...A} d="M12 3.5 16 9 12 20.5 8 9z" />
      <path d="M12 3.5 16 9 12 20.5 8 9z" />
      <path d="M8 9h8" />
      <path d="M12 3.5 10 9l2 3 2-3z" />
    </>
  ),
  genre_scifi: (
    <>
      <circle {...D} cx="12" cy="12" r="1.9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(30 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(-30 12 12)" />
    </>
  ),
  genre_horror: (
    <>
      <path {...A} d="M12 4a8 8 0 1 0 6.5 12.6A6.5 6.5 0 0 1 12 4z" />
      <path d="M12 4a8 8 0 1 0 6.5 12.6A6.5 6.5 0 0 1 12 4z" />
      <path d="M16.2 5.6 17 7.4l1.8.8-1.8.8-.8 1.8-.8-1.8L13.4 8l1.8-.8z" />
    </>
  ),
  genre_literary: (
    <>
      <path {...A} d="M12 4 16 14 12 18.5 8 14z" />
      <path d="M12 4 16 14 12 18.5 8 14z" />
      <path d="M12 9v5.5" />
      <circle {...D} cx="12" cy="12.5" r="1" />
    </>
  ),
  genre_historical: (
    <>
      <path {...A} d="M9 7.5h6v10H9z" />
      <path d="M7.5 7.5h9M7.5 17.5h9" />
      <path d="M11 7.5v10M13 7.5v10" />
      <path d="M8 5.5h8l-1.4 2H9.4z" />
    </>
  ),

  // ───────────────────────── character arcs ─────────────────────────
  // The crown of power, split by a fracture.
  power_corrupts: (
    <>
      <path {...A} d="M4 17 6.5 9l3.5 3.5L12 7l2 5.5L17.5 9 20 17z" />
      <path d="M4 17 6.5 9l3.5 3.5L12 7l2 5.5L17.5 9 20 17z" />
      <path d="M4 17h16" />
      <path d="M12 7l-1 4.4 1.8 2.3-1.3 3.1" />
    </>
  ),
  // A sun cresting the horizon — moral standing rising into light.
  redemption_arc: (
    <>
      <path d="M3 17h18" />
      <path {...A} d="M7 17a5 5 0 0 1 10 0z" />
      <path d="M7 17a5 5 0 0 1 10 0" />
      <path d="M12 7.2V4.4M6.5 9 5 7.5M17.5 9 19 7.5" />
    </>
  ),
  // A stem whose bloom droops and falls.
  tragic_fall: (
    <>
      <path d="M12 20.5V11" />
      <path d="M12 11c-.5-2-2-3-4-3.4" />
      <path {...A} d="M7.8 4.4a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4z" />
      <path d="M7.8 4.4a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4z" />
      <circle {...D} cx="7.8" cy="6.6" r="0.9" />
    </>
  ),
  // The persona a character wears — a masquerade mask on a stick.
  lie_to_truth: (
    <>
      <path {...A} d="M4.5 9c0-2 3.5-3 7.5-3s7.5 1 7.5 3-2.5 3.5-4.5 3.5-2-2-3-2-1 2-3 2S4.5 11 4.5 9z" />
      <path d="M4.5 9c0-2 3.5-3 7.5-3s7.5 1 7.5 3-2.5 3.5-4.5 3.5-2-2-3-2-1 2-3 2S4.5 11 4.5 9z" />
      <circle {...D} cx="8.2" cy="9" r="1" />
      <circle {...D} cx="15.8" cy="9" r="1" />
      <path d="M12 14v4.5" />
    </>
  ),
  // The shifting weather of feeling — a face with a wave for a mouth.
  emotional_journey: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle {...D} cx="9.5" cy="10" r="1" />
      <circle {...D} cx="14.5" cy="10" r="1" />
      <path d="M8.5 14.5q1.5-1.6 3 0t3 0" />
    </>
  ),
  // Energy that strengthens — a flame.
  emotional_intensity: (
    <>
      <path {...A} d="M12 3.5c3 3 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2.5-5 .3 1.4 1 2 2 2.2-.5-2.2 0-4.2 .5-6.2z" />
      <path d="M12 3.5c3 3 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2.5-5 .3 1.4 1 2 2 2.2-.5-2.2 0-4.2 .5-6.2z" />
    </>
  ),
  // The tension a character is under — the drawn bow again.
  tension_arc: bow,
  // The helm — how much they drive events.
  agency_arc: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle {...A} cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 5v3M12 16v3M5 12h3M16 12h3" />
    </>
  ),

  // ───────────────────────── character trackers ─────────────────────────
  // A mind and the key it holds — who knows what.
  character_knowledge: (
    <>
      <circle cx="9.5" cy="9" r="3" />
      <path d="M4.5 18c0-3 2.2-5 5-5s5 2 5 4.6" />
      <circle cx="16.5" cy="7.5" r="1.7" />
      <path d="M18 8.6 19.6 10.2M19.2 8.9l1.2 1.2" />
    </>
  ),
  // Where they stand — a map pin.
  location_tracker: (
    <>
      <path {...A} d="M12 3.5a6 6 0 0 1 6 6c0 4.4-6 11-6 11S6 13.9 6 9.5a6 6 0 0 1 6-6z" />
      <path d="M12 3.5a6 6 0 0 1 6 6c0 4.4-6 11-6 11S6 13.9 6 9.5a6 6 0 0 1 6-6z" />
      <circle cx="12" cy="9.4" r="2" />
    </>
  ),
  // Body / mind state — a vial.
  condition_tracker: (
    <>
      <path d="M9.5 3.5h5" />
      <path {...A} d="M9.5 13.5a3 3 0 0 0 5 4.4 3 3 0 0 0-2.5-1.4 3 3 0 0 1-2.5-3z" />
      <path d="M10 3.5v4.2l-2.2 7.4A3 3 0 0 0 10.7 19h2.6a3 3 0 0 0 2.9-3.9L14 7.7V3.5" />
      <circle {...D} cx="13" cy="14.5" r="0.9" />
    </>
  ),

  // ───────────────────────── voice fingerprints ─────────────────────────
  // Vocabulary level — ascending bars in the bubble (simple → ornate).
  voice_vocab: (
    <>
      {bubble}
      <path d="M8 13v-1.6M10.7 13v-3.4M13.4 13v-5.2M16.1 13v-7" strokeWidth={1.4} />
    </>
  ),
  // Sentence rhythm — a waveform.
  voice_rhythm: (
    <>
      {bubble}
      <path d="M8 9.6v4M10.7 8v7M13.4 9v4M16.1 7.6v7.4" strokeWidth={1.4} />
    </>
  ),
  // Speech tone — warmth waves.
  voice_tone: (
    <>
      {bubble}
      <path d="M8 9.6c1-1 2 1 3 0s2 1 3 0 2 1 3 0" strokeWidth={1.4} />
      <path d="M8 12.4c1-1 2 1 3 0s2 1 3 0 2 1 3 0" strokeWidth={1.4} />
    </>
  ),
  // Formality — a bow-tie.
  voice_formality: (
    <>
      {bubble}
      <path {...A} d="M12 10.7 8.6 8.8v5.2L12 12.3l3.4 1.7V8.8z" />
      <path d="M12 10.7 8.6 8.8v5.2L12 12.3l3.4 1.7V8.8z" />
    </>
  ),

  // ───────────────────────── relationships ─────────────────────────
  // The reader sees what the character can't — an all-seeing eye with a keyhole.
  dramatic_irony: (
    <>
      <path {...A} d="M3 12C7 6 17 6 21 12 17 18 7 18 3 12z" />
      <path d="M3 12C7 6 17 6 21 12 17 18 7 18 3 12z" />
      <circle cx="12" cy="11" r="2.3" />
      <path d="M11.4 13 10.7 15.4h2.6L12.6 13" />
    </>
  ),
  // Two lives that overlap — closeness as shared ground.
  relationship: (
    <>
      <circle cx="9" cy="12" r="5.3" />
      <circle cx="15" cy="12" r="5.3" />
      <path {...A} d="M12 7.6a5.3 5.3 0 0 1 0 8.8 5.3 5.3 0 0 1 0-8.8z" />
    </>
  ),
  // The state of a bond between two — a link with its current state.
  relationship_state: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M8.4 12h2M13.6 12h2" />
      <path {...A} d="M12 9.6 14.4 12 12 14.4 9.6 12z" />
      <path d="M12 9.6 14.4 12 12 14.4 9.6 12z" />
    </>
  ),
  // Crossed blades, cooling toward common ground.
  rivalry: (
    <>
      <path d="M4.5 5.5 12.5 13.5" />
      <path d="M3.6 7 6 4.6" />
      <path d="M15.5 5.5 7.5 13.5" />
      <path d="M14 4.6 16.4 7" />
      <path d="M8 17.5q4 2 8 0" />
    </>
  ),
  // A node and its allegiances — the shifting web of sides.
  alliance_tracker: (
    <>
      <circle {...A} cx="12" cy="12" r="2.4" />
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="12" cy="4.6" r="1.6" />
      <circle cx="5.6" cy="16" r="1.6" />
      <circle cx="18.4" cy="16" r="1.6" />
      <path d="M12 9.6V6.2M10.4 13.4 6.8 15.2M13.6 13.4 17.2 15.2" />
    </>
  ),

  // ───────────────────────── object ─────────────────────────
  // A prized object linked into a chain — the chain of custody.
  item_custody: (
    <>
      <path {...A} d="M12 4.5 16 8.8 12 13.6 8 8.8z" />
      <path d="M12 4.5 16 8.8 12 13.6 8 8.8z" />
      <path d="M8 8.8h8M12 4.5v9.1" />
      <path d="M10.4 14a2 2.6 0 1 0 3.2 0" />
    </>
  ),
};

// Fallback — an aperture (a "lens"), for any unmapped catalogue id.
const APERTURE = (
  <>
    <circle cx="12" cy="12" r="7.2" />
    <path d="M12 4.8 15.6 11M19 14.2 11.6 12.4M5 14.2 12.4 9" />
  </>
);

// Bespoke / AI-suggested lenses (`special:…`, `custom…`) — a sparkle.
const SPARKLE = (
  <>
    <path {...A} d="M11 3.5 13 9.5 19 11.5 13 13.5 11 19.5 9 13.5 3 11.5 9 9.5z" />
    <path d="M11 3.5 13 9.5 19 11.5 13 13.5 11 19.5 9 13.5 3 11.5 9 9.5z" />
    <path d="M18.5 4 19.2 6 21.2 6.7 19.2 7.4 18.5 9.4 17.8 7.4 15.8 6.7 17.8 6z" />
  </>
);

// New launch-lens ids → the bespoke mark they reuse (each depicts WHAT it
// watches, never the chart shape) — keeps the rich glyph family on the new route.
const ALIASES: Record<string, string> = {
  hero_growth: 'redemption_arc',
  tension_curve: 'tension_arc',
  voice_holds: 'voice_tone',
  mood_map: 'scene_mood',
  whos_driving: 'agency_arc',
  key_object: 'item_custody',
  whos_where: 'location_tracker',
  who_knows: 'character_knowledge',
  story_skeleton: 'three_act',
  genre_promise: 'genre_mystery',
  character_arc_beats: 'lie_to_truth',
  loose_ends: 'chekhov',
  continuity_check: 'genre_mystery',
  // the live config/gauges lens ids → their bespoke marks (exact-match ids like
  // power_corrupts / scene_mood / item_custody / chekhov resolve directly above).
  tragic_fortune: 'tragic_fall',
  rivalry_resolves: 'rivalry',
  voice_consistency: 'voice_tone',
  story_tension: 'tension_arc',
  character_agency: 'agency_arc',
  relationship_warmth: 'relationship',
  item_prominence: 'item_custody',
  three_act_beats: 'three_act',
  mystery_conventions: 'genre_mystery',
  promise_kept: 'promise_progress_payoff',
  character_whereabouts: 'location_tracker',
  alliance_state: 'alliance_tracker',
};

/**
 * Resolve a lens id (chart id, `template:<tid>:<scope>`, or dotted chart id)
 * to its glyph. Order: exact hit → launch alias → bespoke sparkle →
 * template-prefixed → dotted-base → aperture fallback.
 */
export function glyphFor(rawId: string | number) {
  if (!rawId) return APERTURE;
  const id = String(rawId);   // preset ids can arrive as numbers
  if (LENS_GLYPHS[id]) return LENS_GLYPHS[id];
  if (ALIASES[id] && LENS_GLYPHS[ALIASES[id]]) return LENS_GLYPHS[ALIASES[id]];
  if (id.startsWith('special:') || id.startsWith('custom')) return SPARKLE;
  if (id.startsWith('template:')) {
    const tid = id.split(':')[1];
    if (tid && LENS_GLYPHS[tid]) return LENS_GLYPHS[tid];
    if (tid && tid.includes('.') && LENS_GLYPHS[tid.split('.')[0]]) return LENS_GLYPHS[tid.split('.')[0]];
  }
  if (id.includes('.') && LENS_GLYPHS[id.split('.')[0]]) return LENS_GLYPHS[id.split('.')[0]];
  return APERTURE;
}
