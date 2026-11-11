import { useEffect, useMemo, useState } from 'react';
import {
  THREAD_SCOPE_TYPES,
  loadThreadScaffolds,
  type ThreadScaffold,
  type ThreadScopeType,
} from '../data';
import { loadCharacters } from '../../characters/data';
import { DraftBeatList, newDraftBeat, type DraftBeat } from './DraftBeatList';
import { ScopePicker } from './ScopePicker';

export interface NewThreadDraft {
  title: string;
  scopeType: string;
  /** Empty for the whole-story scope. */
  scopeName: string;
  /** null = no shape, 'custom' = build your own, else a template id. */
  templateId: string | null;
  /** The custom template name, when templateId === 'custom'. */
  customTemplate?: string;
  /** The finalized beats, sent up with the create call. */
  beats?: { text: string; kind: string }[];
}

interface Props {
  projectId?: string;
  onClose: () => void;
  onCreate: (draft: NewThreadDraft) => void;
  /** Pre-seed scope / title — e.g. opened from a scope lane on the start page. */
  initial?: Partial<NewThreadDraft>;
}

// Flatten a scaffold into draft beats: each essential heading becomes a bold
// heading beat, each placeholder a dashed fill-in slot beneath it.
const scaffoldToBeats = (sc: ThreadScaffold): DraftBeat[] => {
  const out: DraftBeat[] = [];
  for (const b of sc.beats) {
    if (b.heading) out.push(newDraftBeat(b.heading, 'heading'));
    for (const p of b.placeholders) out.push(newDraftBeat(p, 'placeholder'));
  }
  return out;
};

function isStep1Done(scopeType: string, scopeName: string): boolean {
  if (!scopeType) return false;
  const def = THREAD_SCOPE_TYPES.find((s) => s.value === scopeType);
  return !def?.needsName || scopeName.trim().length > 0;
}

/**
 * NewThreadModal — a focus-driven sheet for hand-creating a storyline, in the
 * same detail-dialog language as the lens/chart config. Two phases:
 *
 *   ① Who is this thread for?        (in focus on open — scope + who)
 *   ② Name it  +  ③ The beats        (open together once ① is settled)
 *
 * The "shape it" phase keeps ② and ③ open at once: a horizontally-scrollable
 * strip of template chips in ②, and the live beats list in ③ right below.
 * Clicking a shape re-seeds the beats instantly, so the writer can click
 * through shapes and watch the list below until satisfied.
 *
 * One accent (terra) marks only *where you are* / *what you picked*; the rest
 * stays neutral, and scope kinds are told apart by their glossy silhouette,
 * not by colour. Step ③ renders with the live <ThreadCard> beat styling so the
 * draft looks almost exactly like the storyline it will become — the finalized
 * beats ride up with the single create call.
 */
export function NewThreadModal({ projectId, onClose, onCreate, initial }: Props) {
  const [scopeType, setScopeType] = useState<string>(initial?.scopeType ?? '');
  const [scopeName, setScopeName] = useState(initial?.scopeName ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  // A seeded title is treated as user-supplied so the auto-fill won't clobber it.
  const [titleDirty, setTitleDirty] = useState(!!initial?.title);
  const [templateId, setTemplateId] = useState<string | null>(initial?.templateId ?? null);
  const [customTemplate, setCustomTemplate] = useState(initial?.customTemplate ?? '');
  const [scaffolds, setScaffolds] = useState<ThreadScaffold[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [showMorePeople, setShowMorePeople] = useState(false);
  const [beats, setBeats] = useState<DraftBeat[]>([]);

  const scopeDef = useMemo<ThreadScopeType | undefined>(
    () => THREAD_SCOPE_TYPES.find((s) => s.value === scopeType),
    [scopeType],
  );
  const needsName = !!scopeDef?.needsName;
  const step1Done = isStep1Done(scopeType, scopeName);

  // The flow has two phases: WHO (① expanded) and SHAPE (② + ③ expanded
  // together). `scopeOpen` === WHO phase. Seeded-and-complete scopes (opened
  // from a start-page lane) jump straight to SHAPE.
  const [scopeOpen, setScopeOpen] = useState(
    () => !isStep1Done(initial?.scopeType ?? '', initial?.scopeName ?? ''),
  );
  const shapeOpen = step1Done && !scopeOpen;

  // Storyline scaffolds come from config/thread_scaffolds.yml via the op gateway.
  useEffect(() => {
    let cancelled = false;
    loadThreadScaffolds(projectId)
      .then((res) => !cancelled && setScaffolds(res))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Cast drives the character picker.
  useEffect(() => {
    let cancelled = false;
    loadCharacters(projectId)
      .then((res: any) => !cancelled && setCharacters(res?.characters ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectedScaffold = useMemo(
    () => (templateId && templateId !== 'custom' ? scaffolds.find((s) => s.id === templateId) : undefined),
    [scaffolds, templateId],
  );

  const templateName = useMemo(() => {
    if (templateId === 'custom') return customTemplate.trim();
    return selectedScaffold?.name ?? '';
  }, [templateId, customTemplate, selectedScaffold]);

  // Auto title: just the chosen scaffold/template name — no scope append. The
  // scope is shown separately in the thread heading ("{Name}'s plot thread").
  // Empty until a shape is picked, so the author can name it themselves.
  const autoTitle = useMemo(() => templateName.trim(), [templateName]);

  useEffect(() => {
    if (!titleDirty) setTitle(autoTitle);
  }, [autoTitle, titleDirty]);

  // ---- phase navigation --------------------------------------------------- #
  const goShape = () => {
    if (step1Done) setScopeOpen(false);
  };

  const pickScope = (value: string) => {
    setScopeType(value);
    setScopeName('');
    setShowMorePeople(false);
    // Whole-story needs no name, so it completes ① and drops into SHAPE.
    if (value === 'story') setScopeOpen(false);
  };

  const pickCharacter = (name: string) => {
    setScopeName(name);
    setScopeOpen(false);
  };

  // Seed ③'s beats from the chosen scaffold. Re-picking the same chip clears it.
  // Clicking a *different* chip re-seeds — the "click through shapes and watch
  // the beats below" loop.
  const pickTemplate = (id: string | null) => {
    if (id === templateId) {
      setTemplateId(null);
      setBeats([]);
      return;
    }
    setTemplateId(id);
    if (id === 'custom') {
      setBeats((prev) => (prev.length ? prev : [newDraftBeat('', 'text')]));
    } else if (id) {
      const sc = scaffolds.find((s) => s.id === id);
      setBeats(sc ? scaffoldToBeats(sc) : [newDraftBeat('', 'text')]);
    } else {
      setBeats([]);
    }
  };

  // Only scaffolds whose scope_fit includes the chosen scope — no fallback, so a
  // scope nothing targets simply shows an empty picker. Suggested ones float up.
  const shapeChips = useMemo(
    () =>
      scaffolds
        .filter((s) => s.scopeFit.includes(scopeType))
        .sort((a, b) => Number(b.suggested) - Number(a.suggested)),
    [scaffolds, scopeType],
  );

  const canCreate = step1Done;
  const beatCount = beats.filter((b) => b.text.trim()).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    onCreate({
      title: title.trim() || autoTitle || 'New thread',
      scopeType,
      scopeName: needsName ? scopeName.trim() : '',
      templateId,
      customTemplate: templateId === 'custom' ? customTemplate.trim() : undefined,
      beats: beats
        .filter((b) => b.text.trim())
        .map((b) => ({ text: b.text.trim(), kind: b.kind })),
    });
  };

  // ---- per-step display helpers ------------------------------------------- #
  const scopeSummary = scopeType
    ? scopeType === 'story'
      ? 'The whole story'
      : `${scopeName.trim() || '—'} · ${scopeDef?.label?.toLowerCase() ?? scopeType}`
    : '';
  const displayTitle = title.trim() || autoTitle;

  const stepCls = (active: boolean, done: boolean, locked: boolean) =>
    `thr-step${active ? ' is-active' : ''}${done && !active ? ' is-done' : ''}${locked ? ' is-locked' : ''}`;
  const numFor = (n: number, active: boolean, done: boolean) => (done && !active ? '✓' : n);

  const step2Done = !!displayTitle;

  return (
    <div className="thr-modal-backdrop" onClick={onClose}>
      <form className="thr-modal thr-modal--stepped" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="thr-modal-head">
          <div className="thr-modal-head-main">
            <span className="thr-modal-kicker">New storyline</span>
            <h2 className="thr-modal-title">Start another thread</h2>
          </div>
          <button type="button" className="thr-modal-close" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>

        <div className="thr-modal-body">
          {/* ① Who is this thread for? */}
          <section className={stepCls(scopeOpen, step1Done, false)}>
            <button type="button" className="thr-step-h" onClick={() => setScopeOpen(true)}>
              <span className="thr-step-num">{numFor(1, scopeOpen, step1Done)}</span>
              <span className="thr-step-ttl">Who is this thread for?</span>
              {!scopeOpen && step1Done && <span className="thr-step-sum">{scopeSummary}</span>}
              {!scopeOpen && step1Done && <span className="thr-step-edit">Change</span>}
            </button>

            {scopeOpen && (
              <div className="thr-step-body">
                <ScopePicker
                  scopeType={scopeType}
                  scopeName={scopeName}
                  characters={characters}
                  showMorePeople={showMorePeople}
                  onPickScope={pickScope}
                  onPickCharacter={pickCharacter}
                  onSetName={setScopeName}
                  onShowMore={() => setShowMorePeople(true)}
                  onNameCommit={() => setScopeOpen(false)}
                />
              </div>
            )}
          </section>

          {/* ② Name it */}
          <section className={stepCls(shapeOpen, step2Done, !step1Done)}>
            <button type="button" className="thr-step-h" onClick={goShape}>
              <span className="thr-step-num">{numFor(2, shapeOpen, step2Done)}</span>
              <span className="thr-step-ttl">Name it</span>
              {!shapeOpen && step1Done && displayTitle && (
                <span className="thr-step-sum thr-step-sum--quote">“{displayTitle}”</span>
              )}
            </button>

            {shapeOpen && (
              <div className="thr-step-body">
                <input
                  className="thr-field-input"
                  type="text"
                  value={title}
                  autoFocus
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleDirty(true);
                  }}
                  placeholder={autoTitle || 'Name this storyline…'}
                />

                <div className="thr-tpl-head">Choose a scaffold</div>
                <div className="thr-tpl-strip">
                  {shapeChips.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`thr-tpl-chip${templateId === s.id ? ' is-on' : ''}`}
                      title={s.about}
                      onClick={() => pickTemplate(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`thr-tpl-chip${templateId === 'custom' ? ' is-on' : ''}`}
                    onClick={() => pickTemplate('custom')}
                  >
                    Custom…
                  </button>
                </div>
                {shapeChips.length === 0 && (
                  <p className="thr-step-note">
                    No ready-made scaffolds for this kind of thread yet — pick “Custom…” to build your own beats.
                  </p>
                )}

                {templateId === 'custom' && (
                  <input
                    className="thr-field-input thr-custom-input"
                    type="text"
                    value={customTemplate}
                    onChange={(e) => setCustomTemplate(e.target.value)}
                    placeholder="Name your shape (optional)…"
                  />
                )}
              </div>
            )}
          </section>

          {/* ③ The beats */}
          <section className={stepCls(shapeOpen, beatCount > 0, !step1Done)}>
            <button type="button" className="thr-step-h" onClick={goShape}>
              <span className="thr-step-num">{numFor(3, shapeOpen, beatCount > 0)}</span>
              <span className="thr-step-ttl">The beats</span>
              {!shapeOpen && step1Done && (
                <span className="thr-step-sum">
                  {beatCount > 0 ? `${beatCount} beat${beatCount === 1 ? '' : 's'}` : 'optional'}
                </span>
              )}
            </button>

            {shapeOpen && (
              <div className="thr-step-body">
                {selectedScaffold ? (
                  <p className="thr-step-note">
                    <b>{selectedScaffold.name}.</b> {selectedScaffold.using}
                  </p>
                ) : templateId === 'custom' ? (
                  <p className="thr-step-note">
                    Build your own shape — add the beats you know this thread needs.
                  </p>
                ) : (
                  <p className="thr-step-note">
                    Sketch the promise this thread makes — or pick a scaffold above to seed it. You can also build the beats later.
                  </p>
                )}
                <DraftBeatList beats={beats} onChange={setBeats} />
              </div>
            )}
          </section>
        </div>

        <div className="thr-modal-foot">
          <span className="thr-modal-foot-note">Nothing’s locked in — rename or reshape anytime.</span>
          <div className="thr-modal-foot-btns">
            <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="wv2-btn wv2-btn-primary wv2-btn-sm" disabled={!canCreate}>
              Create storyline
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
