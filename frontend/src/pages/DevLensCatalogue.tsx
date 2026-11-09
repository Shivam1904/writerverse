/**
 * Dev-only lens catalogue browser — route: /dev/lens-catalogue
 *
 * Loads the real gauge bank + section lenses for a project and renders every lens
 * in a sortable, searchable table. Columns: name, type (arc/map/…), scope,
 * default rule, verdict style, y_items source, tier, origin, and the raw fields.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadCatalogue } from '../app/pages/gauges/api';
import { callOp } from '../app/gateway';
import { ARCHETYPE_TO_TYPE, LENS_TYPE, type LensTypeKey } from '../app/modules/lens/lensLibrary';

const PROJECT_ID = '4';

interface LensRow {
  id: string;
  name: string;
  type: LensTypeKey;
  typeLabel: string;
  typeGlyph: string;
  scopeType: string;
  rule: string;
  verdictStyle: string;
  ySource: string;
  tier: string;
  origin: string;
  section: string;
  sub: string;
  watches: string;
  good: string;
  problem: string;
  direction: string;
  intent: string;
  yItems: string[];
  yItemsJoined: string;
  raw: any;
}

type SortKey = keyof LensRow;
type SortDir = 'asc' | 'desc';

function resolveLensType(raw: any): LensTypeKey {
  const t = raw.type || raw.type_id;
  return ARCHETYPE_TO_TYPE[t] ?? (t as LensTypeKey) ?? 'arc';
}

function toLensRow(l: any, origin: string): LensRow {
  const type = resolveLensType(l);
  const meta = LENS_TYPE[type] ?? LENS_TYPE.arc;
  const yItems = (l.y_items || l.items || []).map((y: any) =>
    typeof y === 'string' ? y : y.value || '',
  );
  return {
    id: l.id || l.lens_id || l.slug || '?',
    name: l.name || l.watches || l.question || l.id || '?',
    type,
    typeLabel: meta.label,
    typeGlyph: meta.glyph,
    scopeType: l.scope_type || 'story',
    rule: l.math_rule || (l.judges === false || l.verdict_style === 'caption' ? 'none' : 'ai'),
    verdictStyle: l.verdict_style || (l.judges ? 'banner' : 'caption'),
    ySource: l.y_items_source || '—',
    tier: l.tier || '—',
    origin,
    section: l.section || '',
    sub: l.sub || '',
    watches: l.watches || l.description || '',
    good: l.good || '',
    problem: l.off || l.problem || '',
    direction: l.direction || '',
    intent: l.analyse_body || '',
    yItems,
    yItemsJoined: yItems.join(' → '),
    raw: l,
  };
}

const COLUMNS: { key: SortKey; label: string; w?: number }[] = [
  { key: 'id', label: 'ID', w: 160 },
  { key: 'name', label: 'Name', w: 260 },
  { key: 'type', label: 'Type', w: 100 },
  { key: 'scopeType', label: 'Scope', w: 100 },
  { key: 'rule', label: 'Rule', w: 110 },
  { key: 'verdictStyle', label: 'Verdict', w: 80 },
  { key: 'ySource', label: 'Y source', w: 100 },
  { key: 'tier', label: 'Tier', w: 70 },
  { key: 'origin', label: 'Origin', w: 80 },
  { key: 'section', label: 'Section', w: 100 },
  // { key: 'yItemsJoined', label: 'Y items', w: 200 },
  { key: 'intent', label: 'AI intent', w: 240 },
];

const TYPE_COLOR: Record<string, string> = {
  arc: '#16a34a', map: '#0891b2', checklist: '#2563eb', payoff: '#9333ea', tracker: '#ea580c',
};
const SCOPE_COLOR: Record<string, string> = {
  story: '#2563eb', character: '#16a34a', relationship: '#9333ea', object: '#ea580c', place: '#0e7490',
};
const RULE_COLOR: Record<string, string> = {
  ai: '#9333ea', rising: '#16a34a', falling: '#ef4444', flat: '#6b7280', arc: '#f59e0b',
  oscillate: '#0891b2', none: '#94a3b8',
};

function Pill({ text, bg }: { text: string; bg?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: bg ? `${bg}18` : '#f1f5f9', color: bg || '#334155', border: `1px solid ${bg || '#cbd5e1'}40`,
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

function ExpandedRow({ row }: { row: LensRow }) {
  return (
    <tr>
      <td colSpan={COLUMNS.length} style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 12, lineHeight: 1.6 }}>
          {row.watches && <div><b>Watches:</b> {row.watches}</div>}
          {row.direction && <div><b>Direction:</b> {row.direction}</div>}
          {row.good && <div><b>Good:</b> {row.good}</div>}
          {row.problem && <div><b>Problem:</b> {row.problem}</div>}
          {row.yItems.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <b>Y items ({row.yItems.length}):</b>{' '}
              {row.yItems.map((y, i) => <span key={i} style={{ marginRight: 6, padding: '0 4px', background: '#e2e8f0', borderRadius: 3, fontSize: 11 }}>{y}</span>)}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function DevLensCatalogue() {
  const [bank, setBank] = useState<any>(null);
  const [sectionLenses, setSectionLenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('type');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>('');
  const [filterScope, setFilterScope] = useState<string>('');
  const [filterOrigin, setFilterOrigin] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const [b, sl] = await Promise.all([
          loadCatalogue(PROJECT_ID),
          callOp(PROJECT_ID, 'get_section_lenses', {}, 'Gauges').then((r: any) => r?.templates ?? []),
        ]);
        setBank(b);
        setSectionLenses(sl);
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(() => {
    if (!bank) return [];
    const bankRows = (bank.templates || []).map((l: any) => toLensRow(l, 'bank'));
    const sectionRows = sectionLenses.map((l: any) => toLensRow(l, 'section'));
    return [...bankRows, ...sectionRows];
  }, [bank, sectionLenses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows
      .filter((r) => {
        if (filterType && r.type !== filterType) return false;
        if (filterScope && r.scopeType !== filterScope) return false;
        if (filterOrigin && r.origin !== filterOrigin) return false;
        if (!q) return true;
        return (
          r.id.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.watches.toLowerCase().includes(q) ||
          r.scopeType.toLowerCase().includes(q) ||
          r.rule.toLowerCase().includes(q) ||
          r.intent.toLowerCase().includes(q) ||
          r.yItemsJoined.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const av = String((a as any)[sortKey] ?? '');
        const bv = String((b as any)[sortKey] ?? '');
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
  }, [rows, search, sortKey, sortDir, filterType, filterScope, filterOrigin]);

  const uniqueTypes = useMemo(() => [...new Set(rows.map((r) => r.type))].sort(), [rows]);
  const uniqueScopes = useMemo(() => [...new Set(rows.map((r) => r.scopeType))].sort(), [rows]);
  const uniqueOrigins = useMemo(() => [...new Set(rows.map((r) => r.origin))].sort(), [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleExpand = (id: string) => setExpanded((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Lens Catalogue — Dev Inspector</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Project {PROJECT_ID} · {rows.length} lenses ({rows.filter((r) => r.origin === 'bank').length} bank, {rows.filter((r) => r.origin === 'section').length} section)
        · click a row to expand
      </p>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading catalogue…</div>}
      {error && <div style={{ padding: 20, color: '#ef4444' }}>Error: {error}</div>}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text" placeholder="Search lenses…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, width: 260 }}
            />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>
              <option value="">All types</option>
              {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterScope} onChange={(e) => setFilterScope(e.target.value)}
              style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>
              <option value="">All scopes</option>
              {uniqueScopes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)}
              style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>
              <option value="">All origins</option>
              {uniqueOrigins.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} shown</span>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                  {COLUMNS.map((col) => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      style={{
                        padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11,
                        textTransform: 'uppercase', letterSpacing: '.04em', color: '#475569',
                        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                        width: col.w,
                      }}>
                      {col.label} {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <>
                    <tr key={row.id} onClick={() => toggleExpand(row.id)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: expanded.has(row.id) ? '#f8fafc' : undefined }}>
                      <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{row.id}</td>
                      <td style={{ padding: '6px 12px', fontWeight: 500 }}>{row.name}</td>
                      <td style={{ padding: '6px 12px' }}><Pill text={`${row.typeGlyph} ${row.typeLabel}`} bg={TYPE_COLOR[row.type]} /></td>
                      <td style={{ padding: '6px 12px' }}><Pill text={row.scopeType} bg={SCOPE_COLOR[row.scopeType]} /></td>
                      <td style={{ padding: '6px 12px' }}><Pill text={row.rule} bg={RULE_COLOR[row.rule]} /></td>
                      <td style={{ padding: '6px 12px', color: row.verdictStyle === 'banner' ? '#16a34a' : '#94a3b8' }}>
                        {row.verdictStyle === 'banner' ? '✓ judged' : '— map'}
                      </td>
                      <td style={{ padding: '6px 12px', color: '#64748b' }}>{row.ySource}</td>
                      <td style={{ padding: '6px 12px', color: '#64748b' }}>{row.tier}</td>
                      <td style={{ padding: '6px 12px' }}><Pill text={row.origin} /></td>
                      <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>
                        {row.section}{row.sub ? `:${row.sub}` : ''}
                      </td>
                      {/* <td style={{ padding: '6px 12px', fontSize: 11, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={row.yItemsJoined}>{row.yItemsJoined || '—'}</td> */}
                      <td style={{ padding: '6px 12px', fontSize: 11, color: '#64748b', maxWidth: 240 }}
                        title={row.intent}>{row.intent || '—'}</td>
                    </tr>
                    {expanded.has(row.id) && <ExpandedRow key={`${row.id}-exp`} row={row} />}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
