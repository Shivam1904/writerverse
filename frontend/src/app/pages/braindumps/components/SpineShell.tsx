import { useCallback, useMemo, useState } from 'react';
import '../braindumps.css';
import { ChevronLeft, Layers } from 'lucide-react';
import { BraindumpsSubList } from '../../../sublists/BraindumpsRail';
import { useEntityTagIndex } from './entityTags';
import { Button } from '../../../ui';

const SPINE_KEY = 'wv2:spine-width';
const DEFAULT_W = 336;
const MIN_W = 220;
const MAX_W = 640;

function readSpineWidth(): number {
  try { const v = localStorage.getItem(SPINE_KEY); return v ? Number(v) : DEFAULT_W; }
  catch { return DEFAULT_W; }
}

export function useSpineWidth() {
  const [w, setW] = useState(readSpineWidth);

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = w;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      setW(Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setW((cur) => { try { localStorage.setItem(SPINE_KEY, String(cur)); } catch { /* */ } return cur; });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [w]);

  return { w, startDrag };
}

export function SpineShell({
  projectId,
  items,
  paneOpen,
  onToggle,
  onResizeStart,
}: {
  projectId: string;
  items: any[];
  paneOpen: boolean;
  onToggle: () => void;
  onResizeStart?: (e: React.PointerEvent) => void;
}) {
  const { colorOf } = useEntityTagIndex(projectId);

  const marks = useMemo(() => {
    if (!items.length) return [];
    const seen = new Map<string, number>();
    items.forEach((item: any, idx: number) => {
      for (const p of item.aiData?.phrases || []) {
        for (const ent of p?.entities || []) {
          const name = ent?.name;
          if (name && !seen.has(name)) seen.set(name, idx);
        }
      }
    });
    return [...seen.entries()].map(([name, idx]) => ({
      name,
      color: colorOf(`char[${name}]`) || colorOf(`loc[${name}]`) || colorOf(`item[${name}]`) || 'var(--ink-4)',
      top: ((idx + 0.5) / items.length) * 100,
    }));
  }, [items, colorOf]);

  return (
    <div className={`spine-shell${paneOpen ? ' is-open' : ''}`}>
      <div className={`spine-mini${paneOpen ? ' is-hidden' : ''}`} onClick={onToggle} style={{ cursor: 'pointer' }} title="Open idea tree">
        <span className="spine-tab">
          <Layers size={14} strokeWidth={1.8} />
        </span>
        <div className="spine-track">
          {marks.map((m, i) => (
            <span
              key={i}
              className="spine-mark"
              style={{ top: `${m.top}%`, background: m.color }}
              title={m.name}
            />
          ))}
        </div>
        <span className="spine-foot">{items.length}</span>
      </div>

      <div className={`spine-pane${paneOpen ? ' is-open' : ''}`}>
        <div className="spine-pane-head" 
            onClick={onToggle}
            >
          <div className="spine-pane-brand">
            <span className="spine-pane-mark">
              <Layers size={16} strokeWidth={1.8} />
            </span>
            <span className="spine-pane-titles">
              <b>Idea tree</b>
              <em>Tags &amp; sparks</em>
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="spine-pane-collapse"
            title="Collapse"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </Button>
        </div>
        <div className="spine-pane-body wv2-rail2">
          <BraindumpsSubList projectId={projectId} />
        </div>
        {onResizeStart && (
          <div className="spine-pane-resize" onPointerDown={onResizeStart} title="Drag to resize" />
        )}
      </div>
    </div>
  );
}
