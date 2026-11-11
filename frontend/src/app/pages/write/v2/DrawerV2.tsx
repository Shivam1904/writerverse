import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Lightbulb,
  ListTree,
  PanelRight,
  RefreshCw,
} from 'lucide-react';
import { EntityMark } from '../../../components/EntityMark';
import { callOp } from '../../../gateway';
import { linkSceneEntity, unlinkSceneEntity, type SceneLinkKind } from '../sceneLinks';
import type { OutlineActNode, OutlineSceneNode, WriteBeat, TipTapDoc } from '../data';
import type { BeatState } from './useChapterBeats';
import { tickVerdictsFor, draftVerdictsFor } from './tickVerdicts';
import { TickVerdictGroup } from './TickVerdictCard';
import { queries } from '../../../queries';

type Mode = 'plan' | 'analysis';

// ---------- section wrapper ----------

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ icon, title, meta, open, onToggle, children }: SectionProps) {
  return (
    <section className={`dv2-sec${open ? ' is-open' : ''}`}>
      <button type="button" className="dv2-sec-head" onClick={onToggle} aria-expanded={open}>
        <span className={`dv2-caret${open ? ' is-open' : ''}`}>
          <ChevronRight size={12} strokeWidth={2.2} />
        </span>
        {icon}
        <span className="dv2-sec-title">{title}</span>
        {meta ? <span className="dv2-sec-meta">{meta}</span> : null}
      </button>
      {open ? <div className="dv2-sec-body">{children}</div> : null}
    </section>
  );
}

// ---------- outline tree (handoff pattern) ----------

function PanelBeat({ beat, state, onCycle }: { beat: WriteBeat; state: BeatState; onCycle: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button type="button" className={`cm-beat is-${state}`}
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      aria-pressed={state === 'done'}
      title={state === 'suggested' ? 'AI thinks this beat is present — confirm it' : 'Toggle written'}>
      <span className="cm-beat-box">
        {state === 'done' || state === 'suggested' ? <Check size={12} strokeWidth={2.4} /> : null}
      </span>
      <span className={`cm-beat-text${expanded ? '' : ' is-clamped'}`}
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>{beat.text}</span>
      {state === 'suggested' ? <span className="cm-beat-tag">AI</span> : null}
    </button>
  );
}

function SignalChart({ scenes }: { scenes: OutlineSceneNode[] }) {
  if (scenes.length === 0) return null;
  const max = Math.max(...scenes.map((s) => s.words), 1);
  return (
    <span className="cm-signal" aria-label="Scene word counts">
      {scenes.map((sc) => (
        <i key={sc.id} style={{ height: `${Math.max(Math.round((sc.words / max) * 100), 8)}%` }}
          title={`${sc.title || `S${sc.n}`}: ${sc.words}w`} />
      ))}
    </span>
  );
}

function PanelScene({ scene, isCurrent, open, onToggle, onSelect, beatStates, onCycleBeat }: {
  scene: OutlineSceneNode;
  isCurrent: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: () => void;
  beatStates: Record<string, BeatState>;
  onCycleBeat: (id: string) => void;
}) {
  const done = scene.beats.filter((b) => (beatStates[b.id] ?? 'todo') === 'done').length;
  return (
    <div className={`cm-osc${isCurrent ? ' is-current' : ''}`}>
      <button type="button" className="cm-osc-head" onClick={() => { onSelect(); onToggle(); }}
        aria-expanded={open}>
        <span className={`cm-osc-caret${open ? ' is-open' : ''}`}>
          <ChevronRight size={12} strokeWidth={2.2} />
        </span>
        <span className="cm-osc-num">{scene.n}</span>
        <span className="cm-osc-title">{scene.title || '— untitled —'}</span>
        {scene.beats.length > 0 ? <span className="cm-osc-count">{done}/{scene.beats.length}</span> : null}
      </button>
      {open && scene.beats.length > 0 ? (
        <div className="cm-beats">
          {scene.beats.map((b) => (
            <PanelBeat key={b.id} beat={b} state={beatStates[b.id] ?? 'todo'}
              onCycle={() => onCycleBeat(b.id)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface OutlineBodyProps {
  acts: OutlineActNode[];
  activeChapId: any;
  activeSc: any;
  onSelect: (chapId: any, sceneId: any) => void;
  beatStates: Record<string, BeatState>;
  onCycleBeat: (id: string) => void;
}

function OutlineBody({ acts, activeChapId, activeSc, onSelect, beatStates, onCycleBeat }: OutlineBodyProps) {
  const [openScenes, setOpenScenes] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const toggleScene = (id: string) =>
    setOpenScenes((p) => { const x = new Set(p); if (x.has(id)) { x.delete(id); } else { x.add(id); } return x; });

  if (!acts.length) return <p className="cm-outline-empty">No chapters yet.</p>;

  const currentAct = acts.find((a) => a.chapters.some((c) => String(c.id) === String(activeChapId)));
  const visibleActs = showAll ? acts : currentAct ? [currentAct] : acts;
  const canCollapse = acts.length > 1;

  const expandBtn = canCollapse && !showAll ? (
    <button type="button" className="cm-expand-all" onClick={() => setShowAll(true)}>
      Show all acts
    </button>
  ) : canCollapse && showAll ? (
    <button type="button" className="cm-expand-all" onClick={() => setShowAll(false)}>
      Current act only
    </button>
  ) : null;

  return (
    <div className="cm-outline">
      {visibleActs.map((act) => {
        const isCurrent = act.chapters.some((c) => String(c.id) === String(activeChapId));
        return (
          <div key={act.id} className={`cm-act${isCurrent ? ' is-current' : ''}`}>
            <div className="cm-act-row">
              <span className="cm-act-dot" />
              <span>{act.name}</span>
              <b>{act.chapters.length} ch</b>
            </div>
            <div className="cm-chapters">
              {act.chapters.map((ch) => {
                const isActive = String(ch.id) === String(activeChapId);
                if (isActive) {
                  return (
                    <div key={ch.id} className="cm-chapter is-current">
                      <div className="cm-chapter-row">
                        <span className="cm-chapter-num">{ch.n}</span>
                        <span className="cm-chapter-title">{ch.title || 'Untitled'}</span>
                        <SignalChart scenes={ch.scenes} />
                      </div>
                      <div className="cm-scenes">
                        {ch.scenes.map((sc) => (
                          <PanelScene key={sc.id} scene={sc}
                            isCurrent={String(sc.id) === String(activeSc)}
                            open={openScenes.has(String(sc.id))}
                            onToggle={() => toggleScene(String(sc.id))}
                            onSelect={() => onSelect(ch.id, sc.id)}
                            beatStates={beatStates} onCycleBeat={onCycleBeat} />
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <button key={ch.id} type="button" className="cm-chapter-link"
                    onClick={() => onSelect(ch.id, null)}>
                    <span className="cm-chapter-num is-ghost">{ch.n}</span>
                    <span className="cm-chapter-title">{ch.title || 'Untitled'}</span>
                    <SignalChart scenes={ch.scenes} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {expandBtn}
    </div>
  );
}

// ---------- scene notes (braindumps + worldbuildings linked to the scene) ----------

interface DocRef {
  entityType: 'braindump' | 'worldbuilding' | 'character';
  id: number;
}

function extractRefsFromDoc(doc: TipTapDoc | null): DocRef[] {
  if (!doc) return [];
  const seen = new Set<string>();
  const refs: DocRef[] = [];

  function walk(node: any) {
    if (!node) return;
    if (node.type === 'paragraph' && Array.isArray(node.attrs?.refs)) {
      for (const r of node.attrs.refs) {
        if (!r?.entityType || r?.id == null) continue;
        const id = typeof r.id === 'string' ? parseInt(r.id, 10) : r.id;
        if (isNaN(id)) continue;
        const key = `${r.entityType}:${id}`;
        if (!seen.has(key)) { seen.add(key); refs.push({ entityType: r.entityType, id }); }
      }
    }
    if (node.type === 'mention' && node.attrs?.entityType && node.attrs?.id) {
      const id = typeof node.attrs.id === 'string' ? parseInt(node.attrs.id, 10) : node.attrs.id;
      if (!isNaN(id)) {
        const key = `${node.attrs.entityType}:${id}`;
        if (!seen.has(key)) { seen.add(key); refs.push({ entityType: node.attrs.entityType, id }); }
      }
    }
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type !== 'spanRef') continue;
        const a = mark.attrs;
        if (a?.entityId && a?.entityType) {
          const id = typeof a.entityId === 'string' ? parseInt(a.entityId, 10) : a.entityId;
          if (!isNaN(id)) {
            const key = `${a.entityType}:${id}`;
            if (!seen.has(key)) { seen.add(key); refs.push({ entityType: a.entityType, id }); }
          }
        }
      }
    }
    if (Array.isArray(node.content)) for (const child of node.content) walk(child);
  }

  walk(doc);
  return refs;
}

interface ResolvedNoteItem {
  key: string;
  id: number;
  gl: string;
  type: 'braindump' | 'worldbuilding' | 'character';
  name: string;
  snippet: string;
  dangling?: boolean;
  linkId?: number;
}

const GL_MAP = { braindump: '✨', worldbuilding: '○', character: 'L' } as const;

function resolveRef(entityType: string, id: number, characters: any[], braindumps: any[], worldbuildings: any[]): ResolvedNoteItem | null {
  if (entityType === 'braindump') {
    const b = braindumps.find((x: any) => x.id === id);
    if (!b) return null;
    return { key: `braindump-${id}`, id, gl: GL_MAP.braindump, type: 'braindump', name: b.title ?? 'Untitled braindump', snippet: typeof b.raw_text === 'string' ? b.raw_text.slice(0, 120) : '' };
  }
  if (entityType === 'worldbuilding') {
    const w = worldbuildings.find((x: any) => x.id === id);
    if (!w) return null;
    const snip = typeof w.content === 'string' ? w.content.slice(0, 120) : '';
    return { key: `worldbuilding-${id}`, id, gl: GL_MAP.worldbuilding, type: 'worldbuilding', name: w.title ?? 'Untitled', snippet: snip };
  }
  if (entityType === 'character') {
    const c = characters.find((x: any) => x.id === id);
    if (!c) return null;
    return { key: `character-${id}`, id, gl: GL_MAP.character, type: 'character', name: c.name ?? 'Unnamed', snippet: c.role ?? c.description ?? '' };
  }
  return null;
}

// Where a scene-notes card takes the author. Characters open their studio page
// and ideas open the Ideas page focused on that idea (?focus=, the same param
// the idea-tree rail uses). The World page has no way to focus one entry yet,
// so a world entry opens the World page itself.
function noteItemHref(projectId: string, item: ResolvedNoteItem): string {
  const base = `/project/${projectId}`;
  if (item.type === 'character') return `${base}/characters/${item.id}`;
  if (item.type === 'braindump') return `${base}/braindumps?focus=${encodeURIComponent(String(item.id))}`;
  return `${base}/world`;
}

// Minimal search-and-attach picker for braindumps and worldbuildings.
interface AttachPickerProps {
  sceneId: number | null;
  projectId: string | undefined;
  braindumps: any[];
  worldbuildings: any[];
  alreadyLinked: Set<string>;
}

type LinkKind = SceneLinkKind;

function AttachPicker({ sceneId, projectId, braindumps, worldbuildings, alreadyLinked }: AttachPickerProps) {
  const [expanded, setExpanded] = useState<LinkKind | null>(null);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const disabled = sceneId == null || !projectId || pending;

  const items = useMemo(() => {
    const list = expanded === 'braindump' ? braindumps : expanded === 'worldbuilding' ? worldbuildings : [];
    const q = query.trim().toLowerCase();
    return (list as any[])
      .map((x) => ({
        id: x.id,
        label: x.title || (typeof x.raw_text === 'string' ? x.raw_text.slice(0, 50) : '') || `${expanded} ${x.id}`,
      }))
      .filter((it) => !alreadyLinked.has(`${expanded}-${it.id}`) && (!q || it.label.toLowerCase().includes(q)));
  }, [expanded, query, braindumps, worldbuildings, alreadyLinked]);

  const toggle = (kind: LinkKind) => { setExpanded((p) => (p === kind ? null : kind)); setQuery(''); };

  const attach = async (kind: LinkKind, id: number) => {
    if (sceneId == null || !projectId) return;
    setPending(true);
    try {
      await linkSceneEntity(projectId, sceneId, kind, id);
    } catch { /* callOp already showed the author a toast */ } finally {
      setPending(false); setExpanded(null); setQuery('');
    }
  };

  return (
    <div className="dv2-attach">
      <div className="dv2-attach-btns">
        <button type="button" className={`dv2-attach-btn${expanded === 'braindump' ? ' is-on' : ''}`} onClick={() => toggle('braindump')} disabled={disabled}>
          <span>✨</span> Braindumps
        </button>
        <button type="button" className={`dv2-attach-btn${expanded === 'worldbuilding' ? ' is-on' : ''}`} onClick={() => toggle('worldbuilding')} disabled={disabled}>
          <span>○</span> World
        </button>
      </div>
      {expanded ? (
        <div className="dv2-attach-drop">
          <input autoFocus type="text" className="dv2-attach-search" placeholder={`Search ${expanded === 'braindump' ? 'braindumps' : 'worldbuilding'}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="dv2-attach-list">
            {items.length === 0
              ? <span className="dv2-attach-empty">No matches</span>
              : items.map((it) => (
                  <button key={it.id} type="button" className="dv2-attach-opt" onClick={() => attach(expanded, it.id)} disabled={pending}>
                    {it.label}
                  </button>
                ))
            }
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface SceneNotesProps {
  focusedScene: any;
  sceneContent: TipTapDoc | null;
  projectId: string | undefined;
  characters: any[];
  braindumps: any[];
  worldbuildings: any[];
}

function SceneNotes({ focusedScene, sceneContent, projectId, characters, braindumps, worldbuildings }: SceneNotesProps) {
  const inlineRefs = useMemo(() => extractRefsFromDoc(sceneContent), [sceneContent]);

  const resolvedItems = useMemo<ResolvedNoteItem[]>(() => {
    const out: ResolvedNoteItem[] = [];
    const seen = new Set<string>();

    for (const ref of inlineRefs) {
      const key = `${ref.entityType}-${ref.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = resolveRef(ref.entityType, ref.id, characters, braindumps, worldbuildings);
      if (item) out.push(item);
    }

    for (const el of (focusedScene?.entity_links ?? [])) {
      const key = `${el.link_type}-${el.link_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = resolveRef(el.link_type, el.link_id, characters, braindumps, worldbuildings);
      if (item) out.push({ ...item, dangling: true, linkId: el.link_id });
    }

    return out;
  }, [inlineRefs, focusedScene?.entity_links, characters, braindumps, worldbuildings]);

  const alreadyLinked = useMemo(
    () => new Set(resolvedItems.map((r) => r.key)),
    [resolvedItems],
  );

  if (!focusedScene) {
    return <p className="dv2-tree-empty">Select a scene to see its notes.</p>;
  }

  const entGlyph = (item: ResolvedNoteItem) => {
    if (item.type === 'worldbuilding') return <EntityMark kind="item" color="var(--asp-world)" size={26} />;
    if (item.type === 'braindump') return <span className="dv2-ent-glyph"><Lightbulb size={13} strokeWidth={1.6} /></span>;
    const initial = (item.name || '?').charAt(0).toUpperCase();
    return <span className="dv2-ent-glyph">{initial}</span>;
  };

  return (
    <div className="dv2-scene-notes">
      {resolvedItems.length === 0 ? (
        <div className="dv2-empty">
          <div className="dv2-empty-icon">
            <FileText size={15} strokeWidth={1.5} />
          </div>
          <p className="dv2-empty-text">
            <b>@mention</b> a braindump or world entry in the prose, or attach one below.
          </p>
        </div>
      ) : (
        <div className="dv2-entlist">
          {resolvedItems.map((item) => (
            <div key={item.key} className={`dv2-ent dv2-ent--${item.type}`}>
              {/* Leaving the Write page is safe: the focused editor flushes its
                  pending autosave on unmount (SceneEditorV2). */}
              <Link
                to={noteItemHref(projectId ?? '', item)}
                className="flex flex-1 min-w-0 items-start gap-2.5 rounded-[var(--r-md)] text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`Open ${item.name}`}
              >
                {entGlyph(item)}
                <div className="dv2-ent-info">
                  <div className="dv2-ent-nm">
                    {/* The name shrinks with an ellipsis so the "attached" tag stays visible. */}
                    <span className="min-w-0 truncate">{item.name}</span>
                    {item.dangling && <span className="dv2-ent-marker is-attached">attached</span>}
                  </div>
                  {item.snippet ? <div className="dv2-ent-role">{item.snippet}{item.snippet.length >= 120 ? '…' : ''}</div> : null}
                </div>
              </Link>
              {item.dangling && item.linkId != null && item.type !== 'character' && (
                <button
                  type="button"
                  className="dv2-ent-marker cursor-pointer"
                  aria-label={`Remove ${item.name} from this scene`}
                  title="Remove from this scene"
                  onClick={() => {
                    if (!projectId) return;
                    unlinkSceneEntity(projectId, focusedScene.id, item.type as LinkKind, item.linkId!)
                      .catch(() => { /* callOp already showed the author a toast */ });
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <AttachPicker
        sceneId={focusedScene?.id ?? null}
        projectId={projectId}
        braindumps={braindumps}
        worldbuildings={worldbuildings}
        alreadyLinked={alreadyLinked}
      />
    </div>
  );
}

// ---------- analysis lenses ----------

interface PipelineInfo {
  key: string;
  label: string;
  enabled: boolean;
  cost: string;
}

const LENS_LABELS: Record<string, string> = {
  resolve_nouns: 'Pronouns resolved',
  pov_purity: 'POV purity',
  hook_grade: 'Hook grade',
  subtext: 'Subtext density',
  voice: 'Voice consistency',
};

const COST_TOK: Record<string, number> = {
  cheap: 0.2, medium: 0.4, expensive: 0.8,
};

function lensDetail(key: string, data: any): string {
  if (!data || data.status === 'error') return 'Not yet analysed.';
  // A failed check is "couldn't check", never a clean result (SA-251).
  if (data.status === 'failed') return "Couldn't check this scene. Try running it again.";
  switch (key) {
    case 'pov_purity': {
      const n = data.violations_count ?? data.violations?.length ?? 0;
      return n === 0
        ? `No head-hopping. Stays inside ${data.pov_character || 'the POV character'}.`
        : `${n} head-hopping violation${n > 1 ? 's' : ''} detected.`;
    }
    case 'resolve_nouns': {
      const res = data.resolved?.length ?? 0;
      const unres = data.unresolved?.length ?? 0;
      const total = res + unres;
      return total === 0
        ? 'No pronouns to resolve.'
        : `${res}/${total} references resolve cleanly.`;
    }
    case 'hook_grade':
      return [data.opening_verdict, data.closing_verdict].filter(Boolean).join(' · ') || data.summary || 'Not yet analysed.';
    case 'subtext': {
      const n = data.flags_count ?? data.flags?.length ?? 0;
      return n === 0 ? 'No on-the-nose dialogue flagged.' : `${n} on-the-nose flag${n > 1 ? 's' : ''}.`;
    }
    case 'voice': {
      const n = data.flags_count ?? data.flags?.length ?? 0;
      return n === 0 ? 'Voice is consistent throughout.' : `${n} voice drift${n > 1 ? 's' : ''} flagged.`;
    }
    default:
      return data.summary || 'Analysis complete.';
  }
}

function lensStatus(key: string, data: any): 'clean' | 'watch' | 'none' {
  if (!data || data.status === 'failed') return 'none';
  switch (key) {
    case 'pov_purity':
      return (data.violations_count ?? 0) === 0 ? 'clean' : 'watch';
    case 'resolve_nouns':
      return (data.unresolved?.length ?? 0) === 0 ? 'clean' : 'watch';
    case 'subtext':
    case 'voice':
      return (data.flags_count ?? data.flags?.length ?? 0) === 0 ? 'clean' : 'watch';
    case 'hook_grade':
      return 'watch';
    default:
      return 'clean';
  }
}

interface LensChartProps { lensKey: string; data: any }

function LensChart({ lensKey, data }: LensChartProps) {
  if (!data) return null;
  if (lensKey === 'resolve_nouns') {
    const res = data.resolved?.length ?? 0;
    const unres = data.unresolved?.length ?? 0;
    const total = res + unres;
    if (total === 0) return null;
    const pct = Math.round((res / total) * 100);
    return (
      <div className="cm-chart">
        <div className="cm-chart-stat">
          <b className={pct >= 90 ? 'tone-good' : 'tone-warn'}>{res}/{total}</b>
          <span>references resolve cleanly</span>
        </div>
        <div className="cm-meter"><i className={pct >= 90 ? 'tone-good' : 'tone-warn'} style={{ width: `${pct}%` }} /></div>
      </div>
    );
  }
  if (lensKey === 'hook_grade') {
    return (
      <div className="cm-chart">
        <div className="cm-chart-stat">
          <b className="tone-good">{data.opening_verdict ? '✓' : '—'}</b>
          <span>{data.summary || 'Opening + closing assessed'}</span>
        </div>
      </div>
    );
  }
  if (lensKey === 'pov_purity') {
    const n = data.violations_count ?? 0;
    const pct = n === 0 ? 100 : Math.max(0, 100 - n * 15);
    return (
      <div className="cm-chart">
        <div className="cm-chart-stat">
          <b className={n === 0 ? 'tone-good' : 'tone-warn'}>{n === 0 ? 'Clean' : `${n} issue${n > 1 ? 's' : ''}`}</b>
          <span>{data.pov_character ? `POV: ${data.pov_character}` : 'POV checked'}</span>
        </div>
        <div className="cm-meter"><i className={n === 0 ? 'tone-good' : 'tone-warn'} style={{ width: `${pct}%` }} /></div>
      </div>
    );
  }
  if (lensKey === 'subtext' || lensKey === 'voice') {
    const n = data.flags_count ?? data.flags?.length ?? 0;
    const pct = n === 0 ? 100 : Math.max(20, 100 - n * 20);
    return (
      <div className="cm-chart">
        <div className="cm-chart-stat">
          <b className={n === 0 ? 'tone-good' : 'tone-warn'}>{n === 0 ? 'Clean' : `${n} flag${n > 1 ? 's' : ''}`}</b>
          <span>{data.summary || (n === 0 ? 'No issues' : 'Needs attention')}</span>
        </div>
        <div className="cm-meter"><i className={n === 0 ? 'tone-good' : 'tone-warn'} style={{ width: `${pct}%` }} /></div>
      </div>
    );
  }
  return null;
}

interface AnalysisBodyProps {
  projectId: string | undefined;
  focusedScene: any;
  activeChapId: any;
}

function AnalysisBody({ projectId, focusedScene, activeChapId }: AnalysisBodyProps) {
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [_loading, _setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The gauge board — same source the thread beat wobbles read. We slice it
  // per-tick: the lenses watching the focused scene, and those watching its
  // chapter, each with that tick's own verdict.
  const { data: gaugeBoard } = useQuery({ ...queries.gaugesBoard(projectId), enabled: !!projectId });
  const charts = useMemo(() => (gaugeBoard as any)?.charts ?? [], [gaugeBoard]);
  const sceneVerdicts = useMemo(() => tickVerdictsFor(charts, focusedScene?.id), [charts, focusedScene?.id]);
  const chapterVerdicts = useMemo(() => tickVerdictsFor(charts, activeChapId), [charts, activeChapId]);
  const draftVerdicts = useMemo(() => draftVerdictsFor(charts), [charts]);

  useEffect(() => {
    if (!projectId) return;
    callOp(projectId, 'get_scene_pipelines').then((res: any) => {
      setPipelines(res.pipelines || []);
    }).catch(() => {});
  }, [projectId]);

  const toggle = useCallback(async (key: string) => {
    if (!projectId) return;
    const cur = pipelines.find((p) => p.key === key);
    if (!cur) return;
    const next = !cur.enabled;
    setPipelines((ps) => ps.map((p) => p.key === key ? { ...p, enabled: next } : p));
    try {
      await callOp(projectId, 'set_scene_pipeline', { key, enabled: next });
    } catch { /* revert on error */ setPipelines((ps) => ps.map((p) => p.key === key ? { ...p, enabled: !next } : p)); }
  }, [projectId, pipelines]);

  const refresh = useCallback(async () => {
    if (!projectId || !focusedScene?.id || refreshing) return;
    setRefreshing(true);
    try {
      await callOp(projectId, 'analyze_scene', { scene_id: String(focusedScene.id) });
    } catch { /* silent */ } finally {
      setRefreshing(false);
    }
  }, [projectId, focusedScene?.id, refreshing]);

  const analysis: Record<string, any> = focusedScene?.analysis ?? {};
  const active = pipelines.filter((p) => p.enabled);
  const tokTotal = active.reduce((s, p) => s + (COST_TOK[p.cost] ?? 0.4), 0);

  if (!focusedScene) {
    return (
      <div className="dv2-stack">
        <div className="cm-lens-summary is-paused">
          <span><EyeOff size={13} strokeWidth={1.9} /> Select a scene to analyse</span>
          <b>no charge</b>
        </div>
      </div>
    );
  }

  return (
    <div className="dv2-stack">
      <button type="button" className="cm-stale-bar" onClick={refresh} disabled={refreshing || active.length === 0}>
        <RefreshCw size={13} strokeWidth={2.2} className={refreshing ? 'is-spinning' : ''} />
        <span>
          {refreshing
            ? 'Running analysis…'
            : active.length === 0
              ? <>Turn on a lens below to analyse</>
              : <>Run analysis on <b>{focusedScene.text || `Scene`}</b></>}
        </span>
      </button>

      <div className={`cm-lens-summary${active.length ? '' : ' is-paused'}`}>
        <span>
          {active.length ? <Eye size={13} strokeWidth={1.9} /> : <EyeOff size={13} strokeWidth={1.9} />}
          {active.length ? `${active.length} of ${pipelines.length} lenses on` : 'All lenses paused'}
        </span>
        {active.length ? <b>~{tokTotal.toFixed(1)}k tok</b> : <b>no charge</b>}
      </div>

      {pipelines.map((p) => {
        const data = analysis[p.key];
        const st = p.enabled ? lensStatus(p.key, data) : 'paused';
        return (
          <div key={p.key} className={`cm-lens is-${st}`}>
            <div className="cm-lens-head">
              <span className="cm-lens-dot" />
              <b>{LENS_LABELS[p.key] || p.label}</b>
              {p.enabled ? <span className="cm-lens-cost">~{(COST_TOK[p.cost] ?? 0.4).toFixed(1)}k</span> : null}
              <button type="button" className={`cm-eye${p.enabled ? ' is-on' : ''}`}
                onClick={() => toggle(p.key)}
                title={p.enabled ? 'Stop watching' : 'Start watching'}
                aria-pressed={p.enabled}>
                {p.enabled ? <Eye size={14} strokeWidth={1.9} /> : <EyeOff size={14} strokeWidth={1.9} />}
              </button>
            </div>
            <p className="cm-lens-detail">
              {p.enabled ? lensDetail(p.key, data) : 'Paused — not watching, no tokens charged.'}
            </p>
            {p.enabled && data ? <LensChart lensKey={p.key} data={data} /> : null}
          </div>
        );
      })}

      <p className="cm-lens-foot">Each open eye watches your live draft and is billed tokens.</p>

      {(sceneVerdicts.length > 0 || chapterVerdicts.length > 0 || draftVerdicts.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <TickVerdictGroup title="Lenses on this scene" verdicts={sceneVerdicts} projectId={projectId} />
          <TickVerdictGroup title="Lenses on this chapter" verdicts={chapterVerdicts} projectId={projectId} />
          <TickVerdictGroup title="Watching the whole draft" verdicts={draftVerdicts} projectId={projectId} />
        </div>
      )}
    </div>
  );
}

// ---------- main drawer ----------

interface Props {
  mode: Mode;
  setMode: (m: Mode) => void;
  onClose: () => void;
  acts: OutlineActNode[];
  activeChapId: any;
  activeSc: any;
  onSelect: (chapId: any, sceneId: any) => void;
  beatStates: Record<string, BeatState>;
  onCycleBeat: (id: string) => void;
  // Notes section
  focusedScene: any;
  sceneContent: TipTapDoc | null;
  projectId: string | undefined;
  characters: any[];
  braindumps: any[];
  worldbuildings: any[];
}

export function DrawerV2({
  mode, setMode, onClose,
  acts, activeChapId, activeSc, onSelect,
  beatStates, onCycleBeat,
  focusedScene, sceneContent, projectId, characters, braindumps, worldbuildings,
}: Props) {
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);

  const beatMeta = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const act of acts)
      for (const ch of act.chapters)
        if (String(ch.id) === String(activeChapId))
          for (const sc of ch.scenes)
            for (const b of sc.beats) {
              total++;
              if ((beatStates[b.id] ?? 'todo') === 'done') done++;
            }
    return { total, done };
  }, [acts, activeChapId, beatStates]);

  return (
    <aside className="wmock-drawer" aria-label={mode === 'plan' ? 'Plan' : 'Analysis'}>
      <div className="dv2-head">
        <div className="dv2-modes" role="group" aria-label="Margin mode">
          <button type="button" className={mode === 'plan' ? 'is-on' : ''} onClick={() => setMode('plan')}>
            <ListTree size={13} strokeWidth={1.9} />
            Plan
          </button>
          <button type="button" className={mode === 'analysis' ? 'is-on' : ''} onClick={() => setMode('analysis')}>
            <Gauge size={13} strokeWidth={1.9} />
            Analysis
          </button>
        </div>
        <button type="button" className="dv2-close" onClick={onClose} title="Collapse margin">
          <PanelRight size={14} strokeWidth={1.9} />
        </button>
      </div>

      <div className="dv2-body">
        {mode === 'plan' ? (
          <div className="dv2-stack">
            <Section
              icon={<BookOpen size={13} strokeWidth={1.9} />}
              title="Outline"
              meta={beatMeta.total > 0 ? `${beatMeta.done}/${beatMeta.total} beats` : undefined}
              open={outlineOpen}
              onToggle={() => setOutlineOpen((v) => !v)}
            >
              <OutlineBody
                acts={acts}
                activeChapId={activeChapId}
                activeSc={activeSc}
                onSelect={onSelect}
                beatStates={beatStates}
                onCycleBeat={onCycleBeat}
              />
            </Section>
            <Section
              icon={<FileText size={13} strokeWidth={1.9} />}
              title="Notes"
              open={notesOpen}
              onToggle={() => setNotesOpen((v) => !v)}
            >
              <SceneNotes
                focusedScene={focusedScene}
                sceneContent={sceneContent}
                projectId={projectId}
                characters={characters}
                braindumps={braindumps}
                worldbuildings={worldbuildings}
              />
            </Section>
          </div>
        ) : (
          <AnalysisBody projectId={projectId} focusedScene={focusedScene} activeChapId={activeChapId} />
        )}
      </div>
    </aside>
  );
}
