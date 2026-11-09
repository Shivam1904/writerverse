/**
 * Dev-only log viewer — route: /dev/logs?filter=nighteyes
 *
 * Renders the Night Eyes activity stream (db/logs/consistency.log) as a structured,
 * color-coded event feed rather than a raw text dump. Backed by
 * GET /api/consistency/dev/logs/ (see backend/actions/dev_logs.py).
 *
 *  - ?filter=  selects the source (nighteyes → consistency.log). Default nighteyes.
 *  - "AI only ⇄ Everything" toggle drives the backend `mode` (ai drops the ~40k
 *    user_button READ lines; all returns the full stream).
 *  - A poll/manual switch: poll appends new lines every ~3s via a byte cursor;
 *    manual gives you a Refresh button instead.
 *
 * Throwaway dev tool: loosely typed, no auth, read-only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './devLogs.css';

const KIND_LABEL: Record<string, string> = {
  llm: 'llm', token: 'token', dispatch: 'dispatch',
  commit: 'commit', error: 'error', other: 'log',
};
const ROUTE_HUE: Record<string, string> = {
  READ: '#6b7280', WROTE: '#16a34a', WRITE: '#16a34a',
  PROPOSE: '#2563eb', REJECT: '#dc2626', RUN: '#9333ea', RAN: '#9333ea',
};

const POLL_MS = 3000;
const MAX_ENTRIES = 6000;

function useQueryParam(name: string): string | null {
  const [v] = useState(() => new URLSearchParams(window.location.search).get(name));
  return v;
}

// ---- per-kind body renderers ----------------------------------------------

function RouteBadge({ route }: { route?: string }) {
  if (!route) return null;
  return (
    <span className="dl-route" style={{ background: ROUTE_HUE[route] || '#6b7280' }}>
      {route}
    </span>
  );
}

function Body({ e, open, onToggle }: { e: any; open: boolean; onToggle: () => void }) {
  const f = e.fields || {};
  if (e.kind === 'llm') {
    return (
      <span className="dl-body">
        <span className="dl-tag">{f.tag}</span>
        <span className="dl-sep">·</span>
        <span className="dl-role">{f.role}</span>
        {f.attempt && f.attempt !== '1' && <span className="dl-dim"> try {f.attempt}</span>}
        <span className="dl-sep">·</span>
        <span className="dl-dim">{f.req}</span>
        <span className="dl-arrow">→</span>
        <span className="dl-dim">{f.resp}</span>
      </span>
    );
  }
  if (e.kind === 'token') {
    return (
      <span className="dl-body">
        <span className="dl-spent">−{f.spent}</span>
        <span className="dl-dim"> tok</span>
        {f.project && <span className="dl-dim"> · p{f.project}</span>}
        {f.remaining && <span className="dl-dim"> · {Number(f.remaining).toLocaleString()} left</span>}
      </span>
    );
  }
  if (e.kind === 'dispatch') {
    return (
      <span className="dl-body">
        <RouteBadge route={f.route} />
        <span className="dl-cap">{f.capability}</span>
        {f.actor && <span className={`dl-actor dl-actor-${f.actor}`}>{f.actor}</span>}
      </span>
    );
  }
  if (e.kind === 'error') {
    const hasStack = e.extra && e.extra.length > 0;
    return (
      <span className={`dl-body dl-err ${hasStack ? 'dl-clickable' : ''}`} onClick={hasStack ? onToggle : undefined}>
        {hasStack && <span className="dl-caret">{open ? '▾' : '▸'}</span>}
        <span className="dl-mod">{e.module}</span>{' '}
        {e.msg}
        {hasStack && open && <pre className="dl-stack">{e.extra.join('\n')}</pre>}
      </span>
    );
  }
  if (e.kind === 'commit') {
    return (
      <span className="dl-body">
        <span className="dl-mod">{e.module}</span>{' '}
        <span className="dl-dim">{e.msg}</span>
      </span>
    );
  }
  return <span className="dl-body dl-dim">{e.msg}</span>;
}

function Row({ e, open, onToggle }: { e: any; open: boolean; onToggle: () => void }) {
  return (
    <div className={`dl-row dl-k-${e.kind} dl-lvl-${e.level}`}>
      <span className="dl-rail" />
      <span className="dl-time" title={e.ts}>{e.time}</span>
      <span className={`dl-badge dl-b-${e.kind}`}>{KIND_LABEL[e.kind] || e.kind}</span>
      <Body e={e} open={open} onToggle={onToggle} />
    </div>
  );
}

// ---- chip toggles ----------------------------------------------------------

function Chip({ label, on, onClick, count }: { label: string; on: boolean; onClick: () => void; count?: number }) {
  return (
    <button className={`dl-chip ${on ? 'on' : 'off'}`} onClick={onClick}>
      {label}{count != null && <span className="dl-chip-n">{count}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------

export default function DevLogs() {
  const filter = useQueryParam('filter') || 'nighteyes';
  const [entries, setEntries] = useState<any[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [mode, setMode] = useState<'ai' | 'all'>('ai');
  const [polling, setPolling] = useState(false);
  const [dropped, setDropped] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // hidden sets + search (client-side view filtering, within loaded entries)
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set());
  const [hiddenActors, setHiddenActors] = useState<Set<string>>(new Set());
  const [hideDebug, setHideDebug] = useState(false);
  const [search, setSearch] = useState('');
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());

  const keyRef = useRef(0);
  const cursorRef = useRef<number | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  cursorRef.current = cursor;

  const stamp = (arr: any[]) => arr.map((e) => ({ ...e, _k: keyRef.current++ }));

  const fetchLogs = useCallback(async (reset: boolean) => {
    setLoading(true);
    setErr(null);
    try {
      const params: any = { source: filter, mode };
      if (!reset && cursorRef.current != null) params.cursor = cursorRef.current;
      const r = await axios.get('/consistency/dev/logs/', { params });
      const fresh = stamp(r.data?.entries || []);
      setDropped((d) => (reset ? r.data?.dropped || 0 : d + (r.data?.dropped || 0)));
      setCursor(r.data?.cursor ?? null);
      setEntries((prev) => {
        const next = reset ? fresh : [...prev, ...fresh];
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
    } catch (ex: any) {
      setErr(ex?.response?.data?.error || ex?.message || 'failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [filter, mode]);

  // initial load + reload whenever mode/source changes
  useEffect(() => {
    setEntries([]);
    setCursor(null);
    cursorRef.current = null;
    fetchLogs(true);
  }, [filter, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // polling loop (paused when tab hidden)
  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      if (!document.hidden) fetchLogs(false);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [polling, fetchLogs]);

  // counts by kind/actor across loaded entries
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.kind] = (c[e.kind] || 0) + 1;
    return c;
  }, [entries]);
  const actorCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) {
      const a = e.fields?.actor;
      if (a) c[a] = (c[a] || 0) + 1;
    }
    return c;
  }, [entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (hiddenKinds.has(e.kind)) return false;
      if (hideDebug && e.level === 'DEBUG') return false;
      const a = e.fields?.actor;
      if (a && hiddenActors.has(a)) return false;
      if (q && !(e.raw || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, hiddenKinds, hiddenActors, hideDebug, search]);

  // newest first
  const displayed = useMemo(() => visible.slice().reverse(), [visible]);

  // newest is at the top — keep it in view while polling
  useEffect(() => {
    if (polling && streamRef.current) streamRef.current.scrollTop = 0;
  }, [displayed.length, polling]);

  const toggleSet = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(v)) { n.delete(v); } else { n.add(v); }
    setter(n);
  };

  const ALL_KINDS = ['llm', 'token', 'dispatch', 'commit', 'error', 'other'];

  return (
    <div className="dl-root">
      <header className="dl-head">
        <div className="dl-title">
          <span className="dl-eye">◉</span> Night Eyes — log stream
          <span className="dl-src">{filter}</span>
        </div>
        <div className="dl-controls">
          <div className="dl-seg">
            <button className={mode === 'ai' ? 'on' : ''} onClick={() => setMode('ai')}>AI only</button>
            <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>Everything</button>
          </div>
          <div className="dl-seg">
            <button className={!polling ? 'on' : ''} onClick={() => setPolling(false)}>Manual</button>
            <button className={polling ? 'on dl-live' : ''} onClick={() => setPolling(true)}>
              {polling ? '● Live' : 'Poll'}
            </button>
          </div>
          {!polling && (
            <button className="dl-refresh" onClick={() => fetchLogs(false)} disabled={loading}>
              ↻ Refresh
            </button>
          )}
          <button className="dl-refresh" onClick={() => { setEntries([]); setCursor(null); cursorRef.current = null; fetchLogs(true); }}>
            ⟲ Reload tail
          </button>
        </div>
      </header>

      <div className="dl-filters">
        {ALL_KINDS.map((k) => (
          <Chip key={k} label={KIND_LABEL[k]} count={kindCounts[k] || 0}
            on={!hiddenKinds.has(k)} onClick={() => toggleSet(hiddenKinds, k, setHiddenKinds)} />
        ))}
        <span className="dl-divider" />
        {Object.keys(actorCounts).sort().map((a) => (
          <Chip key={a} label={a} count={actorCounts[a]}
            on={!hiddenActors.has(a)} onClick={() => toggleSet(hiddenActors, a, setHiddenActors)} />
        ))}
        <span className="dl-divider" />
        <Chip label="DEBUG" on={!hideDebug} onClick={() => setHideDebug((v) => !v)} />
        <input className="dl-search" placeholder="search…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="dl-status">
        showing <b>{visible.length}</b> of {entries.length} loaded
        {mode === 'ai' && dropped > 0 && <span className="dl-dim"> · {dropped.toLocaleString()} read lines hidden</span>}
        {err && <span className="dl-error-msg"> · {err}</span>}
        {loading && <span className="dl-dim"> · loading…</span>}
      </div>

      <div className="dl-stream" ref={streamRef}>
        {displayed.length === 0 && !loading && (
          <div className="dl-empty">No matching log entries.</div>
        )}
        {displayed.map((e) => (
          <Row key={e._k} e={e} open={openRows.has(e._k)}
            onToggle={() => toggleSet(openRows as any, e._k as any, setOpenRows as any)} />
        ))}
      </div>
    </div>
  );
}
