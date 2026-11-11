import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  CircleDot,
  Gauge,
  Layers3,
  ListTree,
  Maximize2,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react';
import './chaptersMockup.css';

type Mode = 'write' | 'plan' | 'connect' | 'analyze' | 'focus';

const MODES: Array<{ id: Mode; label: string; Icon: typeof PenLine }> = [
  { id: 'write', label: 'Write', Icon: PenLine },
  { id: 'plan', label: 'Plan', Icon: ListTree },
  { id: 'connect', label: 'Connect', Icon: Paperclip },
  { id: 'analyze', label: 'Analyze', Icon: Gauge },
  { id: 'focus', label: 'Focus', Icon: Maximize2 },
];

const scenes = [
  { n: 1, title: 'Glass house morning', state: 'drafted', words: 420 },
  { n: 2, title: 'Pepper interrupts', state: 'active', words: 690 },
  { n: 3, title: 'Workshop aftershock', state: 'drafting', words: 260 },
  { n: 4, title: 'Armor test', state: 'sketch', words: 0 },
  { n: 5, title: 'Rooftop choice', state: 'sketch', words: 0 },
];

const notes = [
  { kind: 'Character', text: "Tony jokes when he is scared. Keep the fear visible underneath.", tone: 'terra' },
  { kind: 'Thread', text: 'The choice is not saving the city yet. It is admitting he needs help.', tone: 'teal' },
  { kind: 'World', text: 'Stark tower should feel precise, expensive, and slightly lonely.', tone: 'gold' },
];

const links = [
  { label: 'Pepper is his secretary', type: 'Braindump', tone: 'gold' },
  { label: "Tony Stark's company", type: 'World', tone: 'sage' },
  { label: 'Iron Man armor', type: 'World', tone: 'sage' },
  { label: 'Workshop', type: 'Place', tone: 'teal' },
];

function ModeButton({
  mode,
  active,
  onClick,
}: {
  mode: (typeof MODES)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = mode.Icon;
  return (
    <button type="button" className={active ? 'is-on' : ''} onClick={onClick}>
      <Icon size={13} strokeWidth={1.9} />
      {mode.label}
    </button>
  );
}

function OutlineDrawer() {
  return (
    <aside className="wmock-outline" aria-label="Manuscript outline">
      <div className="wmock-drawer-head">
        <span>
          <ListTree size={14} strokeWidth={1.9} />
          Outline
        </span>
        <button type="button" title="Collapse act">
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="wmock-outline-tree">
        <div className="wmock-act">
          <span className="wmock-act-dot" />
          <span>Act I</span>
          <b>5 sc</b>
        </div>
        <div className="wmock-chapter is-active">
          <div className="wmock-chapter-row">
            <span className="wmock-chapter-num">4</span>
            <span className="wmock-chapter-title">Choices in the tower</span>
          </div>
          <div className="wmock-scene-list">
            {scenes.map((scene) => (
              <button
                key={scene.n}
                type="button"
                className={`wmock-scene-link${scene.state === 'active' ? ' is-active' : ''}`}
              >
                <span>{scene.n}</span>
                <em>{scene.title}</em>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="wmock-outline-notes">
        <div className="wmock-mini-head">
          <MessageSquareText size={13} strokeWidth={1.9} />
          Scene notes
        </div>
        {notes.slice(0, 2).map((note) => (
          <div key={note.text} className="wmock-note" data-tone={note.tone}>
            <span>{note.kind}</span>
            <p>{note.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function SceneRibbon({ compact }: { compact: boolean }) {
  return (
    <div className={`wmock-strip${compact ? ' is-compact' : ''}`}>
      <div className="wmock-strip-label">
        <Layers3 size={13} strokeWidth={1.9} />
        Scenes
      </div>
      <div className="wmock-strip-track" aria-label="Chapter scenes">
        {scenes.map((scene) => (
          <button
            key={scene.n}
            type="button"
            className={`wmock-strip-scene is-${scene.state}`}
            title={scene.title}
          >
            <span>{scene.n}</span>
            <em>{scene.title}</em>
          </button>
        ))}
        <button type="button" className="wmock-strip-add" title="Add scene">
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function NoteStack() {
  return (
    <div className="wmock-panel-stack">
      <div className="wmock-focus-card">
        <span className="wmock-kicker">Scene intention</span>
        <p>Tony wants control. Pepper wants honesty. The scene turns when he stops performing confidence.</p>
      </div>
      {notes.map((note) => (
        <div key={note.text} className="wmock-note" data-tone={note.tone}>
          <span>{note.kind}</span>
          <p>{note.text}</p>
        </div>
      ))}
      <button type="button" className="wv2-add wmock-add">
        <Plus size={14} strokeWidth={2} />
        <b>Add note</b>
      </button>
    </div>
  );
}

function ConnectPanel() {
  return (
    <div className="wmock-panel-stack">
      <label className="wmock-search">
        <Search size={13} strokeWidth={1.9} />
        <input value="" readOnly placeholder="Find notes, people, places" />
      </label>
      <div className="wmock-link-grid">
        {links.map((link) => (
          <button key={link.label} type="button" className="wmock-link" data-tone={link.tone}>
            <span>{link.type}</span>
            <b>{link.label}</b>
          </button>
        ))}
      </div>
      <div className="wmock-focus-card is-soft">
        <span className="wmock-kicker">Attached to this scene</span>
        <p>Pepper, Stark tower, workshop, armor prototype.</p>
      </div>
    </div>
  );
}

function PlanPanel() {
  return (
    <div className="wmock-panel-stack">
      <div className="wmock-beat-card is-current">
        <span>Current beat</span>
        <p>Pepper enters before Tony can retreat into work.</p>
      </div>
      <div className="wmock-beat-card">
        <span>Next beat</span>
        <p>He deflects with charm, then accidentally says what he really fears.</p>
      </div>
      <div className="wmock-beat-card">
        <span>Exit image</span>
        <p>The workshop lights wake up behind him like an accusation.</p>
      </div>
    </div>
  );
}

function AnalyzePanel() {
  return (
    <div className="wmock-panel-stack">
      <div className="wmock-checks">
        {[
          ['POV purity', 'clean', 'No head-hopping found'],
          ['Hook grade', 'watch', 'Opening image is strong; closing turn needs bite'],
          ['Subtext', 'watch', 'One line says the conflict too plainly'],
          ['Voice', 'clean', 'Tony keeps the same defensive rhythm'],
        ].map(([label, status, detail]) => (
          <div key={label} className={`wmock-check is-${status}`}>
            <CircleDot size={13} strokeWidth={2} />
            <span>{label}</span>
            <p>{detail}</p>
          </div>
        ))}
      </div>

      <details className="wmock-settings">
        <summary>
          <Settings2 size={13} strokeWidth={1.9} />
          Configure checks
        </summary>
        {['POV purity', 'Pronoun resolver', 'Hook grade', 'Voice consistency'].map((label, index) => (
          <label key={label} className="wmock-switch-row">
            <span>{label}</span>
            <input type="checkbox" readOnly checked={index < 2} />
            <i />
          </label>
        ))}
      </details>
    </div>
  );
}

function ContextPanel({ mode }: { mode: Mode }) {
  const title = useMemo(() => {
    if (mode === 'plan') return 'Plan';
    if (mode === 'connect') return 'Attach';
    if (mode === 'analyze') return 'Checks';
    return 'Notes';
  }, [mode]);

  return (
    <aside className="wmock-context" aria-label={`${title} drawer`}>
      <div className="wmock-drawer-head">
        <span>
          {mode === 'analyze' ? <Gauge size={14} strokeWidth={1.9} /> : <BookOpen size={14} strokeWidth={1.9} />}
          {title}
        </span>
        <button type="button" title="Collapse drawer">
          <PanelRight size={14} strokeWidth={1.9} />
        </button>
      </div>
      {mode === 'plan' ? <PlanPanel /> : null}
      {mode === 'connect' ? <ConnectPanel /> : null}
      {mode === 'analyze' ? <AnalyzePanel /> : null}
      {mode === 'write' ? <NoteStack /> : null}
    </aside>
  );
}

export function ChaptersMockupPage() {
  const [mode, setMode] = useState<Mode>('write');
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [stripOpen, setStripOpen] = useState(true);

  const focus = mode === 'focus';
  const showOutline = !focus && outlineOpen;
  const showContext = !focus && contextOpen;
  const showStrip = !focus && stripOpen;

  const chooseMode = (next: Mode) => {
    setMode(next);
    if (next === 'plan') {
      setOutlineOpen(true);
      setContextOpen(true);
    }
    if (next === 'connect' || next === 'analyze') {
      setContextOpen(true);
    }
  };

  return (
    <div
      className={[
        'wmock',
        `wmock--${mode}`,
        showOutline ? 'has-outline' : 'no-outline',
        showContext ? 'has-context' : 'no-context',
        showStrip ? 'has-strip' : 'no-strip',
      ].join(' ')}
    >
      <header className="wmock-top">
        <div className="wmock-title">
          <span className="wmock-title-mark">
            <PenLine size={15} strokeWidth={1.9} />
          </span>
          <span>
            <b>Manuscript</b>
            <em>Chapter 4 / Scene 2</em>
          </span>
        </div>

        <div className="wv2-seg wmock-modes" role="group" aria-label="Writing mode">
          {MODES.map((item) => (
            <ModeButton
              key={item.id}
              mode={item}
              active={mode === item.id}
              onClick={() => chooseMode(item.id)}
            />
          ))}
        </div>

        <div className="wmock-toggles">
          <button
            type="button"
            className={`wv2-btn wv2-btn-ghost wv2-btn-sm${outlineOpen ? ' is-on' : ''}`}
            onClick={() => setOutlineOpen((v) => !v)}
          >
            <PanelLeft size={12} strokeWidth={1.9} />
            Outline
          </button>
          <button
            type="button"
            className={`wv2-btn wv2-btn-ghost wv2-btn-sm${contextOpen ? ' is-on' : ''}`}
            onClick={() => setContextOpen((v) => !v)}
          >
            <PanelRight size={12} strokeWidth={1.9} />
            Drawer
          </button>
          <button
            type="button"
            className={`wv2-btn wv2-btn-ghost wv2-btn-sm${stripOpen ? ' is-on' : ''}`}
            onClick={() => setStripOpen((v) => !v)}
          >
            <Layers3 size={12} strokeWidth={1.9} />
            Scenes
          </button>
        </div>
      </header>

      <div className="wmock-workspace">
        {showOutline ? <OutlineDrawer /> : null}

        <main className="wmock-editor-shell">
          <div className="wmock-editor-head">
            <div>
              <span>Scene 2</span>
              <h1>Tony Stark Contemplating His Choices</h1>
            </div>
            <div className="wmock-editor-actions">
              <button type="button" className="wv2-btn wv2-btn-ai wv2-btn-sm">
                <Sparkles size={12} strokeWidth={1.9} />
                Ask
              </button>
            </div>
          </div>

          <article className="wmock-paper" aria-label="Writing surface">
            <p>
              The sun peeked through the tall glass windows of Stark Industries, casting sharp
              lines of light across the polished marble floor. The hum of machinery and the
              distant chatter of employees filled the air, a symphony of productivity that echoed
              the company's relentless drive for innovation.
            </p>
            <p>
              Tony Stark sat at his sleek, modern desk, fingers poised over the keyboard, but his
              mind was elsewhere. He stared out at the skyline, lost in thought, the weight of his
              past choices pressing down on him like a heavy fog.
            </p>
            <p className="is-active">
              "Mr. Stark?" Pepper Potts stood at the door, her expression a mix of concern and
              determination. "We have a meeting in ten minutes. Are you ready?"
            </p>
            <p>
              Tony turned, forcing a smile that did not quite reach his eyes. "Ready as I'll ever
              be. Just contemplating the universe."
            </p>
          </article>
        </main>

        {showContext ? <ContextPanel mode={mode} /> : null}
      </div>

      {showStrip ? <SceneRibbon compact={mode === 'write'} /> : null}
    </div>
  );
}
