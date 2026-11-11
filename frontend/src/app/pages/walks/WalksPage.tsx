import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spline, ListTree, BookText, ScanEye, Fingerprint } from 'lucide-react';
import { callOp } from '../../gateway';
import '../gauges/watching.css';
import '../characters/studio.css';
import '../../modules/lens/lens.css';
import '../../modules/lensKit/lensKit.css';
import { PageHeader } from '../../components/PageHeader';
import { PageShell } from '../../components/PageShell';
import { unbindGauge, createPreset, bindGauge } from '../gauges/api';
import { formatWelcomeHeadline, useWelcomeBack } from '../gauges/outlineSnapshot';
import { MarginBlock, MarginOverlay, type MarginItem } from '../../modules/margin';
import { StudioSection } from '../characters/components/StudioSection';
import { WorldSectionEntry } from '../world/components/WorldMargin';
import { ThreadMarginEntry } from '../threads/components/ThreadMarginEntry';
import { Icon } from '../../ui';
import { LensKit, LensVerdict } from '../../modules/lensKit';
import { chartToVerdict, chartNote, chartSlug } from '../../modules/lensKit/verdict';
import { WALK_TICKS, type RealWalk } from '../../modules/lens/lensLibrary';
import { queries } from '../../queries';
import { deriveVerdict } from '../gauges/verdict';
import { SceneFingerprints, type SceneFP } from './SceneFingerprints';

/**
 * WalksPage — the gauge board re-cut into MARGIN SECTIONS by WALK (the real axis
 * model, AXIS.md): each chart declares `axis: {walk, tick}` where walk is one of
 * story / outline / thread and tick is the granularity inside that walk.
 *
 * Top → bottom (each a <MarginBlock>, one shared <MarginOverlay>):
 *   1. header block  — page header + welcome-back banner + catches (no gutter)
 *   2. Prose walk    — axis.walk === 'story' (ticks: scene · chapter)
 *   3. Outline walk  — axis.walk === 'outline' (ticks: act · chapter · scene · heading · beat)
 *   4. Thread walk   — axis.walk === 'thread' (ticks: heading · beat), one sub-block per thread
 *   5. Lens bank     — the page-level LensKit (whole bank)
 *
 * Within a walk, bindings group into LANES = (lens · scope [· thread]). One card
 * per lane, with a TICK CYCLE over that walk's allowed ticks: a bound tick shows
 * its binding's verdict; an unbound tick shows an "unattached" state + an attach
 * CTA that clones the lane's config at the new tick.
 */

function walkOf(ch: any): RealWalk {
  const w = ch?.axis?.walk;
  if (w === 'story' || w === 'thread' || w === 'outline') return w;
  return ch?.thread_ref ? 'thread' : 'outline';
}

/* ── lane model: bindings of ONE lens on ONE scope (+ thread), keyed by tick ── */
interface Lane {
  key: string;
  name: string;
  scopeName: string;
  walk: RealWalk;
  /** tick → the (normalized) chart bound at that tick. */
  byTick: Map<string, any>;
}

function buildLanes(chs: any[], walk: RealWalk, rawById: Map<string, any>): Lane[] {
  const map = new Map<string, Lane>();
  for (const ch of chs) {
    // STABLE lens identity comes from the RAW chart: normalizeChart overwrites
    // template_id with the (per-binding) preset id, so chartSlug on the normalized
    // chart is unique per binding and would never group two ticks of one lens. The
    // raw chart keeps the config's template_id / section_lens.slug (stable).
    const raw = rawById.get(String(ch.binding_id || ch.id)) ?? ch;
    const k = `${chartSlug(raw)}|${ch.scope?.name || ''}|${ch.thread_ref || ''}`;
    let lane = map.get(k);
    if (!lane) {
      lane = { key: k, name: ch.name || ch.label || 'lens', scopeName: ch.scope?.name || '', walk, byTick: new Map() };
      map.set(k, lane);
    }
    const tick = ch.axis?.tick || WALK_TICKS[walk]?.default || 'scene';
    if (!lane.byTick.has(tick)) lane.byTick.set(tick, ch);
  }
  return [...map.values()];
}

/* ── attach-at-tick: clone the lane's existing binding config at a new tick. The
 *    raw chart IS the preset config + serve extras (get_gauge_board does
 *    `chart = dict(cfg)`), so we strip the instance/analysis fields and re-stamp
 *    the axis, then preset → bind (the same chain attach.ts runs). Free: no
 *    analysis runs — the new tick's card shows "not read yet" + a Scan button (SA-270). ── */
const CLONE_DROP = new Set([
  'id', 'binding_id', 'ref', 'source', 'scope', 'block_key', 'thread_ref', 'thread_label',
  'report_view', 'ticks', 'data_points', 'coverage', 'pairs', 'offending', 'score',
  'deferred', 'partial', 'verdict', 'analysed_at', 'rules_applied', 'missing_config',
  'scope_label', 'glyph_id', 'preset_id', 'lens_id', 'has_content',
]);
function presetConfigFromChart(raw: any, walk: string, tick: string, scopeType: string): any {
  const cfg: any = Object.fromEntries(Object.entries(raw || {}).filter(([k]) => !CLONE_DROP.has(k)));
  cfg.axis = { walk, tick };
  cfg.scope_type = scopeType;
  cfg.source = 'preset';
  return cfg;
}
const pickId = (r: any, k: string) => r?.[k] ?? r?.result?.[k];
async function attachAtTick(projectId: any, raw: any, walk: RealWalk, tick: string): Promise<void> {
  const scopeType = raw?.scope?.type || 'story';
  const cfg = presetConfigFromChart(raw, walk, tick, scopeType);
  const p = await createPreset(projectId, cfg);
  const presetId = pickId(p, 'preset_id');
  if (!presetId) throw new Error('attach-at-tick produced no preset_id');
  const bindArgs: any = { ref: { kind: 'preset', id: presetId }, source: 'preset', scope_type: scopeType, scope_name: raw?.scope?.name };
  if (walk === 'thread' && raw?.thread_ref) bindArgs.thread_ref = raw.thread_ref;
  await bindGauge(projectId, bindArgs);
}

/* the tick cycle — a pill per allowed tick. Bound ticks are solid; unbound ticks
 * are dashed/muted; the selected one is emphasised. Click to cycle. */
function TickRow({ allowed, bound, selected, onSelect }: {
  allowed: string[]; bound: Map<string, any>; selected: string; onSelect: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {allowed.map((t) => {
        const isBound = bound.has(t);
        const isSel = t === selected;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            title={isBound ? `${t} — attached` : `${t} — not attached`}
            className="rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-wide"
            style={{
              border: `1px ${isBound ? 'solid' : 'dashed'} ${isSel ? 'var(--ink)' : 'var(--line)'}`,
              background: isBound ? (isSel ? 'var(--ink)' : 'var(--surface-2)') : 'transparent',
              color: isBound ? (isSel ? 'var(--surface)' : 'var(--ink-2)') : (isSel ? 'var(--ink-3)' : 'var(--ink-4)'),
              fontWeight: isSel ? 700 : 500,
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/* the unbound-tick body — an allowed tick with no binding. Offers to attach the
 * lane's lens at this walk/tick. */
function UnattachedTick({ walk, tick, attaching, onAttach }: {
  walk: RealWalk; tick: string; attaching: boolean; onAttach: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--r-md)] border border-dashed border-[var(--line)] px-3 py-4">
      <span className="cst-sec-desc">— unattached · {walk}/{tick}</span>
      <span className="flex-1" />
      <button type="button" className="wv2-btn wv2-btn-sm" disabled={attaching} onClick={onAttach}>
        <span className="lens-spark">✦</span> {attaching ? 'Attaching…' : 'attach here'}
      </button>
    </div>
  );
}

/* One binding's verdict, rendered both ways: the mini-chart tile (NORMALIZED,
 * queries.gaugesBoardView) + the lens verdict (RAW, queries.gaugesBoard) — two
 * views of the one cached board. The two renderers need
 * different shapes of the SAME binding — normalizeChart flattens y_items +
 * objectifies verdict, which the mini-chart needs but chartToVerdict can't read. */
function BindingRow({ chart, raw, projectId, refetch }: {
  chart: any; raw?: any; projectId?: string; onOpen: (id: string) => void; refetch: () => void;
}) {
  const v = raw ?? chart;
  const detach = async () => {
    try { await unbindGauge(projectId, chart.binding_id || chart.id); refetch(); }
    catch (e) { console.error('[walks] detach failed', e); }
  };
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      {/* <div className="lg:w-[300px] lg:flex-shrink-0">
        <Card chart={chart} onOpen={onOpen} onRemoved={refetch} />
      </div> */}
      {/* lens-root supplies the --lens-* tokens + .ui/.sl-* scope the verdict box
          styles depend on (they're all scoped under .lens-root in lens.css). */}
      <div className="lens-root min-w-0 flex-1">
        <LensVerdict
          variant="lite"
          name={v.question || v.name || v.label}
          meta={chartNote(v)}
          verdict={chartToVerdict(v)}
          typeId={v.type}
          projectId={projectId}
          chartId={v.binding_id || chart.binding_id || v.id}
          onDetach={detach}
        />
      </div>
    </div>
  );
}

/* one LANE = one lens on one scope, cycled across the walk's ticks. */
function LaneCard({ lane, projectId, rawOf, onOpenChart, refetch }: {
  lane: Lane; projectId?: string; rawOf: (ch: any) => any; onOpenChart: (id: string) => void; refetch: () => void;
}) {
  const allowed = WALK_TICKS[lane.walk]?.ticks ?? [];
  const defaultTick = allowed.find((t) => lane.byTick.has(t)) ?? WALK_TICKS[lane.walk]?.default ?? allowed[0] ?? 'scene';
  const [tick, setTick] = useState(defaultTick);
  const [attaching, setAttaching] = useState(false);

  const sel = lane.byTick.get(tick);
  const doAttach = async () => {
    const sibling = [...lane.byTick.values()][0];
    const siblingRaw = sibling ? rawOf(sibling) : undefined;
    if (!siblingRaw || attaching) return;
    setAttaching(true);
    try { await attachAtTick(projectId, siblingRaw, lane.walk, tick); refetch(); }
    catch (e) { console.error('[walks] attach-at-tick failed', e); }
    finally { setAttaching(false); }
  };

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] p-3">
      <div className="flex justify-end gap-3">
        <TickRow allowed={allowed} bound={lane.byTick} selected={tick} onSelect={setTick} />
      </div>
      <div className="mt-3">
        {sel
          ? <BindingRow chart={sel} raw={rawOf(sel)} projectId={projectId} onOpen={onOpenChart} refetch={refetch} />
          : <UnattachedTick walk={lane.walk} tick={tick} attaching={attaching} onAttach={doAttach} />}
      </div>
    </div>
  );
}

/* The "nothing bound on this walk yet" body. */
function AttachPrompt({ kind, onBrowse }: { kind: string; onBrowse: () => void }) {
  return (
    <div className="flex items-center gap-3 py-5">
      <span className="cst-sec-desc">— no {kind} lenses attached yet</span>
      <span className="flex-1" />
      <button type="button" className="wv2-btn wv2-btn-sm" onClick={onBrowse}>
        Lens bank
      </button>
    </div>
  );
}

const EMPTY_BOARD = { charts: [] as any[], scenes: [] as any[] };

const SECTION_META: Record<string, { icon: ReactNode; label: string }> = {
  story: { icon: <Icon as={BookText} size={17} />, label: 'Prose walk' },
  outline: { icon: <Icon as={ListTree} size={17} />, label: 'Outline walk' },
  thread: { icon: <Icon as={Spline} size={17} />, label: 'Thread walk' },
  fingerprints: { icon: <Icon as={Fingerprint} size={17} />, label: 'Scene fingerprints' },
  bank: { icon: <Icon as={ScanEye} size={17} />, label: 'Lens bank' },
};

export function WalksPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = String(projectId);
  const qc = useQueryClient();
  const { data: board = EMPTY_BOARD } = useQuery({ ...queries.gaugesBoardView(projectId), enabled: !!projectId });
  const charts = board.charts;

  // refresh the board (both views share one cache entry) plus the bank/section
  // caches after any attach/detach.
  const refetch = () => qc.invalidateQueries({ queryKey: ['gauges', pid] });

  // The raw view of the same board — what the lensKit verdict layer reads. The
  // mini-chart Card needs the normalized view above. Keyed by binding_id.
  const { data: rawBoard = EMPTY_BOARD } = useQuery({ ...queries.gaugesBoard(projectId), enabled: !!projectId });
  const rawById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of rawBoard.charts) m.set(String(c.binding_id || c.id), m.get(String(c.binding_id || c.id)) ?? c);
    return m;
  }, [rawBoard]);
  const rawOf = (ch: any) => rawById.get(String(ch.binding_id || ch.id));

  const { data: threadData } = useQuery({ ...queries.plotThreads(projectId), enabled: !!projectId, staleTime: 60_000 });
  const threads: any[] = (threadData as any)?.threads ?? [];

  // Scene fingerprints walk — the RICH per-scene scene_properties (4D) read from
  // the grand outline (a DIFFERENT source than the gauge board), rendered through
  // its own card rather than the lane/tick model. Uses the shared outline cache.
  const { data: fpOutline, refetch: refetchFp } = useQuery({ ...queries.outline(projectId), enabled: !!projectId });
  const fpScenes: SceneFP[] = useMemo(() => {
    const acts = (fpOutline as any)?.acts || [];
    const out: SceneFP[] = []; let n = 0;
    for (const act of acts) for (const ch of act.chapters || []) for (const sc of ch.scenes || []) {
      n++; const sp = sc.analysis?.scene_properties; const ok = sp?.status === 'ok';
      out.push({
        id: String(sc.id), label: sc.text || `Scene ${n}`,
        pacing_type: ok ? sp.pacing_type : undefined, mood: ok ? sp.mood : undefined,
        intensity: ok ? sp.intensity : undefined, characters_present: sp?.characters_present, rationale: sp?.rationale
      });
    }
    return out;
  }, [fpOutline]);
  const fpReadCount = useMemo(() => fpScenes.filter((s) => s.pacing_type).length, [fpScenes]);
  const analyseScenes = async () => {
    try {
      await callOp(projectId, 'set_scene_pipeline', { key: 'scene_properties', enabled: true });
      await Promise.all(fpScenes.map((s) => callOp(projectId, 'analyze_scene', { scene_id: s.id }).catch(() => { })));
      setTimeout(() => refetchFp(), 2500); setTimeout(() => refetchFp(), 6000);
    } catch (e) { console.error('[walks] analyse scenes failed', e); }
  };

  // welcome-back banner — diffs the shared outline cache against the last visit
  const { welcomeCopy, isFirstVisit } = useWelcomeBack(projectId);

  // partition the board by the REAL walk (axis.walk)
  const walks = useMemo(() => {
    const out: Record<RealWalk, any[]> = { story: [], outline: [], thread: [] };
    for (const ch of charts) out[walkOf(ch)].push(ch);
    return out;
  }, [charts]);

  const storyLanes = useMemo(() => buildLanes(walks.story, 'story', rawById), [walks.story, rawById]);
  const outlineLanes = useMemo(() => buildLanes(walks.outline, 'outline', rawById), [walks.outline, rawById]);

  // thread walk → grouped by thread, matched to the real thread for its glossy
  // margin heading; each thread's bindings become LANES inside the sub-block.
  const threadGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ch of walks.thread) {
      const key = String(ch.thread_ref);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ch);
    }
    return [...map.entries()].map(([ref, chs]) => {
      const thread = threads.find((t) => String(t.id) === ref || String(t.thread_id) === ref);
      return { ref, thread, label: thread?.name || chs[0]?.thread_label || ref, lanes: buildLanes(chs, 'thread', rawById) };
    });
  }, [walks.thread, threads, rawById]);

  // collapse state — sections + per-thread sub-blocks default OPEN.
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => !closedSections[id];
  const toggleSection = (id: string) => setClosedSections((s) => ({ ...s, [id]: !s[id] }));
  const [closedThreads, setClosedThreads] = useState<Record<string, boolean>>({});
  const isThreadOpen = (ref: string) => !closedThreads[ref];
  const toggleThread = (ref: string) => setClosedThreads((s) => ({ ...s, [ref]: !s[ref] }));

  const gutterAnchorRef = useRef<HTMLDivElement>(null);

  // catches / welcome counts (reuse the gauges verdict deriver)
  const consistency = useMemo(() => charts.filter((c: any) => c.mode !== 'descriptive'), [charts]);
  const attention = useMemo(
    () => charts.filter((c: any) => { const v = deriveVerdict(c).verdict; return v === 'warn' || v === 'open'; }),
    [charts],
  );
  const attentionCount = attention.length;
  const holdingCount = consistency.filter((c: any) => deriveVerdict(c).verdict === 'holds').length;

  const openBank = () => navigate(`/project/${pid}/gauges/bank`);
  const openChart = (id: string) => navigate(`/project/${pid}/lens/${id}`);

  const laneCount: Record<string, number> = {
    story: storyLanes.length, outline: outlineLanes.length,
    thread: threadGroups.reduce((n, g) => n + g.lanes.length, 0),
    fingerprints: fpReadCount,
  };

  const sectionEntry = (id: string, onClick?: () => void): ReactNode => {
    const m = SECTION_META[id];
    return <WorldSectionEntry icon={m.icon} label={m.label} sub={id in laneCount ? `${laneCount[id]}` : undefined} onClick={onClick} />;
  };

  const overlayItems: MarginItem[] = useMemo(
    () => ['story', 'outline', 'thread', 'fingerprints', 'bank'].map((id) => ({
      id, render: (s: () => void) => sectionEntry(id, s),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storyLanes.length, outlineLanes.length, threadGroups.length, fpReadCount],
  );

  const bankBtn = (
    <button type="button" className="wv2-btn wv2-btn-primary wv2-btn-sm" onClick={openBank}>
      Lens bank
    </button>
  );

  // one of the non-thread walk sections (story / outline): collapsible shell, body
  // = its lanes (or the attach prompt when the walk is empty).
  const laneSection = (walk: 'story' | 'outline', lanes: Lane[], anchor?: boolean) => {
    const entry = sectionEntry(walk, () => toggleSection(walk));
    return (
      <MarginBlock id={walk} gutter={anchor ? <div ref={gutterAnchorRef}>{entry}</div> : entry}>
        <StudioSection glyph="◎" label={walk}
          desc={`${lanes.length} lens${lanes.length === 1 ? '' : 'es'} on the ${WALK_TICKS[walk].label}`}
          open={isOpen(walk)} onToggle={() => toggleSection(walk)}>
          {lanes.length === 0
            ? <AttachPrompt kind={WALK_TICKS[walk].label} onBrowse={openBank} />
            : <div className="flex flex-col gap-4 py-2">
              {lanes.map((lane) => (
                <LaneCard key={lane.key} lane={lane} projectId={projectId} rawOf={rawOf} onOpenChart={openChart} refetch={refetch} />
              ))}
            </div>}
        </StudioSection>
      </MarginBlock>
    );
  };

  const pageHeader = (
    <PageHeader
      section="walks"
      eyebrow="Plan · lenses"
      title="Lenses"
      suffix={charts.length ? `· ${charts.length}` : undefined}
      actions={bankBtn}
      caption={<span className="wtch-sub"><b>{charts.length} {charts.length === 1 ? 'lens' : 'lenses'}</b> across your walks &middot; <b>{attentionCount}</b> to look at</span>}
    />
  );

  return (
    <PageShell
      header={pageHeader}
      overlay={<MarginOverlay items={overlayItems} anchorRef={gutterAnchorRef} />}
    >
      {/* welcome-back banner + catches strip (formerly hosted by the header-only
          MarginBlock; the header itself now lives in PageShell.header) */}
      <div>
        {/* welcome-back banner */}
        <div className="wtch-wb">
            <div className="wtch-wb-row">
              <div className="wtch-wb-icon"><svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></svg></div>
              <div className="wtch-wb-body">
                <div className="wtch-wb-lbl">&#10022; welcome back</div>
                <div className="wtch-wb-h">
                  {welcomeCopy ? <span dangerouslySetInnerHTML={{ __html: formatWelcomeHeadline(welcomeCopy.headline) }} />
                    : isFirstVisit ? <>First time here &mdash; your outline is being snapshot for next time.</>
                      : <>Loading&hellip;</>}
                </div>
                <div className="wtch-wb-deltas">
                  {(welcomeCopy?.addedCount ?? 0) > 0 && (
                    <span className="wtch-wb-delta is-new"><svg viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg><b>{welcomeCopy!.addedCount} scene{welcomeCopy!.addedCount !== 1 ? 's' : ''} added</b></span>
                  )}
                  {(welcomeCopy?.editedCount ?? 0) > 0 && (
                    <span className="wtch-wb-delta"><svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg><b>{welcomeCopy!.editedCount} edited</b></span>
                  )}
                  <span className="wtch-wb-delta"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg><b>{holdingCount} {holdingCount === 1 ? 'lens' : 'lenses'}</b> still holding</span>
                  {attentionCount > 0 && (
                    <span className="wtch-wb-delta is-catch"><svg viewBox="0 0 24 24"><path d="M12 4.5l8.5 15h-17l8.5-15z" /><path d="M12 10v4.5" /></svg><b>{attentionCount} catch{attentionCount !== 1 ? 'es' : ''}</b></span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* catches strip */}
          {attentionCount > 0 && (
            <div className="wtch-catches">
              <div className="wtch-catch-icon"><svg viewBox="0 0 24 24"><path d="M12 4.5l8.5 15h-17l8.5-15z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.5" r=".7" fill="currentColor" /></svg></div>
              <span className="wtch-catch-tag">to look at &middot; {attentionCount}</span>
              <div className="wtch-catch-msg">{attentionCount === 1 ? 'One lens needs attention.' : `${attentionCount} lenses need attention.`}</div>
              <button className="wtch-catch-go" onClick={() => openChart(attention[0].id)}>Open<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
            </div>
          )}
      </div>

      {/* 2 · Prose walk (axis.walk === 'story') — anchors the overlay column */}
      {laneSection('story', storyLanes, true)}

        {/* 3 · Outline walk (axis.walk === 'outline') */}
        {laneSection('outline', outlineLanes)}

        {/* 4 · Thread walk — section heading; per-thread sub-blocks follow as
            siblings (their glossy margins ride the MAIN gutter, like studio). */}
        <MarginBlock id="thread" gutter={sectionEntry('thread', () => toggleSection('thread'))}>
          <StudioSection glyph="◎" label="thread"
            desc={`${laneCount.thread} lens${laneCount.thread === 1 ? '' : 'es'} on the thread walk`}
            open={isOpen('thread')} onToggle={() => toggleSection('thread')}>
            {threadGroups.length === 0 && <AttachPrompt kind="thread walk" onBrowse={openBank} />}
          </StudioSection>
        </MarginBlock>

        {isOpen('thread') && threadGroups.map((g) => (
          <MarginBlock
            key={g.ref}
            id={`thread-${g.ref}`}
            gutter={
              <div className="origin-left scale-[0.88] pl-3">
                {g.thread
                  ? <ThreadMarginEntry thread={g.thread} onClick={() => toggleThread(g.ref)} />
                  : <WorldSectionEntry icon={<Icon as={Spline} size={15} />} label={g.label} onClick={() => toggleThread(g.ref)} />}
              </div>
            }
          >
            {isThreadOpen(g.ref) && (
              <div className="flex flex-col gap-4 py-2 pl-3">
                {g.lanes.map((lane) => (
                  <LaneCard key={lane.key} lane={lane} projectId={projectId} rawOf={rawOf} onOpenChart={openChart} refetch={refetch} />
                ))}
              </div>
            )}
          </MarginBlock>
        ))}

        {/* 5 · Scene fingerprints — the rich 4D per-scene read (own results model) */}
        <MarginBlock id="fingerprints" gutter={sectionEntry('fingerprints', () => toggleSection('fingerprints'))}>
          <StudioSection glyph="◎" label="fingerprints"
            desc={`${fpReadCount} scene${fpReadCount === 1 ? '' : 's'} fingerprinted`}
            open={isOpen('fingerprints')} onToggle={() => toggleSection('fingerprints')}>
            <SceneFingerprints scenes={fpScenes} projectId={projectId} onAnalyse={analyseScenes} onBrowse={openBank} />
          </StudioSection>
        </MarginBlock>

        {/* 6 · Lens bank — the page-level LensKit (whole bank), like thread/studio */}
        <MarginBlock id="bank" gutter={sectionEntry('bank', () => toggleSection('bank'))}>
          <StudioSection glyph="◎" label="bank" desc="the whole lens bank — attach any to a walk" open={isOpen('bank')} onToggle={() => toggleSection('bank')}>
            <LensKit type="page" where="threads" variant="real" showHead={false} threads={threads} />
          </StudioSection>
        </MarginBlock>
    </PageShell>
  );
}
