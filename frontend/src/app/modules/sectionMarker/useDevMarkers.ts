import { create } from 'zustand';

/**
 * Dev section-marker toggle. Off by default; flipped from the (DEV-only) navbar
 * switch. Persisted to localStorage so it survives reloads during a dev session.
 * Every <SectionMarker> subscribes to `enabled` and renders null while off.
 */
const LS_KEY = 'wv2-dev-markers';

function load(): boolean {
  try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
}
function save(v: boolean) {
  try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

interface DevMarkersState {
  enabled: boolean;
  toggle: () => void;
  set: (v: boolean) => void;
}

export const useDevMarkers = create<DevMarkersState>((set) => ({
  enabled: load(),
  toggle: () => set((s) => { const next = !s.enabled; save(next); return { enabled: next }; }),
  set: (v) => { save(v); set({ enabled: v }); },
}));
