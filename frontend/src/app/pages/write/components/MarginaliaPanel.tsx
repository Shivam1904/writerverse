import { useMemo, useState } from 'react';
import { linkSceneEntity, type SceneLinkKind } from '../sceneLinks';
import { useWriteStore } from '../writeStore';
import type { WriteScene, MarginaliaItem, TipTapDoc } from '../data';

interface Props {
  focusedScene: WriteScene | null;
  sceneIndex: number;
  sceneContent: TipTapDoc | null;
  projectId: string | undefined;
  characters: any[];
  braindumps: any[];
  worldbuildings: any[];
  pipelines?: any[];
  onTogglePipeline?: (key: string, enabled: boolean) => void;
}

interface ResolvedRef {
  key: string;
  type: 'char' | 'braindump' | 'world';
  gl: string;
  kind: string;
  name: string;
  detail: string;
  // dangling = link is in the scene's entity_links but not in the prose;
  // we show it the same way but with a subtle marker so the author can tell.
  dangling?: boolean;
}

type EntityType = 'character' | 'braindump' | 'worldbuilding';

interface DocRef {
  entityType: EntityType;
  id: number;
}

function extractRefsFromDoc(doc: TipTapDoc | null): DocRef[] {
  if (!doc) return [];
  const seen = new Set<string>();
  const refs: DocRef[] = [];

  function walk(node: any) {
    if (!node) return;

    // paragraph-level refs carried forward by an AI edit (propose_scene_edits):
    // when the AI rewrites a paragraph that held the author's references, the
    // entity set is preserved on the whole paragraph (attrs.refs) instead of the
    // now-replaced inline phrase marks. Honor them like any other reference.
    if (node.type === 'paragraph' && Array.isArray(node.attrs?.refs)) {
      for (const r of node.attrs.refs) {
        if (!r?.entityType || r?.id == null) continue;
        const id = typeof r.id === 'string' ? parseInt(r.id, 10) : r.id;
        if (isNaN(id)) continue;
        const key = `${r.entityType}:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({ entityType: r.entityType, id });
        }
      }
    }

    // mention nodes (characters via @)
    if (node.type === 'mention' && node.attrs?.entityType && node.attrs?.id) {
      const id = typeof node.attrs.id === 'string' ? parseInt(node.attrs.id, 10) : node.attrs.id;
      if (!isNaN(id)) {
        const key = `${node.attrs.entityType}:${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({ entityType: node.attrs.entityType, id });
        }
      }
    }

    // spanRef marks (braindumps/worldbuildings tagged on text)
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type !== 'spanRef') continue;
        const a = mark.attrs;
        if (a?.entityId && a?.entityType) {
          const id = typeof a.entityId === 'string' ? parseInt(a.entityId, 10) : a.entityId;
          if (!isNaN(id)) {
            const key = `${a.entityType}:${id}`;
            if (!seen.has(key)) {
              seen.add(key);
              refs.push({ entityType: a.entityType, id });
            }
          }
        }
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  }

  walk(doc);
  return refs;
}

const TYPE_CONFIG: Record<EntityType, { type: ResolvedRef['type']; gl: string; kind: string }> = {
  character:     { type: 'char',  gl: 'L', kind: 'character' },
  braindump:     { type: 'braindump',  gl: '✨', kind: 'braindump' },
  worldbuilding: { type: 'world', gl: '○', kind: 'worldbuilding' },
};

function resolveRefs(
  docRefs: DocRef[],
  characters: any[],
  braindumps: any[],
  worldbuildings: any[],
): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  for (const ref of docRefs) {
    const cfg = TYPE_CONFIG[ref.entityType];
    if (!cfg) continue;
    let name = '';
    let detail = '';
    if (ref.entityType === 'character') {
      const c = characters.find((ch: any) => ch.id === ref.id);
      if (!c) continue;
      name = c.name ?? 'Unnamed';
      detail = c.role ?? c.description ?? '';
    } else if (ref.entityType === 'braindump') {
      const b = braindumps.find((bd: any) => bd.id === ref.id);
      if (!b) continue;
      name = b.title ?? 'Untitled braindump';
      detail = b.raw_text
        ? b.raw_text.slice(0, 120) + (b.raw_text.length > 120 ? '…' : '')
        : '';
    } else if (ref.entityType === 'worldbuilding') {
      const w = worldbuildings.find((wb: any) => wb.id === ref.id);
      if (!w) continue;
      name = w.title ?? 'Untitled';
      detail = w.content
        ? w.content.slice(0, 120) + (w.content.length > 120 ? '…' : '')
        : '';
    }
    out.push({ key: `${ref.entityType}-${ref.id}`, ...cfg, name, detail });
  }
  return out;
}

type LinkKind = SceneLinkKind;

// Same picker shape as the SelectionAsk floating bar, but no text selection
// and no prose mutation: clicking an item creates a "dangling" scene→entity
// scene link (`link_scene_entity`) and stores the scene's new entity_links so
// the marginalia immediately surfaces it. Disabled when no scene/project is
// in scope.
interface AttachLinkPickerProps {
  sceneId: number | null;
  projectId: string | undefined;
  braindumps: any[];
  worldbuildings: any[];
  alreadyLinked: Set<string>;
}

function AttachLinkPicker({
  sceneId,
  projectId,
  braindumps,
  worldbuildings,
  alreadyLinked,
}: AttachLinkPickerProps) {
  const [expanded, setExpanded] = useState<LinkKind | null>(null);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const disabled = sceneId == null || !projectId || pending;

  const items = useMemo(() => {
    const list = expanded === 'braindump' ? braindumps : expanded === 'worldbuilding' ? worldbuildings : [];
    const q = query.trim().toLowerCase();
    return list
      .map((x: any) => ({
        id: x.id,
        label:
          x.title ||
          (typeof x.content === 'string' ? x.content.slice(0, 50) : '') ||
          (typeof x.raw_text === 'string' ? x.raw_text.slice(0, 50) : '') ||
          `${expanded === 'braindump' ? 'Braindump' : 'Worldbuilding'} ${x.id}`,
      }))
      .filter((it: { id: number; label: string }) =>
        !alreadyLinked.has(`${expanded}-${it.id}`) &&
        (!q || it.label.toLowerCase().includes(q)),
      );
  }, [expanded, query, braindumps, worldbuildings, alreadyLinked]);

  const toggle = (kind: LinkKind) => {
    setExpanded((prev) => (prev === kind ? null : kind));
    setQuery('');
  };

  const attach = async (entityType: LinkKind, id: number) => {
    if (sceneId == null || !projectId) return;
    setPending(true);
    try {
      await linkSceneEntity(projectId, sceneId, entityType, id);
    } catch {
      // callOp already showed the author a toast; the picker resets for a retry.
    } finally {
      setPending(false);
      setExpanded(null);
      setQuery('');
    }
  };

  return (
    <div className="wr-attach-pick">
      <div className="wr-attach-pick-row">
        <button
          type="button"
          className={`wr-attach-pick-btn${expanded === 'braindump' ? ' is-open' : ''}`}
          onClick={() => toggle('braindump')}
          disabled={disabled}
        >
          <span className="wr-attach-pick-gl">✨</span>
          Link Brain Dumps
        </button>
        <button
          type="button"
          className={`wr-attach-pick-btn${expanded === 'worldbuilding' ? ' is-open' : ''}`}
          onClick={() => toggle('worldbuilding')}
          disabled={disabled}
        >
          <span className="wr-attach-pick-gl">○</span>
          Link Worldbuilding
        </button>
      </div>
      {expanded && (
        <div className="wr-attach-pick-dropdown">
          <input
            autoFocus
            type="text"
            className="wr-attach-pick-search"
            placeholder={expanded === 'braindump' ? 'Search braindumps…' : 'Search worldbuilding…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="wr-attach-pick-list">
            {items.length === 0 ? (
              <div className="wr-attach-pick-empty">No matches</div>
            ) : (
              items.map((it: { id: number; label: string }) => (
                <button
                  key={it.id}
                  type="button"
                  className="wr-attach-pick-option"
                  onClick={() => attach(expanded, it.id)}
                  disabled={pending}
                >
                  {it.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GlossEntry({ item }: { item: MarginaliaItem }) {
  return (
    <div className="wr-gloss" data-type={item.type}>
      <div className="wr-gloss-label">
        <span className="wr-gl">{item.gl}</span>
        {item.kind}
      </div>
      {/* Plain text on purpose: this body may one day come from AI or the
          author, so it is never injected as HTML. */}
      <div className="wr-gloss-body">{item.body}</div>
      <span className="wr-gloss-from">
        linked to <b>"{item.link}"</b>
      </span>
    </div>
  );
}

function RefEntry({ item, isHovered }: { item: ResolvedRef; isHovered: boolean }) {
  return (
    <div
      className={`wr-gloss${isHovered ? ' is-hovered' : ''}${item.dangling ? ' is-dangling' : ''}`}
      data-type={item.type}
    >
      <div className="wr-gloss-label">
        <span className="wr-gl">{item.gl}</span>
        {item.kind}
        {item.dangling && <span className="wr-gloss-dangling">attached</span>}
      </div>
      <div className="wr-gloss-body">
        <b>{item.name}</b>
        {item.detail && (
          <>
            {' — '}
            <em>{item.detail}</em>
          </>
        )}
      </div>
    </div>
  );
}

// noun (lowercased) → glyph + type, so a resolved noun shows the same palette as
// the inline refs. Characters (incl. aliases) → char/L; world items → world/○;
// anything else (thread name, braindump entity) gets a neutral dot.
function buildNounLookup(characters: any[], worldbuildings: any[]) {
  const map = new Map<string, { type: ResolvedRef['type']; gl: string }>();
  for (const c of characters || []) {
    if (c?.name) map.set(String(c.name).toLowerCase(), { type: 'char', gl: 'L' });
    for (const a of c?.aliases || []) {
      const nm = typeof a === 'string' ? a : a?.name;
      if (nm) map.set(String(nm).toLowerCase(), { type: 'char', gl: 'L' });
    }
  }
  for (const w of worldbuildings || []) {
    if (w?.title) map.set(String(w.title).toLowerCase(), { type: 'world', gl: '○' });
  }
  return map;
}

function nounMeta(
  map: Map<string, { type: ResolvedRef['type']; gl: string }>,
  noun: string,
): { type?: ResolvedRef['type']; gl: string } {
  return map.get(String(noun || '').toLowerCase()) ?? { type: undefined, gl: '·' };
}

// resolve_nouns pipeline output: entity mentions, pronouns resolved to a noun,
// and unresolved pronouns (flagged for the author).
function ResolveNounsSection({
  data,
  nounLookup,
}: {
  data: NonNullable<WriteScene['analysis']['resolve_nouns']>;
  nounLookup: Map<string, { type: ResolvedRef['type']; gl: string }>;
}) {
  const mentions = data.mentions ?? [];
  const resolved = data.resolved ?? [];
  const unresolved = data.unresolved ?? [];
  if (!mentions.length && !resolved.length && !unresolved.length) return null;

  return (
    <div className="wr-rn">
      {(mentions.length > 0 || resolved.length > 0) && (
        <div className="wr-rn-group">
          <div className="wr-rn-cap">references &amp; pronouns</div>
          {mentions.map((m, i) => {
            const meta = nounMeta(nounLookup, m.noun);
            return (
              <div key={`m${i}`} className="wr-gloss" data-type={meta.type}>
                <div className="wr-gloss-label">
                  <span className="wr-gl">{meta.gl}</span>
                  {m.noun}
                </div>
                <div className="wr-gloss-body">
                  <em>"{m.phrase}"</em>
                </div>
              </div>
            );
          })}
          {resolved.map((r, i) => {
            const meta = nounMeta(nounLookup, r.noun);
            return (
              <div key={`r${i}`} className="wr-gloss" data-type={meta.type}>
                <div className="wr-gloss-label">
                  <span className="wr-gl">{meta.gl}</span>
                  {r.noun}
                  <span className="wr-rn-pron">"{r.pronoun}"</span>
                </div>
                <div className="wr-gloss-body">
                  <em>"{r.phrase}"</em>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {unresolved.length > 0 && (
        <div className="wr-rn-group">
          <div className="wr-rn-cap">unresolved pronouns</div>
          {unresolved.map((u, i) => (
            <div key={`u${i}`} className="wr-gloss" data-type="flag">
              <div className="wr-gloss-label">
                <span className="wr-gl">?</span>
                {u.pronoun}
                <span className="wr-gloss-dangling">unresolved</span>
              </div>
              <div className="wr-gloss-body">
                <em>"{u.phrase}"</em>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Per-project on/off switches for the scene-analysis pipelines.
function PipelineToggles({
  pipelines,
  onToggle,
}: {
  pipelines: any[];
  onToggle?: (key: string, enabled: boolean) => void;
}) {
  if (!pipelines?.length) return null;
  return (
    <div className="wr-pipes">
      {pipelines.map((p: any) => (
        <button
          key={p.key}
          type="button"
          className={`wr-pipe${p.enabled ? ' is-on' : ''}`}
          onClick={() => onToggle?.(p.key, !p.enabled)}
          title={p.enabled ? `${p.label}: on` : `${p.label}: off`}
        >
          <span className="wr-pipe-dot" />
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── Scene checks (POV purity / hook / subtext / voice analyses) ────────────
// One compact, collapsible block instead of four always-open prose dumps.
// Each row: a state dot + short label + at-a-glance status; expand for detail.
// State is read by shape + one accent (per the design system), not loud colour.
function splitDash(s: string): [string, string] {
  const i = (s || '').indexOf(' — ');
  return i === -1 ? [(s || '').trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 3).trim()];
}
function stripQuotes(s: string): string {
  return (s || '').replace(/^["“”'`]+|["“”'`]+$/g, '').trim();
}
function hookParts(line: string): { grade: string; note: string } {
  const after = (line || '').replace(/^\s*(OPENING|CLOSING)\s*:\s*/i, '');
  const [grade, note] = splitDash(after);
  return { grade: (grade || '—').trim(), note };
}

function ExcerptItem({ quote, reason }: { quote: string; reason: string }) {
  return (
    <div className="wr-chk-item">
      {quote && <span className="wr-chk-quote">“{quote}”</span>}
      {reason && <span className="wr-chk-reason">{reason}</span>}
    </div>
  );
}

function CheckRow({
  label, status, tone, items,
}: {
  label: string; status: any; tone: 'issues' | 'clean' | 'skip'; items?: any[];
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!items && items.length > 0;
  return (
    <div className={`wr-chk wr-chk--${tone}`}>
      <button
        type="button"
        className="wr-chk-head"
        onClick={() => hasDetail && setOpen((o) => !o)}
        disabled={!hasDetail}
        aria-expanded={hasDetail ? open : undefined}
      >
        <span className="wr-chk-dot" />
        <span className="wr-chk-label">{label}</span>
        <span className="wr-chk-status">{status}</span>
        {hasDetail && <span className={`wr-chk-caret${open ? ' is-open' : ''}`}>›</span>}
      </button>
      {hasDetail && open && <div className="wr-chk-body">{items}</div>}
    </div>
  );
}

function SceneChecks({ povPurity, hookGrade, subtext, voice }: any) {
  const rows: any[] = [];

  if (povPurity && povPurity.status !== 'empty') {
    const vios: string[] = Array.isArray(povPurity.violations) ? povPurity.violations : [];
    if (povPurity.status === 'failed') {
      rows.push(<CheckRow key="pov" label="POV purity" tone="skip" status="—" />);
    } else {
      const items = vios.map((v, i) => {
        const [q, r] = splitDash(v);
        return <ExcerptItem key={i} quote={stripQuotes(q)} reason={r} />;
      });
      rows.push(
        <CheckRow key="pov" label="POV purity" tone={vios.length ? 'issues' : 'clean'}
          status={vios.length ? vios.length : 'clean'} items={items} />,
      );
    }
  }

  if (hookGrade && (hookGrade.opening_verdict || hookGrade.closing_verdict)) {
    const o = hookParts(hookGrade.opening_verdict);
    const c = hookParts(hookGrade.closing_verdict);
    const weak = [o.grade, c.grade].some((g) => /weak/i.test(g));
    const items = [
      <div className="wr-chk-item wr-chk-item--row" key="o">
        <span className="wr-chk-who">Open</span>
        <span className="wr-chk-grade" data-g={o.grade.toLowerCase()}>{o.grade}</span>
        {o.note && <span className="wr-chk-reason">{o.note}</span>}
      </div>,
      <div className="wr-chk-item wr-chk-item--row" key="c">
        <span className="wr-chk-who">Close</span>
        <span className="wr-chk-grade" data-g={c.grade.toLowerCase()}>{c.grade}</span>
        {c.note && <span className="wr-chk-reason">{c.note}</span>}
      </div>,
    ];
    rows.push(
      <CheckRow key="hook" label="Hook grade" tone={weak ? 'issues' : 'clean'}
        status={`${o.grade} / ${c.grade}`.toLowerCase()} items={items} />,
    );
  }

  if (subtext && subtext.status !== 'empty') {
    const flags: string[] = Array.isArray(subtext.flags) ? subtext.flags : [];
    if (subtext.status === 'failed') {
      rows.push(<CheckRow key="sub" label="Subtext" tone="skip" status="—" />);
    } else {
      const items = flags.map((f, i) => {
        const [q, r] = splitDash(f);
        return <ExcerptItem key={i} quote={stripQuotes(q)} reason={r} />;
      });
      rows.push(
        <CheckRow key="sub" label="Subtext" tone={flags.length ? 'issues' : 'clean'}
          status={flags.length ? flags.length : 'clean'} items={items} />,
      );
    }
  }

  if (voice && voice.status !== 'empty') {
    const flags: string[] = Array.isArray(voice.flags) ? voice.flags : [];
    if (voice.status === 'skipped' || voice.status === 'failed') {
      rows.push(<CheckRow key="voice" label="Voice" tone="skip"
        status={voice.status === 'skipped' ? 'no arcs' : '—'} />);
    } else {
      const items = flags.map((f, i) => {
        const [who, r] = splitDash(f);
        return (
          <div className="wr-chk-item" key={i}>
            <span className="wr-chk-name">{who}</span>
            {r && <span className="wr-chk-reason">{r}</span>}
          </div>
        );
      });
      rows.push(
        <CheckRow key="voice" label="Voice" tone={flags.length ? 'issues' : 'clean'}
          status={flags.length ? flags.length : 'on-arc'} items={items} />,
      );
    }
  }

  if (!rows.length) return null;
  return (
    <div className="wr-checks">
      <div className="wr-checks-cap">Scene checks</div>
      {rows}
    </div>
  );
}

export function MarginaliaPanel({
  focusedScene,
  sceneIndex,
  sceneContent,
  projectId,
  characters,
  braindumps,
  worldbuildings,
  pipelines = [],
  onTogglePipeline,
}: Props) {
  const nounLookup = useMemo(
    () => buildNounLookup(characters, worldbuildings),
    [characters, worldbuildings],
  );
  const resolveNouns = focusedScene?.analysis?.resolve_nouns;
  const povPurity = focusedScene?.analysis?.pov_purity;
  const hookGrade = focusedScene?.analysis?.hook_grade;
  const subtext = focusedScene?.analysis?.subtext;
  const voice = focusedScene?.analysis?.voice;
  const marginaliaItems = focusedScene?.marginalia ?? [];

  // Inline refs (prose mentions / spanRefs) + dangling EntityLinks (scene→entity
  // rows without an inline anchor — created from the AttachLinkPicker below).
  // Dangling links carry a flag so the gloss can show them as such; if a link
  // happens to exist both inline AND as an EntityLink row, the inline ref wins.
  const resolvedRefs = useMemo(() => {
    const inline = resolveRefs(
      extractRefsFromDoc(sceneContent),
      characters,
      braindumps,
      worldbuildings,
    );
    const seen = new Set(inline.map((r) => r.key));
    const danglingDocRefs: DocRef[] = [];
    for (const el of focusedScene?.entity_links ?? []) {
      const et = el.link_type as EntityType;
      if (et !== 'character' && et !== 'braindump' && et !== 'worldbuilding') continue;
      const key = `${et}-${el.link_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      danglingDocRefs.push({ entityType: et, id: el.link_id });
    }
    const dangling = resolveRefs(danglingDocRefs, characters, braindumps, worldbuildings)
      .map((r) => ({ ...r, dangling: true }));
    return [...inline, ...dangling];
  }, [sceneContent, focusedScene?.entity_links, characters, braindumps, worldbuildings]);

  // Already-linked set (inline + dangling) — feeds the picker so the same
  // braindump / world entry can't be attached twice.
  const alreadyLinked = useMemo(
    () => new Set(resolvedRefs.map((r) =>
      `${r.type === 'char' ? 'character' : r.type === 'world' ? 'worldbuilding' : 'braindump'}-` +
      r.key.split('-').slice(1).join('-'),
    )),
    [resolvedRefs],
  );

  const hoveredEntityKey = useWriteStore((s) => s.hoveredEntityKey);
  const totalCount = marginaliaItems.length + resolvedRefs.length;
  const hasItems = totalCount > 0;

  // When nothing is linked yet, surface a few notes the author could pull in —
  // a faint hint, not a call to action. Mentioning one in the prose is what
  // actually links it; this just shows what's nearby to reach for.
  const linkHints = useMemo(() => {
    const pick = (list: any[], et: EntityType, fallback: string) =>
      (list ?? []).slice(0, 3).map((x: any) => ({
        key: `${et}-${x.id}`,
        type: TYPE_CONFIG[et].type,
        gl: TYPE_CONFIG[et].gl,
        name: x.title ?? fallback,
      }));
    return [
      ...pick(braindumps, 'braindump', 'Untitled braindump'),
      ...pick(worldbuildings, 'worldbuilding', 'Untitled'),
    ];
  }, [braindumps, worldbuildings]);

  return (
    <aside className="wr-ctx">
      <section>
        <div className="wr-ctx-head">
          {/* <span>Marginalia</span> */}
          <span className="wr-ct mt-2">
            {hasItems ? `${totalCount} in scene` : ''}
          </span>
        </div>

        {focusedScene ? (
          <div className="wr-scene-tag">
            <span className="wr-num">SCENE {sceneIndex + 1}</span>
            <span>·</span>
            <span className="wr-nm">
              {focusedScene.text || 'untitled scene'}
            </span>
          </div>
        ) : (
          <div className="wr-scene-tag">
            <span className="wr-num">—</span>
            <span>·</span>
            <span className="wr-nm">no scene yet</span>
          </div>
        )}

        <PipelineToggles pipelines={pipelines} onToggle={onTogglePipeline} />

        {focusedScene && resolveNouns && (
          <ResolveNounsSection data={resolveNouns} nounLookup={nounLookup} />
        )}

        {focusedScene && (
          <SceneChecks
            povPurity={povPurity}
            hookGrade={hookGrade}
            subtext={subtext}
            voice={voice}
          />
        )}

        <div className="wr-glosses">
          {!hasItems ? (
            <div className="wr-glosses-empty">
              <div className="wr-glosses-empty-copy">
                <span className="wr-glosses-empty-kicker">No linked context yet</span>
                <p>
                  Pull in a braindump or world note for this scene to give the
                  rail something to track here.
                </p>
              </div>
              <AttachLinkPicker
                sceneId={focusedScene?.id ?? null}
                projectId={projectId}
                braindumps={braindumps}
                worldbuildings={worldbuildings}
                alreadyLinked={alreadyLinked}
              />
              {linkHints.length > 0 && (
                <div className="wr-gloss-hints">
                  <span className="wr-gloss-hints-cap">a few you could pull in</span>
                  {linkHints.map((h) => (
                    <div
                      key={h.key}
                      className="wr-gloss wr-gloss--hint"
                      data-type={h.type}
                    >
                      <span className="wr-gl">{h.gl}</span>
                      <span className="wr-gloss-hint-name">{h.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {resolvedRefs.map((r) => (
                <RefEntry key={r.key} item={r} isHovered={r.key === hoveredEntityKey} />
              ))}
              {marginaliaItems.map((item) => (
                <GlossEntry key={item.gid} item={item} />
              ))}
              <AttachLinkPicker
                sceneId={focusedScene?.id ?? null}
                projectId={projectId}
                braindumps={braindumps}
                worldbuildings={worldbuildings}
                alreadyLinked={alreadyLinked}
              />
            </>
          )}
        </div>
      </section>
    </aside>
  );
}
