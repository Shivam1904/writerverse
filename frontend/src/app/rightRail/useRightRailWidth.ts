import { useCallback, useEffect, useState } from 'react';

/**
 * Per-route resizable + persisted width for the right rail. Drag updates live, release persists
 * to localStorage keyed by route, so each page remembers its own width.
 */
const MIN_W = 210;
const MAX_W = 640;
// v2 — invalidates old per-route widths (220 / 280 / 340 / 440 …) so every
// route now starts at the unified RAIL_WIDTH from registry.ts.
const widthKey = (routeKey: string) => `wv2:right-rail-width:v2:${routeKey}`;

function readWidth(routeKey: string, fallback: number): number {
  try {
    const v = localStorage.getItem(widthKey(routeKey));
    return v ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

export function useRightRailWidth(routeKey: string, defaultWidth: number) {
  const [w, setW] = useState<number>(() => readWidth(routeKey, defaultWidth));

  // Re-read when the route (and thus the remembered width) changes.
  useEffect(() => {
    setW(readWidth(routeKey, defaultWidth));
  }, [routeKey, defaultWidth]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = readWidth(routeKey, defaultWidth);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      // Handle sits on the LEFT edge, so dragging left widens the rail.
      const onMove = (ev: PointerEvent) => {
        setW(Math.min(MAX_W, Math.max(MIN_W, startW - (ev.clientX - startX))));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setW((cur) => {
          try { localStorage.setItem(widthKey(routeKey), String(cur)); } catch { /* ignore */ }
          return cur;
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [routeKey, defaultWidth],
  );

  return { w, startDrag };
}
