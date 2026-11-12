import React, { useState } from 'react';
import './demo-weave.css';

/* ================================================================
 * DATA — Elara's story (hard sci-fi, first contact through language)
 *
 * Synopsis: Elara Voss is a xenolinguist on the research vessel
 * Meridian. When the ship intercepts an alien signal, she discovers
 * it's not just communication — the language itself rewrites memory.
 * A crewmember named Jonah was erased from everyone's memory but
 * his name keeps appearing in corrupted records. As Elara decodes
 * the signal, the language begins changing how she thinks.
 * ================================================================ */

interface Beat {
  id: string;
  text: string;
  covered: boolean;
  kind: 'heading' | 'text' | 'placeholder';
  chapter?: number;
  note?: { icon: string; text: string; type?: 'weave' | 'marker' } | null;
}

interface Thread {
  id: string;
  name: string;
  tag: string;
  color: string;
  beats: Beat[];
}

const THREADS: Thread[] = [
  {
    id: 't1',
    name: "Elara's Transformation",
    tag: 'Internal',
    color: '#c4841d',
    beats: [
      { id: 'h1', text: 'Setup', covered: false, kind: 'heading' },
      {
        id: 'b1',
        text: "Elara aboard the Meridian — brilliant linguist, socially isolated, happiest when solving problems that don't involve people.",
        covered: true,
        kind: 'text',
        chapter: 1,
      },
      {
        id: 'b2',
        text: 'The alien signal arrives. Everyone hears noise. Elara hears structure.',
        covered: true,
        kind: 'text',
        chapter: 1,
        note: { icon: '↑', text: 'this is her call', type: 'marker' },
      },
      { id: 'h2', text: 'Progression', covered: false, kind: 'heading' },
      {
        id: 'b3',
        text: 'She volunteers for the decryption team — the crew votes no, she does it anyway.',
        covered: true,
        kind: 'text',
        chapter: 2,
        note: { icon: '⁄', text: 'weaves with Captain Osei', type: 'weave' },
      },
      {
        id: 'b4',
        text: 'First breakthrough: the language has no nouns. It describes the world as pure process. Elara starts dreaming in it.',
        covered: true,
        kind: 'text',
        chapter: 4,
      },
      {
        id: 'b5',
        text: "She finds Jonah's name in a corrupted log — a person no one remembers. She becomes obsessed.",
        covered: false,
        kind: 'placeholder',
        chapter: 5,
        note: { icon: '⁄', text: 'weaves with Jonah', type: 'weave' },
      },
      {
        id: 'b6',
        text: 'The language starts changing how she thinks — she stops seeing objects, starts seeing relationships between things.',
        covered: true,
        kind: 'text',
        chapter: 4,
        note: { icon: '↑', text: 'this is her transformation', type: 'marker' },
      },
      { id: 'h3', text: 'Payoff', covered: false, kind: 'heading' },
      {
        id: 'b7',
        text: 'She realizes the aliens didn\'t erase Jonah. Their language did. It rewrites what the listener considers "real."',
        covered: false,
        kind: 'placeholder',
        chapter: 6,
      },
      {
        id: 'b8',
        text: 'The choice: destroy the signal and save the crew, or complete the translation and change humanity — but lose herself.',
        covered: false,
        kind: 'placeholder',
        chapter: 6,
      },
    ],
  },
  {
    id: 't2',
    name: 'The Erasure Protocol',
    tag: 'Structure',
    color: '#2d7a7a',
    beats: [
      { id: 'h4', text: 'Act I — The Signal', covered: false, kind: 'heading' },
      {
        id: 'b9',
        text: 'MERIDIAN intercepts a repeating signal from deep space — not random noise, structured.',
        covered: true,
        kind: 'text',
        chapter: 1,
      },
      {
        id: 'b10',
        text: 'Crew debate: respond or run. Captain Osei orders radio silence and investigation.',
        covered: true,
        kind: 'text',
        chapter: 2,
      },
      { id: 'h5', text: 'Act II — The Ghost', covered: false, kind: 'heading' },
      {
        id: 'b11',
        text: 'Corrupted logs surface — "Jonah Reeves" appears in 47 entries, but no such person is on the manifest.',
        covered: true,
        kind: 'text',
        chapter: 3,
      },
      {
        id: 'b12',
        text: 'Physical evidence: a bunk with worn sheets, a coffee mug with initials J.R., a half-written letter to someone named Mira.',
        covered: true,
        kind: 'text',
        chapter: 3,
        note: { icon: '⁄', text: 'weaves with Elara', type: 'weave' },
      },
      {
        id: 'b13',
        text: 'Elara\'s decryption reveals the signal is a warning: "Do not speak us. We change what remembers."',
        covered: false,
        kind: 'placeholder',
        chapter: 5,
      },
      {
        id: 'b14',
        text: 'More crew members start forgetting — small things first, then people. The erasure is spreading.',
        covered: true,
        kind: 'text',
        chapter: 5,
      },
      { id: 'h6', text: 'Act III — The Translation', covered: false, kind: 'heading' },
      {
        id: 'b15',
        text: 'Elara realizes the alien language IS the mechanism — speaking it rewrites neural connections.',
        covered: false,
        kind: 'placeholder',
        chapter: 6,
      },
      {
        id: 'b16',
        text: 'Captain Osei orders the signal destroyed. Elara has 12 hours to finish the translation.',
        covered: false,
        kind: 'placeholder',
        chapter: 6,
      },
      {
        id: 'b17',
        text: "The final transmission: the aliens aren't hostile. They're lonely. They erased Jonah by accident — their language can't help it.",
        covered: false,
        kind: 'placeholder',
        chapter: 6,
      },
    ],
  },
];

const CHAPTERS = [
  { num: 1, title: 'The Signal' },
  { num: 2, title: 'Radio Silence' },
  { num: 3, title: 'The Ghost' },
  { num: 4, title: 'First Contact' },
  { num: 5, title: 'The Warning' },
  { num: 6, title: 'The Choice' },
];

/* ================================================================
 * COMPONENTS
 * ================================================================ */

function BrowserFrame({
  url,
  children,
  className,
}: {
  url?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`dwv-frame ${className || ''}`}>
      <div className="dwv-frame-bar">
        <div className="dwv-frame-dots">
          <span className="dwv-frame-dot r" />
          <span className="dwv-frame-dot y" />
          <span className="dwv-frame-dot g" />
        </div>
        <span className="dwv-frame-url">{url || 'writerverse.app'}</span>
      </div>
      <div className="dwv-frame-body">{children}</div>
    </div>
  );
}

/* ── Simplified app header inside the frame ── */

function AppBar() {
  return (
    <div className="dwv-app-bar">
      <span className="dwv-app-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
        WriterVerse
      </span>
      <span className="dwv-app-sep" />
      <span className="dwv-app-proj">Elara's Journey</span>
      <div className="dwv-app-nav">
        <span className="dwv-app-nav-item">Manuscript</span>
        <span className="dwv-app-nav-item">Ideas</span>
        <span className="dwv-app-nav-item">People</span>
        <span className="dwv-app-nav-item">World</span>
        <span className="dwv-app-nav-item is-active">Threads</span>
        <span className="dwv-app-nav-item">Outline</span>
      </div>
    </div>
  );
}

/* ── Story Map — the timeline visualization ── */

function StoryMap() {
  // Build chapter → thread presence map
  const coverage = CHAPTERS.map((ch) =>
    THREADS.map((t) => {
      const beatsHere = t.beats.filter(
        (b) => b.kind !== 'heading' && b.chapter === ch.num,
      );
      if (!beatsHere.length) return null;
      return {
        count: beatsHere.length,
        anyCovered: beatsHere.some((b) => b.covered),
        allGap: beatsHere.every((b) => !b.covered),
      };
    }),
  );

  const _cols = CHAPTERS.length + 1; // +1 for the thread name column

  return (
    <div className="dwv-map">
      <div className="dwv-map-label">Story map</div>
      <div
        className="dwv-map-grid"
        style={{
          gridTemplateColumns: `120px repeat(${CHAPTERS.length}, 1fr)`,
        }}
      >
        {/* Header row */}
        <div /> {/* spacer for name column */}
        {CHAPTERS.map((ch, ci) => {
          const _bothPresent = coverage[ci].every((p) => p != null);
          return (
            <div key={ch.num} className="dwv-map-col-label">
              Ch {ch.num}
              <span className="ch-title">{ch.title}</span>
            </div>
          );
        })}

        {/* Thread rows */}
        {THREADS.map((t, ti) => {
          // Find first and last chapter with beats for this thread
          const presentCols = CHAPTERS.map((ch, ci) => coverage[ci][ti] != null);
          const firstIdx = presentCols.indexOf(true);
          const lastIdx = presentCols.lastIndexOf(true);

          return (
            <React.Fragment key={t.id}>
              <div
                className="dwv-map-name"
                style={{ '--tc': t.color } as React.CSSProperties}
              >
                {t.name}
              </div>
              {CHAPTERS.map((ch, ci) => {
                const presence = coverage[ci][ti];
                const bothPresent = coverage[ci].every((p) => p != null);
                const isFilled = presence && presence.anyCovered;
                const isGap = presence && presence.allGap;
                const inRange = ci >= firstIdx && ci <= lastIdx;

                return (
                  <div
                    key={ch.num}
                    className={`dwv-map-cell${bothPresent ? ' is-intersection' : ''}`}
                    style={{ '--tc': t.color } as React.CSSProperties}
                  >
                    {/* Connecting line segment */}
                    {inRange && ci < lastIdx && (
                      <div
                        className="dwv-map-track-line"
                        style={{
                          left: '50%',
                          right: '-50%',
                          '--tc': t.color,
                          background: t.color,
                          opacity: 0.18,
                        } as React.CSSProperties}
                      />
                    )}
                    {inRange && ci > firstIdx && (
                      <div
                        className="dwv-map-track-line"
                        style={{
                          left: '-50%',
                          right: '50%',
                          '--tc': t.color,
                          background: t.color,
                          opacity: 0.18,
                        } as React.CSSProperties}
                      />
                    )}
                    {/* Dot */}
                    {presence && (
                      <div
                        className={`dwv-map-dot ${isFilled ? 'filled' : 'gap'}`}
                        style={{ '--tc': t.color } as React.CSSProperties}
                        title={`${t.name} · Ch ${ch.num}: ${presence.count} beat${presence.count > 1 ? 's' : ''}${isGap ? ' (gap)' : ''}`}
                      />
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ── Thread glyph (the thread squiggle icon) ── */

function ThreadGlyph({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 18c5 0 5-12 10-12 M4 6c5 0 5 12 10 12 M18 5v.01 M18 19v.01" />
    </svg>
  );
}

/* ── Thread card ── */

function ThreadCard({
  thread,
  expanded,
  onToggle,
}: {
  thread: Thread;
  expanded: boolean;
  onToggle: () => void;
}) {
  const realBeats = thread.beats.filter((b) => b.kind !== 'heading');
  const covered = realBeats.filter((b) => b.covered).length;
  const total = realBeats.length;

  return (
    <div className="dwv-thread" style={{ '--tc': thread.color } as React.CSSProperties}>
      <div className="dwv-thread-head" onClick={onToggle}>
        <span className="dwv-thread-glyph">
          <ThreadGlyph color={thread.color} />
        </span>
        <span className="dwv-thread-name">{thread.name}</span>
        <span className="dwv-thread-tag">{thread.tag}</span>
        <div className="dwv-thread-meta">
          <span>
            {covered}/{total} written
          </span>
          <div className="dwv-thread-switch">
            <button className="dwv-thread-switch-btn is-on">Write</button>
            <button className="dwv-thread-switch-btn">Analysis</button>
          </div>
        </div>
        <span className="dwv-thread-chev">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="dwv-thread-body">
          <ol className="dwv-beats">
            {thread.beats.map((beat) => {
              if (beat.kind === 'heading') {
                return (
                  <li key={beat.id} className="dwv-beat heading">
                    <span className="dwv-beat-text">{beat.text}</span>
                  </li>
                );
              }
              return (
                <li key={beat.id} className="dwv-beat">
                  <span
                    className={`dwv-beat-mk ${beat.covered ? 'filled' : 'gap'}`}
                    style={{ '--tc': thread.color } as React.CSSProperties}
                  />
                  <div className="dwv-beat-text">
                    {beat.text}
                    {beat.note && (
                      <div
                        className={`dwv-beat-note${beat.note.type === 'weave' ? ' weave' : ''}`}
                      >
                        <span>{beat.note.icon}</span>
                        <span>{beat.note.text}</span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="dwv-thread-foot">
            <button className="dwv-add-beat">+ add a beat</button>
            <span style={{ flex: 1 }} />
            <button className="dwv-thread-action ai">
              <span style={{ marginRight: 4 }}>✦</span> flesh out more
            </button>
            <button className="dwv-thread-action">Discuss</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Background frame: Characters ── */

function BgCharacters() {
  const chars = [
    { name: 'Elara Voss', role: 'Xenolinguist · Protagonist', color: '#c4841d', initial: 'E' },
    { name: 'Jonah Reeves', role: 'The Erased · Deuteragonist', color: '#6a6a8a', initial: 'J' },
    { name: 'Captain Osei', role: 'Commander · Antagonist', color: '#2d7a7a', initial: 'O' },
  ];
  return (
    <div className="dwv-bg-content">
      {chars.map((c) => (
        <div key={c.name} className="dwv-bg-char-card">
          <div className="dwv-bg-char-avatar" style={{ background: c.color }}>
            {c.initial}
          </div>
          <div>
            <div className="dwv-bg-char-name">{c.name}</div>
            <div className="dwv-bg-char-role">{c.role}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Background frame: Outline ── */

function BgOutline() {
  return (
    <div className="dwv-bg-content">
      <div className="dwv-bg-outline-item">
        Act 1 — The Signal
        <div className="dwv-bg-outline-ch">Chapter 1: The Signal</div>
        <div className="dwv-bg-outline-ch">Chapter 2: Radio Silence</div>
      </div>
      <div className="dwv-bg-outline-item">
        Act 2 — The Ghost
        <div className="dwv-bg-outline-ch">Chapter 3: The Ghost</div>
        <div className="dwv-bg-outline-ch">Chapter 4: First Contact</div>
        <div className="dwv-bg-outline-ch">Chapter 5: The Warning</div>
      </div>
      <div className="dwv-bg-outline-item">
        Act 3 — The Translation
        <div className="dwv-bg-outline-ch">Chapter 6: The Choice</div>
      </div>
    </div>
  );
}

/* ================================================================
 * PAGE
 * ================================================================ */

export default function DemoWeavePage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['t1']));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="dwv-page">
      {/* ── Hero ── */}
      <div className="dwv-hero">
        <h1>
          Two storylines.
          <br />
          One story.
        </h1>
        <p>
          Elara's sci-fi novel — from scattered threads
          <br />
          to a coherent outline.
        </p>
      </div>

      {/* ── Stage (positions the bg frames relative to the main frame) ── */}
      <div className="dwv-stage">
        {/* Background frame — Characters (top right) */}
        <div className="dwv-bg-frame dwv-bg-1">
          <BrowserFrame url="writerverse.app/elara/characters">
            <BgCharacters />
          </BrowserFrame>
        </div>

        {/* Background frame — Outline (bottom left) */}
        <div className="dwv-bg-frame dwv-bg-2">
          <BrowserFrame url="writerverse.app/elara/outline">
            <BgOutline />
          </BrowserFrame>
        </div>

        {/* ── Main browser frame ── */}
        <BrowserFrame
          url="writerverse.app/project/elara/threads"
          className="dwv-main-frame"
        >
          <AppBar />

          {/* Page header */}
          <div className="dwv-page-head">
            <div className="dwv-page-eyebrow">Plan · plot threads</div>
            <div className="dwv-page-title">
              Your storylines
              <span className="dwv-page-title-suffix">· 2</span>
            </div>
            <div className="dwv-page-actions">
              <button className="dwv-btn dwv-btn-ai">
                <span>✦</span> Generate
              </button>
              <button className="dwv-btn dwv-btn-primary">+ New storyline</button>
            </div>
          </div>

          {/* Story Map */}
          <StoryMap />

          {/* Merge banner */}
          <div className="dwv-merge-banner">
            <span className="spark">✦</span>
            <span>
              You have <b>2 threads</b>. When you're ready, weave them into one
              story.
            </span>
            <button className="dwv-merge-banner-btn">Merge threads →</button>
          </div>

          {/* Thread cards */}
          <div className="dwv-threads">
            {THREADS.map((t) => (
              <ThreadCard
                key={t.id}
                thread={t}
                expanded={expanded.has(t.id)}
                onToggle={() => toggle(t.id)}
              />
            ))}
          </div>
        </BrowserFrame>
      </div>

      {/* ── Tagline ── */}
      <div className="dwv-tagline">
        <h2>
          Every beat tracked.
          <br />
          Every gap visible.
        </h2>
      </div>
    </div>
  );
}
