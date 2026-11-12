import React, { useState } from 'react';
import { ThemeProvider } from '../app/theme/ThemeProvider';
import {
  BookOpen, PenLine, Lightbulb, Users, Globe, Gauge,
  ChevronRight, ChevronDown, Plus, Star, Bell,
  SquarePen, Clock, PanelRightClose,
  ArrowUp, ChevronLeft,
} from 'lucide-react';

import '../app/app.css';
import '../app/pages/write/write.css';
import '../app/modules/chat/night-eyes.css';
import './demo.css';

/* ================================================================
 * DATA — "The Cartographer's Ink" (original sample story)
 *
 * Synopsis: in the flooded river city of Vellmoor, mapmaker's
 * apprentice Wren Halloway finds a bottle of living ink. Whatever
 * she draws on a true map of the city is real by dawn. She starts
 * by drawing a footbridge, then starts erasing things she thinks
 * the city doesn't deserve.
 * ================================================================ */

interface DemoScene {
  id: string;
  title: string;
  beats: string[];
  prose: string;
  refs: { label: string; type: string; quote: string }[];
  checks: { name: string; tone: string; score?: string; detail?: string }[];
}

interface DemoChapter {
  num: number;
  title: string;
  scenes: DemoScene[];
}

interface DemoAct {
  title: string;
  chapters: DemoChapter[];
}

const ACTS: DemoAct[] = [
  {
    title: 'ACT 1: THE INK',
    chapters: [
      {
        num: 1,
        title: 'The Quiet Archive',
        scenes: [
          {
            id: 'bottle-slips',
            title: 'The Bottle Slips',
            beats: [
              'Mother Ashgrove, keeper of the Drowned Archive, lets a bottle of living ink slip into the river',
              'Establish the rule of the ink: what is drawn on a true map becomes real by dawn',
            ],
            prose: `The Drowned Archive had no daylight, no clocks, no reason to hurry. Its shelves ran down into green water, and the old keepers drifted between them like slow fish, mending maps no one would ever read again.

Mother Ashgrove sat on the highest dry step, doing nothing at all.

"Nothing ever changes up there," she said, to no one. The other keepers didn't answer. They never did.

She turned a small glass bottle in her fingers. The ink inside moved on its own, curling like smoke. Every keeper held one, though few remembered what for. The rule was older than the city: draw it on a true map, and by dawn it is so.

She held the bottle over the water and opened her hand.

It sank, caught the current, and rolled out through the archive's broken gate toward the lights of Vellmoor, a city she had been watching for a very long time.`,
            refs: [
              { label: 'MOTHER ASHGROVE', type: 'char', quote: '"Nothing ever changes up there," she said' },
              { label: 'LIVING INK', type: 'world', quote: 'The ink inside moved on its own' },
              { label: 'DROWNED ARCHIVE', type: 'world', quote: 'The Drowned Archive had no daylight' },
            ],
            checks: [
              { name: 'POV purity', tone: 'clean', score: '✓', detail: 'Third-person limited (Ashgrove) — consistent throughout' },
              { name: 'Hook grade', tone: 'clean', score: '7', detail: 'Opens with atmosphere but could hook faster' },
              { name: 'Voice consistency', tone: 'clean', score: '✓', detail: 'Matches Ashgrove\'s idle, dry register' },
            ],
          },
          {
            id: 'wren-finds-it',
            title: 'Wren Finds It',
            beats: [
              'Wren Halloway, the best apprentice in Corrigan Tell\'s workshop, finds the bottle in the dock mud',
              'She reads the label — dismisses it as a sailor\'s joke, but takes it home',
            ],
            prose: `Wren Halloway was the kind of apprentice masters described as "a natural." Cleanest lines in the guild. First to finish every survey. The sort of person who made precision look like a habit rather than the hard work it was for everyone else.

She noticed the bottle in the mud below the fish steps at low tide.

It was a plain thing — clear glass, a cork sealed with grey wax, no maker's mark. But it sat upright in the mud, as if someone had set it there on purpose.

LIVING INK

The words were scratched into a tin label. Wren turned it over. On the back, in tiny careful letters:

What is drawn with this ink upon a true map shall be so by dawn.

She almost laughed. A sailor's joke, probably, the kind they sold to tourists with mermaid scales. But the letters were too small, too exact. And the label went on, listing conditions that read less like a joke and more like a contract.

Wren wiped the bottle clean and put it in her satchel.`,
            refs: [
              { label: 'WREN HALLOWAY', type: 'char', quote: 'Wren Halloway was the kind of apprentice' },
              { label: 'LIVING INK', type: 'world', quote: 'LIVING INK — The words were scratched' },
            ],
            checks: [
              { name: 'POV purity', tone: 'clean', score: '✓', detail: 'Third-person limited (Wren) — clean' },
              { name: 'Hook grade', tone: 'clean', score: '8', detail: 'Strong character intro with an immediate mystery object' },
              { name: 'Voice consistency', tone: 'clean', score: '✓', detail: 'Careful, exact — matches Wren\'s profile' },
            ],
          },
        ],
      },
      {
        num: 2,
        title: 'The First Line',
        scenes: [
          {
            id: 'testing-the-ink',
            title: 'Testing the Ink',
            beats: [
              'Wren reads the label closely — a true map, a steady hand, effect at dawn',
              'She draws a footbridge over the flooded Tanner\'s Lane on her master\'s city map',
            ],
            prose: `Wren spread her master's city map across the workbench and read the label again. She had read it four times now. Each time it sounded less like a joke.

I. What is drawn with this ink upon a true map shall be so by dawn.
II. The map must be true: every street measured, nothing guessed.
III. The line must be finished in one stroke, or the ink will not hold.
IV. What is erased with this ink shall be gone by dawn, as if it never stood.

By dawn. A very particular promise for a sailor's joke.

Outside, the night bell rang for the ferries. Tanner's Lane had been underwater since spring, and the children from the far side waded to school with their boots tied round their necks. Corrigan Tell's map showed the lane exactly, down to the drowned lamp post.

Wren looked at the bottle. Then at the map. Then at the bottle.

She dipped her pen.`,
            refs: [
              { label: 'WREN HALLOWAY', type: 'char', quote: 'Wren spread her master\'s city map' },
              { label: 'CORRIGAN TELL', type: 'char', quote: 'Corrigan Tell\'s map showed the lane exactly' },
              { label: 'RULES OF THE INK', type: 'world', quote: 'I. What is drawn with this ink upon a true map' },
            ],
            checks: [
              { name: 'POV purity', tone: 'clean', score: '✓', detail: 'Third-person limited (Wren) — consistent' },
              { name: 'Hook grade', tone: 'clean', score: '9', detail: 'Rules laid out, then an immediate test' },
              { name: 'Subtext', tone: 'clean', score: '✓', detail: '"She dipped her pen" — understated moment of no return' },
            ],
          },
          {
            id: 'bridge-at-dawn',
            title: 'The Bridge at Dawn',
            beats: [
              'At dawn Wren finds the footbridge over Tanner\'s Lane, mossy, as if it had always been there',
              'Her hand shakes. The ink is real.',
              'She erases Harbourmaster Sallow\'s toll gate from the map. Her hand doesn\'t shake this time.',
            ],
            prose: `Wren stood at the end of Tanner's Lane in the grey light. The water was still there, brown and slow. And over it, where nothing had been at midnight, ran a narrow stone footbridge.

There was moss in the joints. The handrail was worn smooth.

Her hand hovered over the satchel, over the map rolled inside it, the line she had drawn still tacky with ink. She had drawn it as an experiment. A test. Something no sensible person would believe could work.

The pen felt different now.

"So it holds." Wren's voice was barely a breath. A footbridge. One line. The neatest piece of work she had ever done, simpler than any survey, and stronger than anything the guild had ever built.

Behind her came the clink of a teacup on stone. Mother Ashgrove sat on the bridge's first step, sipping something that steamed, watching her with eyes the colour of river water.

"Going to draw another?" the old keeper asked, as if asking about the weather.

Wren looked down the quay. At the far end stood Harbourmaster Edwin Sallow's toll gate, where the poor paid a copper to reach the market and the rich walked round. She knew exactly where it sat on the map.

She unrolled the map and dipped the pen.

Her hand didn't shake this time.`,
            refs: [
              { label: 'WREN HALLOWAY', type: 'char', quote: '"So it holds." Wren\'s voice was barely a breath' },
              { label: 'MOTHER ASHGROVE', type: 'char', quote: 'Mother Ashgrove sat on the bridge\'s first step' },
              { label: 'EDWIN SALLOW', type: 'char', quote: 'Harbourmaster Edwin Sallow\'s toll gate' },
              { label: 'TANNER\'S LANE', type: 'world', quote: 'Wren stood at the end of Tanner\'s Lane' },
            ],
            checks: [
              { name: 'POV purity', tone: 'clean', score: '✓', detail: 'Third-person limited (Wren) — no head-hopping' },
              { name: 'Hook grade', tone: 'issues', score: '9', detail: 'Opens with the result, not the act — strong restraint' },
              { name: 'Subtext', tone: 'clean', score: '✓', detail: '"Her hand didn\'t shake this time" — the character turn, shown not told' },
              { name: 'Voice consistency', tone: 'clean', score: '✓', detail: 'Careful, exact register — matches Wren\'s profile' },
            ],
          },
        ],
      },
      {
        num: 3,
        title: 'The Night Surveyor',
        scenes: [
          {
            id: 'market-talk',
            title: 'Market Talk',
            beats: [
              'Vellmoor\'s market buzzes — bridges appearing, gates vanishing overnight',
              'Someone gives the culprit a name: "the Night Surveyor"',
            ],
            prose: '',
            refs: [],
            checks: [],
          },
          {
            id: 'surveyors-resolution',
            title: 'The Surveyor\'s Resolution',
            beats: [
              'Wren accepts her role — she will redraw the city the way it should be',
              'Her misbelief hardens: "Only I can draw it right"',
            ],
            prose: '',
            refs: [],
            checks: [],
          },
        ],
      },
    ],
  },
  {
    title: 'ACT 2: THE SEARCH',
    chapters: [
      {
        num: 4,
        title: 'The Inspector',
        scenes: [
          { id: 'false-map', title: 'The False Map', beats: ['Inspector Ilse Marrow posts a false map to bait the Night Surveyor'], prose: '', refs: [], checks: [] },
          { id: 'worthy-rival', title: 'A Worthy Rival', beats: ['Wren realizes someone is tracing her lines'], prose: '', refs: [], checks: [] },
        ],
      },
      {
        num: 5,
        title: 'The Guild Inquiry',
        scenes: [
          { id: 'corrigans-dilemma', title: 'Corrigan\'s Dilemma', beats: ['Wren\'s master is asked to help the inquiry'], prose: '', refs: [], checks: [] },
          { id: 'inside-the-workshop', title: 'Inside the Workshop', beats: ['Marrow narrows the search to licensed mapmakers'], prose: '', refs: [], checks: [] },
        ],
      },
    ],
  },
  {
    title: 'ACT 3: LINE AND COUNTERLINE',
    chapters: [
      {
        num: 6,
        title: 'The Rules of the Game',
        scenes: [
          { id: 'the-clerk', title: 'The Clerk', beats: ['Marrow plants a clerk in Corrigan\'s workshop'], prose: '', refs: [], checks: [] },
          { id: 'hidden-margin', title: 'The Hidden Margin', beats: ['Wren draws in the margin of a ledger the clerk never reads'], prose: '', refs: [], checks: [] },
        ],
      },
      {
        num: 7,
        title: 'Juniper',
        scenes: [
          { id: 'second-bottle', title: 'The Second Bottle', beats: ['Juniper Vale finds a second bottle of living ink'], prose: '', refs: [], checks: [] },
          { id: 'true-eye', title: 'The True Eye', beats: ['Juniper trades her memories of home to see every map\'s hidden lines'], prose: '', refs: [], checks: [] },
        ],
      },
    ],
  },
];

const CHAT_MESSAGES = [
  {
    role: 'user' as const,
    text: 'Does Wren\'s decision to erase the toll gate feel earned?',
  },
  {
    role: 'assistant' as const,
    thinking: { steps: 2, tools: ['search_characters → Wren Halloway', 'check_world_rules → Rules of the ink'] },
    text: `The structure earns it well. The bridge is framed as an "experiment," which fits Wren's careful nature from her character profile. The shift from shaking hand to steady hand mirrors her misbelief arc: *"Only I can draw it right."*

Seeing the bridge at dawn removes her last sensible doubt — this is no longer a guess, it's proof. One suggestion: add a brief moment where Wren thinks about the toll keeper's family before she erases the gate. It would make the turn feel chosen rather than impulsive.

Would you like to add any of these to Wren's character profile?`,
  },
  {
    role: 'user' as const,
    text: 'yes',
  },
  {
    role: 'assistant' as const,
    thinking: { steps: 1, tools: ['update_character → Wren Halloway → arc'] },
    text: `I've updated Wren's arc tracker — marking "The First Erasure" as the inciting incident and shifting her alignment from "idealist" to "antihero." Her misbelief *"Only I can draw it right"* is now tracked as the core driver of her descent arc.

Would you like me to carry this change into the outline beats that mention her moral stance?`,
  },
];

const PROPOSALS = [
  {
    id: 'p1',
    spark: '✦',
    title: <>Updated <span className="demo-proposal-em">Wren Halloway</span>'s alignment to <span className="demo-proposal-em">antihero</span> based on Chapter 2 events.</>,
    accept: 'Accept',
  },
  {
    id: 'p2',
    spark: '🔥',
    title: <>Sprinkled <span className="demo-proposal-em">8 beats</span> from <span className="demo-proposal-em">Moral Descent</span> arc into your outline.</>,
    accept: 'Accept',
  },
];

/* ================================================================
 * NAV items
 * ================================================================ */

const NAV_ITEMS = [
  { id: 'chapters', label: 'Manuscript', icon: PenLine, active: true },
  { id: 'braindumps', label: 'Ideas', icon: Lightbulb },
  { id: 'characters', label: 'People', icon: Users },
  { id: 'world', label: 'World', icon: Globe },
  { id: 'threads', label: 'Threads', icon: Star },
  { id: 'outline', label: 'Outline', icon: BookOpen },
  { id: 'gauges', label: 'Gauges', icon: Gauge },
];

/* ================================================================
 * COMPONENT
 * ================================================================ */

export default function DemoChaptersPage() {
  const [activeSceneId, setActiveSceneId] = useState('bridge-at-dawn');
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set([1, 2]));
  const [dismissedProposals, setDismissedProposals] = useState<Set<string>>(new Set());
  const [sugbarOpen, setSugbarOpen] = useState(true);

  // Find active scene + chapter
  let activeScene: DemoScene | null = null;
  let activeChapter: DemoChapter | null = null;
  for (const act of ACTS) {
    for (const ch of act.chapters) {
      for (const sc of ch.scenes) {
        if (sc.id === activeSceneId) {
          activeScene = sc;
          activeChapter = ch;
        }
      }
    }
  }

  const toggleChapter = (num: number) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(num)) { next.delete(num); } else { next.add(num); }
      return next;
    });
  };

  const _totalSceneCount = ACTS.reduce((sum, a) => a.chapters.reduce((s, c) => s + c.scenes.length, sum), 0);

  // Find scene index within chapter
  const sceneIndex = activeChapter?.scenes.findIndex(s => s.id === activeSceneId) ?? 0;

  const visibleProposals = PROPOSALS.filter(p => !dismissedProposals.has(p.id));

  return (
    <ThemeProvider>
      <div className="wv2-root wv2-dock-open demo-root" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
        {/* ──── TOPBAR ──── */}
        <header className="wv2-topbar">
          <button className="wv2-topbar-brand" style={{ border: 0, background: 'none', cursor: 'pointer' }}>
            <BookOpen size={16} className="wv2-topbar-brand-icon" />
            WriterVerse
          </button>
          <span className="wv2-topbar-sep" />
          <div className="wv2-topbar-proj">
            <span className="wv2-topbar-title">The Cartographer's Ink</span>
          </div>

          <div className="wv2-seg" role="group" aria-label="Project status">
            <button className="wv2-seg-btn" type="button">Planning</button>
            <button className="wv2-seg-btn is-active" type="button">Writing</button>
            <button className="wv2-seg-btn" type="button">Editing</button>
          </div>

          <span className="wv2-topbar-spacer" />

          <div className="wv2-topbar-gauge">
            <button className="wv2-topbar-watch is-on" style={{ border: 0, background: 'none', cursor: 'pointer' }}>
              <span className="wv2-topbar-dot wv2-topbar-dot-pulse" />
              Auto-watch
            </button>
            <span className="wv2-topbar-pill wv2-topbar-budget">
              <b>4,883.9k</b> tokens
            </span>
          </div>

          <span className="wv2-topbar-plan">FREE</span>

          <button style={{ border: 0, background: 'none', color: 'var(--ink-3)', cursor: 'pointer', position: 'relative' }}>
            <Bell size={16} />
          </button>

          <div className="wv2-topbar-avatar-wrap">
            <button className="wv2-topbar-avatar">S</button>
          </div>
        </header>

        {/* ──── BODY ──── */}
        <div className="wv2-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* ──── SIDEBAR ──── */}
          <aside className="wv2-sidebar" style={{ width: 78, flexShrink: 0 }}>
            <div className="wv2-sidebar-panel" style={{ position: 'relative', width: 78, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <nav className="wv2-nav" style={{ flex: 1 }}>
                {NAV_ITEMS.map(item => (
                  <button
                    key={item.id}
                    className={`wv2-nav-item${item.active ? ' is-active' : ''}`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      padding: '10px 0', border: 0, background: item.active ? 'var(--surface)' : 'none',
                      cursor: 'pointer', width: '100%', borderRadius: 8,
                      margin: '2px 10px', maxWidth: 58,
                    }}
                  >
                    <span className="wv2-nav-icon-wrap">
                      <item.icon size={20} strokeWidth={1.85} className="wv2-nav-icon" style={{ color: item.active ? 'var(--terra-deep)' : 'var(--ink-3)' }} />
                    </span>
                    <span className="wv2-nav-sublabel" style={{ fontSize: 9, color: item.active ? 'var(--terra-deep)' : 'var(--ink-3)', fontWeight: item.active ? 600 : 400 }}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* ──── OUTLINE RAIL ──── */}
          <div className="demo-outline-rail">
            <div className="demo-outline-head">
              <div className="demo-outline-eyebrow">CHAPTERS & SCENES</div>
              <div className="demo-outline-title">Manuscript</div>
            </div>
            <div className="demo-outline-acts">
              {ACTS.map((act, ai) => {
                const sceneCount = act.chapters.reduce((s, c) => s + c.scenes.length, 0);
                return (
                  <div key={ai}>
                    <div className="demo-act-head">
                      <span className="demo-act-dot" />
                      <span>{act.title}</span>
                      <span className="demo-act-count">{sceneCount} SC</span>
                    </div>
                    <div className="demo-chap">
                      {act.chapters.map(ch => {
                        const isExpanded = expandedChapters.has(ch.num);
                        const isCurrent = activeChapter?.num === ch.num;
                        return (
                          <div key={ch.num} style={{ marginBottom: 2 }}>
                            <div
                              className={`demo-chap-row${isCurrent ? ' is-current' : ''}`}
                              onClick={() => toggleChapter(ch.num)}
                            >
                              <span className="demo-chap-toggle">
                                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              </span>
                              <span className="demo-chap-num">{ch.num}</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ch.title}
                              </span>
                            </div>
                            {isExpanded && (
                              <div className="demo-scene-list">
                                {ch.scenes.map(sc => (
                                  <div key={sc.id}>
                                    <button
                                      className={`demo-scene-item${sc.id === activeSceneId ? ' is-active' : ''}`}
                                      onClick={() => setActiveSceneId(sc.id)}
                                    >
                                      <span className="demo-scene-dot" />
                                      <span>{sc.title}</span>
                                    </button>
                                    {sc.id === activeSceneId && sc.beats.length > 0 && (
                                      <div className="demo-beat-list">
                                        {sc.beats.map((b, bi) => (
                                          <div key={bi} className="demo-beat">{b}</div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                <button className="demo-add-btn">
                                  <Plus size={10} /> outline scene
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ──── MAIN CONTENT ──── */}
          <main className="wv2-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="wv2-content" style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
              <div className="wr-page" style={{ maxWidth: 1120, margin: '0 auto', display: 'flex' }}>
                {/* MANUSCRIPT COLUMN */}
                <div className="wr-manuscript" style={{ flex: 1, padding: '24px 38px 80px' }}>
                  {activeChapter && activeScene && (
                    <>
                      {/* Chapter Header */}
                      <header className="wr-chap-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 18, marginBottom: 24 }}>
                        <div>
                          <div className="wr-eyebrow" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PenLine size={11} />
                            Chapter {activeChapter.num}
                          </div>
                          <div style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.02em' }}>
                            {activeChapter.title}
                          </div>
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--ui)' }}>POV...</span>
                            <select style={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 5, padding: '3px 8px', background: 'var(--surface)', fontFamily: 'var(--ui)', color: 'var(--ink-2)' }}>
                              <option>Third-person limited (Wren)</option>
                              <option>Third-person limited (Marrow)</option>
                              <option>Third-person limited (Ashgrove)</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--ui)' }}>
                            {activeChapter.scenes.length} scenes
                            <span className="wr-dotpip" style={{ display: 'inline-block', width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-4)', margin: '0 6px', verticalAlign: 'middle' }} />
                            {activeScene.prose ? activeScene.prose.split(/\s+/).length : 0} words
                          </span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
                              <ChevronLeft size={14} />
                            </button>
                            <button style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      </header>

                      {/* Scene Block */}
                      <article className="wr-scene-block is-focused" style={{ position: 'relative', padding: '18px 0 22px' }}>
                        <div className="wr-scene-head" style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                          <div className="wr-scene-stmeta" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                            <span className="wr-scene-num" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--terra-deep)' }}>
                              {sceneIndex + 1}
                            </span>
                            <span style={{ fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', textTransform: 'none' }}>
                              {activeScene.title}
                            </span>
                            <span style={{ flex: 1 }} />
                            <span className="wr-scene-acts" style={{ display: 'flex', gap: 6, opacity: 1 }}>
                              <button className="wr-scene-ne-btn" style={{
                                padding: '4px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 500,
                                border: '1px solid var(--line)', background: 'var(--surface)',
                                color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--ui)',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}>
                                💬 Discuss
                              </button>
                              <button className="wr-scene-ne-btn" style={{
                                padding: '4px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 500,
                                border: '1px solid var(--line)', background: 'var(--surface)',
                                color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--ui)',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}>
                                ✦ Build on this
                              </button>
                              <button style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
                                ···
                              </button>
                            </span>
                          </div>
                        </div>

                        {/* Editor content */}
                        <div className="demo-prose">
                          {activeScene.prose ? (
                            activeScene.prose.split('\n\n').map((para, i) => (
                              <p key={i}>{para}</p>
                            ))
                          ) : (
                            <p style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
                              Start writing this scene...
                            </p>
                          )}
                        </div>

                        {/* Scene footer */}
                        {activeScene.prose && (
                          <div className="wr-scene-foot" style={{ fontSize: 10, display: 'flex', gap: 7, marginTop: 12 }}>
                            <span className="wr-save wr-save-done" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--sage)' }}>
                              <span className="wr-save-pip" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sage)' }} />
                              saved
                            </span>
                          </div>
                        )}
                      </article>

                      {/* Second scene in chapter (collapsed preview) */}
                      {activeChapter.scenes.length > 1 && sceneIndex === 0 && (
                        <>
                          <div style={{ borderTop: '1px dashed var(--line-2)', margin: '12px 0' }} />
                          <article className="wr-scene-block" style={{ padding: '18px 0 22px', opacity: 0.6 }}>
                            <div className="wr-scene-head" style={{ display: 'flex', alignItems: 'center' }}>
                              <div className="wr-scene-stmeta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="wr-scene-num" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                                  2
                                </span>
                                <span style={{ fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-2)' }}>
                                  {activeChapter.scenes[1].title}
                                </span>
                              </div>
                            </div>
                          </article>
                        </>
                      )}

                      {/* Bottom scene actions */}
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                        <button style={{
                          padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                          border: '1px solid var(--line)', background: 'var(--surface)',
                          color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--ui)',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>
                          💬 Discuss
                        </button>
                        <button style={{
                          padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                          border: '1px solid var(--line)', background: 'var(--surface)',
                          color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--ui)',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>
                          ✦ Build on this
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* MARGINALIA COLUMN */}
                {activeScene && activeScene.prose && (
                  <aside className="wr-ctx" style={{ flex: '0 0 268px', width: 268, padding: '22px 22px 22px 28px' }}>
                    {/* Scene tag */}
                    <div className="wr-scene-tag" style={{ fontSize: 9.5, borderBottom: '1px dashed var(--line-2)', paddingBottom: 8, marginBottom: 14 }}>
                      <span style={{ fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>SCENE {sceneIndex + 1}</span>
                      <span style={{ margin: '0 5px', color: 'var(--ink-4)' }}>·</span>
                      <span style={{ color: 'var(--ink-2)', textTransform: 'none' }}>{activeScene.title}</span>
                    </div>

                    {/* Pipeline toggles */}
                    <div className="wr-pipes" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                      {['Scene summary', 'Resolve nouns & pronouns', 'POV purity (head-hopping)', 'Hook grade (open / close)', 'Subtext (on-the-nose dialogue)', 'Voice consistency'].map(p => (
                        <button key={p} className="wr-pipe is-on" style={{
                          padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 500,
                          border: '1px solid var(--terra)', background: 'var(--terra-soft)',
                          color: 'var(--terra-deep)', cursor: 'pointer', fontFamily: 'var(--ui)',
                        }}>
                          {p}
                        </button>
                      ))}
                    </div>

                    {/* References & Pronouns */}
                    <div style={{ marginBottom: 16 }}>
                      <div className="wr-ctx-head" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
                        REFERENCES & PRONOUNS
                      </div>
                      <div className="wr-glosses" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {activeScene.refs.map((ref, i) => (
                          <div key={i} className="wr-gloss" data-type={ref.type} style={{ padding: '7px 0 8px 14px', borderLeft: `2px solid ${ref.type === 'char' ? 'var(--terra)' : 'var(--teal)'}` }}>
                            <div className="wr-gloss-label" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: ref.type === 'char' ? 'var(--terra-deep)' : 'var(--teal)', marginBottom: 3 }}>
                              {ref.type === 'char' ? '👤' : '🌍'} {ref.label}
                            </div>
                            <div className="wr-gloss-body" style={{ fontSize: 12.5, fontFamily: 'var(--serif)', color: 'var(--ink-2)', fontStyle: 'italic' }}>
                              "{ref.quote}"
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Scene Checks */}
                    <div style={{ marginBottom: 16 }}>
                      <div className="wr-ctx-head" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                        SCENE CHECKS
                      </div>
                      <div className="wr-checks" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {activeScene.checks.map((chk, i) => (
                          <div key={i} className="wr-chk-head" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                            <span className="wr-chk-dot" style={{
                              width: 6, height: 6, borderRadius: '50%', flex: '0 0 6px',
                              background: chk.tone === 'clean' ? 'var(--sage)' : chk.tone === 'issues' ? 'var(--terra)' : 'var(--ink-4)',
                            }} />
                            <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--ui)', color: 'var(--ink-2)' }}>
                              {chk.name}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', fontFamily: 'var(--ui)' }}>
                              {chk.score}
                            </span>
                            <ChevronRight size={10} style={{ color: 'var(--ink-4)' }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Link actions */}
                    <div className="wr-attach-pick" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button style={{
                        padding: '6px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 500,
                        border: '1px solid var(--line)', background: 'var(--surface)',
                        color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--ui)',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                        ✦ Link Brain Dumps
                      </button>
                      <button style={{
                        padding: '6px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 500,
                        border: '1px solid var(--line)', background: 'var(--surface)',
                        color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--ui)',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                        ○ Link Worldbuilding
                      </button>
                    </div>

                    {/* Suggestions */}
                    <div style={{ marginTop: 16 }}>
                      <div className="wr-ctx-head" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                        A FEW YOU COULD PULL IN
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {[
                          { icon: '✦', text: 'The rules of the living ink — 6 sub-rules extracted...' },
                          { icon: '✦', text: 'Wren discovers the bottle has a previous owner...' },
                          { icon: '○', text: 'Drowned Archive geography' },
                        ].map((s, i) => (
                          <div key={i} style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--ui)', display: 'flex', alignItems: 'flex-start', gap: 5, padding: '2px 0' }}>
                            <span style={{ color: 'var(--gold)', flexShrink: 0 }}>{s.icon}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </aside>
                )}
              </div>
            </div>
          </main>

          {/* ──── NIGHT EYES PANEL (docked) ──── */}
          <aside className="ne-panel" style={{ zIndex: 91 }}>
            {/* Header */}
            <header className="ne-head">
              <div className="ne-avatar" />
              <div className="ne-meta">
                <div className="ne-name">
                  The Reader
                  <span className="ne-page-chip">
                    <span className="dot" />
                    Chapters
                  </span>
                </div>
                <div className="ne-status">
                  <span>reading along</span>
                </div>
              </div>
              <div className="ne-acts">
                <button className="ne-iconbtn ne-iconbtn--new" type="button" title="New thread">
                  <SquarePen size={14} />
                </button>
                <button className="ne-iconbtn ne-iconbtn--history" type="button" title="History">
                  <Clock size={14} />
                  <span className="ne-count">3</span>
                </button>
                <div className="ne-winctl">
                  <button className="ne-iconbtn" type="button" title="Undock">
                    <PanelRightClose size={12} />
                  </button>
                </div>
              </div>
            </header>

            {/* Chat thread */}
            <div className="ne-thread">
              {CHAT_MESSAGES.map((msg, i) => {
                if (msg.role === 'user') {
                  return (
                    <div key={i} className="ne-msg user">
                      <div className="ne-bubble">{msg.text}</div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="ne-msg assistant">
                    {msg.thinking && (
                      <div className="ne-steps open">
                        <div className="ne-steps-head">
                          <span className="ne-think-ic" style={{ color: 'var(--gold)', fontSize: 11 }}>✦</span>
                          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>THOUGHT FOR {msg.thinking.steps} {msg.thinking.steps === 1 ? 'STEP' : 'STEPS'}</span>
                          <span className="ne-think-chev" style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>›</span>
                        </div>
                        <div className="ne-steps-body">
                          {msg.thinking.tools.map((tool, ti) => (
                            <div key={ti} className="ne-step" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--ink-3)' }}>
                              <span style={{ color: 'var(--sage)', fontSize: 10 }}>✓</span>
                              <span style={{ fontFamily: 'var(--ui)' }}>{tool}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="ne-body">
                      {msg.text.split('\n\n').map((para, pi) => {
                        const parts = para.split(/(\*[^*]+\*)/g);
                        return (
                          <p key={pi}>
                            {parts.map((part, parti) => {
                              if (part.startsWith('*') && part.endsWith('*')) {
                                return <em key={parti}>{part.slice(1, -1)}</em>;
                              }
                              return <React.Fragment key={parti}>{part}</React.Fragment>;
                            })}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Suggestions bar */}
            <div className={`ne-sugbar${sugbarOpen ? ' is-open' : ''}`}>
              {sugbarOpen && visibleProposals.length > 0 && (
                <div className="ne-sugbar-preview">
                  <div className="ne-sugbar-pager">
                    <button className="ne-sugbar-pager-btn" disabled>
                      <ChevronLeft size={10} />
                    </button>
                    <span className="ne-sugbar-pager-lbl">1 OF {visibleProposals.length}</span>
                    <button className="ne-sugbar-pager-btn">
                      <ChevronRight size={10} />
                    </button>
                  </div>
                  {/* Show first proposal */}
                  <div className="demo-proposal-card">
                    <div className="demo-proposal-head">
                      <span className="demo-proposal-spark">{visibleProposals[0].spark}</span>
                      <span className="demo-proposal-title">{visibleProposals[0].title}</span>
                    </div>
                    <div className="demo-proposal-actions">
                      <button
                        className="demo-proposal-btn"
                        onClick={() => setDismissedProposals(prev => new Set([...prev, visibleProposals[0].id]))}
                      >
                        Dismiss
                      </button>
                      <button
                        className="demo-proposal-btn demo-proposal-btn--primary"
                        onClick={() => setDismissedProposals(prev => new Set([...prev, visibleProposals[0].id]))}
                      >
                        {visibleProposals[0].accept}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <button className="ne-sugbar-count" onClick={() => setSugbarOpen(!sugbarOpen)}>
                <span className="ne-sugbar-dots">
                  <span className="ne-sugbar-dot" />
                  <span className="ne-sugbar-dot" />
                  <span className="ne-sugbar-dot" />
                  <span className="ne-sugbar-dot" />
                </span>
                <span className="ne-sugbar-lbl"><b>{visibleProposals.length} proposals</b> · 1 hint</span>
                <span className="ne-sugbar-act">see all</span>
                <span className="ne-sugbar-chev">→</span>
              </button>
            </div>

            {/* Quick chips */}
            <div className="ne-quick" style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto' }}>
              {[
                'What should happen in this scene?',
                'Check this scene for consistency',
                'Does Wren\'s voice match her profile?',
              ].map(c => (
                <button key={c} className="ne-qchip" type="button">
                  <span className="gl">✦</span>{c}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="ne-input-wrap">
              <div className="ne-input">
                <textarea
                  placeholder="ask Night Eyes about your story…"
                  rows={1}
                  style={{ flex: 1, border: 0, background: 'none', outline: 'none', resize: 'none', fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink)', padding: '6px 0' }}
                />
                <button className="ne-input-send" type="button" style={{ width: 28, height: 28, borderRadius: 7, border: 0, background: 'var(--terra)', color: 'white', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <ArrowUp size={12} />
                </button>
              </div>
              <div className="ne-input-hint">
                <span>reading along · same thread across pages</span>
                <span><kbd>↵</kbd> send <kbd>⇧↵</kbd> newline</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </ThemeProvider>
  );
}
